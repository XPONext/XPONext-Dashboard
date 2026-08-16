-- ============================================================
-- SCHRITT 1 — Kunden und Umsätze
--
-- Legt die Tabellen `customers`, `revenues` und `tracker_options` an, koppelt
-- die Zeiteinträge an die Kunden und macht aus `zuordnung_optionen` eine Sicht
-- auf die Kundenliste. Danach pflegst du Kunden im Dashboard statt in der Datenbank,
-- und `popup.py` muss dafür NICHT neu installiert werden.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen.
--
-- Das Team-Passwort steht nirgends in dieser Datei: Abschnitt 0 liest die
-- Absicherung aus einer bestehenden Tabelle aus und wendet sie wörtlich auf
-- die neuen an. Dadurch sind alle Tabellen garantiert gleich geschützt, und
-- das Passwort muss nirgendwo hineinkopiert werden.
--
-- Ausführen: Supabase → SQL Editor → New query → alles einfügen → Run.
-- Das Skript ist wiederholbar: ein zweiter Lauf ändert nichts kaputt.
--
-- Supabase warnt beim Ausführen vor "destructive operations". Das ist richtig
-- und gewollt: Abschnitt 6 benennt zuordnung_optionen in
-- zuordnung_optionen_alt um. Die alte Tabelle bleibt dabei vollständig
-- erhalten, der Schritt ist also umkehrbar.
-- ============================================================


-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen
--
-- Legt eine Hilfsfunktion an, die eine Tabelle genauso absichert wie die
-- schon vorhandenen. Bricht mit einer klaren Meldung ab, wenn sich keine
-- Vorlage finden lässt — lieber gar nichts anlegen als etwas Ungeschütztes.
-- ------------------------------------------------------------
create or replace function public.xpo_policy_uebernehmen(ziel text)
returns void
language plpgsql
as $$
declare
  ausdruck text;
begin
  -- Vorlage: die Policy einer bestehenden Tabelle
  select p.qual into ausdruck
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('time_entries','daily_team','daily_personal','tasks')
    and p.qual is not null
  order by case p.tablename
             when 'time_entries' then 0 when 'daily_team' then 1 else 2 end
  limit 1;

  if ausdruck is null then
    raise exception
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neuen Tabellen dürfen nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;


-- ------------------------------------------------------------
-- 1) Kunden
--
-- `name` ist absichtlich der Text, den popup.py sendet — dadurch bleibt die
-- bestehende Spalte time_entries.zuordnung lesbar und die Historie erhalten.
-- `kind = 'intern'` sind die Pseudo-Kunden wie "XPO intern" oder
-- "Neukunden-Akquise": Zeit, die auf niemanden abrechenbar ist.
-- ------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kind        text not null default 'kunde'
              check (kind in ('kunde','intern')),
  status      text not null default 'aktiv'
              check (status in ('aktiv','pausiert','beendet')),
  note        text,
  active      boolean not null default true,   -- steuert die Sichtbarkeit im Popup
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists customers_aktiv_idx
  on public.customers (active, sort_order);

-- RLS ausdruecklich hier einschalten, obwohl die Hilfsfunktion es ohnehin tut.
-- Die Pruefung im Supabase-Editor sieht nicht in Funktionen hinein und warnt
-- sonst bei jedem Durchlauf vor angeblich ungeschuetzten Tabellen.
alter table public.customers enable row level security;
select public.xpo_policy_uebernehmen('customers');


-- ------------------------------------------------------------
-- 2) Umsätze
--
--   kind = 'retainer'  -> `amount` ist der Betrag PRO MONAT, ab period_start
--                         bis period_end (NULL = läuft weiter)
--   kind = 'einmalig'  -> `amount` ist der GESAMTbetrag für den Zeitraum
--                         [period_start, period_end]
--
-- Zwei Arten in einer Tabelle, weil beide dasselbe beantworten: Wie viel
-- Umsatz entfällt auf welchen Monat? Die Sicht in Abschnitt 3 rechnet das aus.
-- ------------------------------------------------------------
create table if not exists public.revenues (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete restrict,
  kind          text not null check (kind in ('retainer','einmalig')),
  title         text,
  amount        numeric(12,2) not null check (amount >= 0),
  period_start  date not null,
  period_end    date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint zeitraum_plausibel
    check (period_end is null or period_end >= period_start),
  constraint einmalig_braucht_ende
    check (kind <> 'einmalig' or period_end is not null)
);

create index if not exists revenues_kunde_idx
  on public.revenues (customer_id, period_start);

alter table public.revenues enable row level security;
select public.xpo_policy_uebernehmen('revenues');


-- ------------------------------------------------------------
-- 3) Umsatz auf Monate normalisieren
--
-- Retainer werden auf ihre Monate ausgerollt, Einmalbeträge gleichmäßig über
-- ihren Zeitraum verteilt. Dashboard und spätere Auswertungen rechnen damit
-- garantiert gleich — sonst rechnet jede Stelle anders.
--
-- Ein laufender Retainer ohne Enddatum wird bis zum heutigen Monat ausgerollt.
-- Zwei bewusste Ungenauigkeiten: Die Rundung je Monat kann Cent verlieren
-- (1.000 EUR auf 3 Monate = 3 x 333,33 = 999,99), und ein angebrochener
-- Endmonat zaehlt voll. Beides ist fuer die Frage "was verdiene ich pro
-- Stunde" ohne Bedeutung.
-- ------------------------------------------------------------
create or replace view public.revenue_months
with (security_invoker = on) as
select
  r.customer_id,
  r.id      as revenue_id,
  r.kind,
  m::date   as month_start,
  (m + interval '1 month - 1 day')::date as month_end,
  case
    when r.kind = 'retainer' then r.amount
    else round(
      r.amount / greatest(1, (
          (date_part('year',  age(date_trunc('month', r.period_end),
                                  date_trunc('month', r.period_start))) * 12)
        + date_part('month', age(date_trunc('month', r.period_end),
                                  date_trunc('month', r.period_start)))
        + 1))::numeric, 2)
  end as amount
from public.revenues r
cross join lateral generate_series(
    date_trunc('month', r.period_start),
    date_trunc('month', coalesce(r.period_end, current_date)),
    interval '1 month') as m;

grant select on public.revenue_months to anon, authenticated;


-- ------------------------------------------------------------
-- 4) Zeiteinträge an Kunden koppeln — ohne popup.py anzufassen
--
-- Der Trigger löst den gesendeten Text zur customer_id auf. Die Textspalte
-- `zuordnung` bleibt als Rohwert erhalten und wird NIE gelöscht: Sie ist der
-- Beleg dafür, was der Tracker tatsächlich geschickt hat. Ein reiner Textabgleich
-- würde bei jeder Umbenennung eines Kunden die Historie zerreißen.
-- ------------------------------------------------------------
-- on delete set null: Wird ein Kunde geloescht, bleiben seine Zeiteintraege
-- erhalten und verlieren nur die Verknuepfung. Ohne diese Angabe waere das
-- Loeschen eines Kunden mit getrackter Zeit schlicht unmoeglich gewesen.
alter table public.time_entries
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

-- Falls die Spalte aus einem frueheren Lauf schon ohne "on delete set null"
-- existiert: Regel nachziehen.
do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'time_entries'
    and con.contype = 'f'
    and con.confdeltype <> 'n'                                  -- 'n' = set null
    and con.conkey = (
      select array_agg(attnum) from pg_attribute
      where attrelid = rel.oid and attname = 'customer_id');
  if fk_name is not null then
    execute format('alter table public.time_entries drop constraint %I', fk_name);
    alter table public.time_entries
      add constraint time_entries_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end $$;

create index if not exists time_entries_kunde_idx
  on public.time_entries (customer_id, ts);

-- Kein security definer noetig: anon darf customers mit dem Header ohnehin
-- lesen. Ohne definer ist die Funktion nicht mehr als Rechteerweiterung
-- missbrauchbar.
create or replace function public.resolve_customer()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.customer_id := null;
  if new.zuordnung is not null and trim(new.zuordnung) <> '' then
    select c.id into new.customer_id
    from public.customers c
    where lower(c.name) = lower(trim(new.zuordnung))
    limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_resolve_customer on public.time_entries;
create trigger trg_resolve_customer
  before insert or update of zuordnung on public.time_entries
  for each row execute function public.resolve_customer();

-- Zu wissen: Der Trigger feuert nur, wenn `zuordnung` mitgeschrieben wird.
-- Wer customer_id von Hand umhaengt, ohne zuordnung anzufassen, behaelt seinen
-- Wert — bis zum naechsten Schreibvorgang, der zuordnung mitschickt. Dann
-- gewinnt wieder der Text. Der Text ist bewusst die fuehrende Quelle.


-- ------------------------------------------------------------
-- 5) Bestand übernehmen
--
-- Erst die gepflegte Optionsliste, dann alles, was sonst noch in den
-- Zeiteinträgen auftaucht. Letzteres kommt auf active = false und
-- sort_order = 900 — es taucht also nicht im Popup auf, geht aber auch
-- nicht verloren. Was davon ein echter Kunde ist, stellst du im Dashboard um.
-- ------------------------------------------------------------
-- Quelle ist die alte Tabelle. Beim ersten Lauf heisst sie noch
-- zuordnung_optionen, ab dem zweiten zuordnung_optionen_alt — deshalb
-- dynamisch, damit das Skript wiederholbar bleibt.
do $$
declare
  quelle text;
begin
  select c.relname into quelle
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('zuordnung_optionen','zuordnung_optionen_alt')
  order by case c.relname when 'zuordnung_optionen' then 0 else 1 end
  limit 1;

  if quelle is not null then
    execute format($f$
      insert into public.customers (name, kind, active, sort_order)
      select z.name,
             case when lower(z.name) in ('xpo','xpo intern','intern','neukunden',
                                         'neukunden-akquise','sonstiges','pause')
                  then 'intern' else 'kunde' end,
             z.active, z.sort_order
      from public.%I z
      on conflict (name) do nothing $f$, quelle);
  end if;
end $$;

insert into public.customers (name, kind, active, sort_order, note)
select distinct
  trim(t.zuordnung),
  case when lower(trim(t.zuordnung)) in ('xpo','xpo intern','intern','neukunden',
                                         'neukunden-akquise','sonstiges','pause')
       then 'intern' else 'kunde' end,
  false,
  900,
  'Automatisch aus bestehenden Zeiteinträgen übernommen'
from public.time_entries t
where t.zuordnung is not null
  and trim(t.zuordnung) <> ''
  and not exists (
    select 1 from public.customers c
    where lower(c.name) = lower(trim(t.zuordnung))
  )
on conflict (name) do nothing;

-- Altdaten nachträglich verknüpfen (der Trigger greift nur bei neuen Zeilen)
update public.time_entries t
set customer_id = c.id
from public.customers c
where t.customer_id is null
  and t.zuordnung is not null
  and lower(trim(t.zuordnung)) = lower(c.name);


-- ------------------------------------------------------------
-- 6) zuordnung_optionen wird zur Sicht auf die Kundenliste
--
-- Damit zieht popup.py die Liste weiterhin unverändert — die alte URL
--   .../rest/v1/zuordnung_optionen?select=name&active=eq.true&order=sort_order.asc
-- funktioniert genauso wie vorher. Kein Rollout auf beiden Macs nötig.
--
-- Die alte Tabelle bleibt als `zuordnung_optionen_alt` mindestens vier Wochen
-- stehen. Erst löschen, wenn alles nachweislich läuft.
--
-- `security_invoker = on` sorgt dafür, dass die RLS von customers greift.
-- ------------------------------------------------------------
-- Nur umbenennen, wenn zuordnung_optionen noch eine echte TABELLE ist.
-- Ohne diesen Schutz wuerde ein zweiter Lauf versuchen, die inzwischen
-- angelegte View umzubenennen: Im SQL-Editor laeuft alles in einer
-- Transaktion, der Fehler haette also den kompletten Durchlauf
-- zurueckgerollt — und im schlechteren Fall die View weggezogen und
-- popup.py stillschweigend lahmgelegt.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'zuordnung_optionen'
      and c.relkind = 'r'          -- r = ordinary table, v = view
  ) then
    alter table public.zuordnung_optionen rename to zuordnung_optionen_alt;
  end if;
end $$;

create or replace view public.zuordnung_optionen
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.active,
  c.sort_order
from public.customers c
where c.status <> 'beendet';

grant select on public.zuordnung_optionen to anon, authenticated;


-- ------------------------------------------------------------
-- 6b) Kategorien des Zeittrackers in die Datenbank
--
-- Bisher stehen "State" und "Aktivität" fest in popup.py. Jede Änderung
-- bedeutet deshalb: install.sh auf BEIDEN Macs neu ausführen, und bis Simon
-- das gemacht hat, schreibt seine Version weiter die alten Namen.
--
-- Mit dieser Tabelle ist das vorbei: Kategorien ändern heißt ab dann eine
-- Zeile hier ändern. Das Popup zieht sie beim nächsten Öffnen.
--
-- Die States sind von sieben auf fünf gekürzt: "Strategie" und "Weiterbilden"
-- bildet der Kunde "XPO intern" ab. Alte Einträge behalten ihre Werte und
-- werden im Dashboard weiterhin angezeigt.
-- ------------------------------------------------------------
create table if not exists public.tracker_options (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('state','aktivitaet')),
  name        text not null,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  unique (kind, name)
);

alter table public.tracker_options enable row level security;
select public.xpo_policy_uebernehmen('tracker_options');

insert into public.tracker_options (kind, name, active, sort_order) values
  ('state','Deepwork',      true,  10),
  ('state','Kommunikation', true,  20),
  ('state','Abarbeiten',    true,  30),
  ('state','Planung',       true,  40),
  ('state','Sonstiges',     true,  50),
  -- Nicht mehr zur Auswahl, aber als Bezeichnung erhalten, damit alte
  -- Einträge lesbar bleiben:
  ('state','Strategie',     false, 60),
  ('state','Weiterbilden',  false, 70)
on conflict (kind, name) do nothing;


-- ------------------------------------------------------------
-- 6c) Rechte
--
-- Die Policies regeln, WER was darf; der grant regelt, ob die Rolle die
-- Tabelle ueberhaupt ansprechen darf. In einer unveraenderten Supabase-Instanz
-- ist das meist schon voreingestellt — explizit gesetzt schliesst es den Fall
-- "leere Liste statt Fehlermeldung" sicher aus.
-- ------------------------------------------------------------
grant select, insert, update, delete
  on public.customers, public.revenues, public.tracker_options
  to anon, authenticated;


-- ------------------------------------------------------------
-- 6d) Hilfsfunktion wieder entfernen — sie wurde nur zum Anlegen gebraucht
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);


-- ------------------------------------------------------------
-- 7) Gegenprobe — nach dem Ausführen ansehen
-- ------------------------------------------------------------

-- WICHTIGSTE PRÜFUNG: Sind alle drei neuen Tabellen abgesichert?
-- In der Spalte "geschuetzt" muss überall "ja" stehen. Steht irgendwo "NEIN",
-- sofort melden und die Tabellen nicht benutzen.
select
  t.tabelle,
  case when p.policyname is not null then 'ja' else 'NEIN — ungeschützt!' end as geschuetzt,
  c.relrowsecurity as rls_an
from (values ('customers'),('revenues'),('tracker_options')) as t(tabelle)
left join pg_class c
  on c.relname = t.tabelle
 and c.relnamespace = 'public'::regnamespace
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.tabelle;


-- Wurden alle Zeiteinträge verknüpft? "offen" sollte 0 sein
-- (außer bei Einträgen ganz ohne Zuordnung, z.B. Pausen).
select
  count(*)                                              as gesamt,
  count(customer_id)                                    as verknuepft,
  count(*) filter (where customer_id is null
                     and coalesce(trim(zuordnung),'') <> '') as offen
from public.time_entries;

-- Wie sieht die Kundenliste aus?
select name, kind, status, active, sort_order
from public.customers
order by kind, sort_order, name;

-- Liefert die Sicht dasselbe wie vorher die Tabelle?
select name, active, sort_order
from public.zuordnung_optionen
where active = true
order by sort_order asc;

-- Welche States stehen im Popup zur Auswahl?
select name, active, sort_order
from public.tracker_options
where kind = 'state'
order by sort_order;


-- ============================================================
-- ZUM SCHLUSS, BEVOR DAS DASHBOARD AUSGELIEFERT WIRD:
--
-- Die Popup-Abfrage mit den echten Kopfzeilen testen. Erst wenn hier eine
-- Liste zurückkommt, ist der Schritt fertig:
--
--   for pfad in \
--     "zuordnung_optionen?select=name&active=eq.true&order=sort_order.asc" \
--     "customers?select=name,kind" \
--     "revenue_months?select=customer_id,month_start,amount" \
--     "tracker_options?select=name&kind=eq.state"
--   do
--     echo "--- $pfad"
--     curl -s "$SUPABASE_URL/rest/v1/$pfad" \
--       -H "apikey: $SUPABASE_ANON_KEY" \
--       -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
--       -H "x-app-secret: $APP_SECRET"
--     echo
--   done
--
-- (Die Werte stehen in time_tracker/.env)
-- ============================================================
