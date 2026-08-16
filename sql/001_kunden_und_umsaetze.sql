-- ============================================================
-- SCHRITT 1 — Kunden und Umsätze
--
-- Legt die Tabellen `customers`, `revenues` und `tracker_options` an, koppelt
-- die Zeiteinträge an die Kunden und macht aus `zuordnung_optionen` eine Sicht
-- auf die Kundenliste. Danach pflegst du Kunden im Dashboard statt in der Datenbank,
-- und `popup.py` muss dafür NICHT neu installiert werden.
--
-- VORHER: sql/000_inventur.sql ausführen und die Ergebnisse ansehen.
--
-- WICHTIG — vor dem Ausführen eine Sache ersetzen:
--   Überall steht `<APP_SECRET>` als Platzhalter. Setz dort die Formulierung
--   ein, die die Inventur-Abfrage 4 für die bestehenden Tabellen zeigt.
--   Steht dort z.B.
--       (current_setting('request.headers', true)::json ->> 'x-app-secret') = 'euerGeheimnis'
--   dann muss hier exakt dasselbe stehen. Nicht abweichend formulieren —
--   sonst sind die neuen Tabellen anders abgesichert als die alten.
--
-- Ausführen: Supabase → SQL Editor → einfügen → Run.
-- Die Abschnitte laufen in dieser Reihenfolge und sind einzeln wiederholbar.
-- ============================================================


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

alter table public.customers enable row level security;

drop policy if exists "app_secret_all" on public.customers;
create policy "app_secret_all" on public.customers
  for all
  using      (<APP_SECRET>)
  with check (<APP_SECRET>);


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

drop policy if exists "app_secret_all" on public.revenues;
create policy "app_secret_all" on public.revenues
  for all
  using      (<APP_SECRET>)
  with check (<APP_SECRET>);


-- ------------------------------------------------------------
-- 3) Umsatz auf Monate normalisieren
--
-- Retainer werden auf ihre Monate ausgerollt, Einmalbeträge gleichmäßig über
-- ihren Zeitraum verteilt. Dashboard und spätere Auswertungen rechnen damit
-- garantiert gleich — sonst rechnet jede Stelle anders.
--
-- Ein laufender Retainer ohne Enddatum wird bis zum heutigen Monat ausgerollt.
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
alter table public.time_entries
  add column if not exists customer_id uuid references public.customers(id);

create index if not exists time_entries_kunde_idx
  on public.time_entries (customer_id, ts);

create or replace function public.resolve_customer()
returns trigger
language plpgsql
security definer
set search_path = public
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


-- ------------------------------------------------------------
-- 5) Bestand übernehmen
--
-- Erst die gepflegte Optionsliste, dann alles, was sonst noch in den
-- Zeiteinträgen auftaucht. Letzteres kommt auf active = false und
-- sort_order = 900 — es taucht also nicht im Popup auf, geht aber auch
-- nicht verloren. Was davon ein echter Kunde ist, stellst du im Dashboard um.
-- ------------------------------------------------------------
insert into public.customers (name, kind, active, sort_order)
select
  z.name,
  case when lower(z.name) in ('xpo','xpo intern','intern','neukunden',
                              'neukunden-akquise','sonstiges','pause')
       then 'intern' else 'kunde' end,
  z.active,
  z.sort_order
from public.zuordnung_optionen z
on conflict (name) do nothing;

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
alter table if exists public.zuordnung_optionen
  rename to zuordnung_optionen_alt;

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

drop policy if exists "app_secret_all" on public.tracker_options;
create policy "app_secret_all" on public.tracker_options
  for all
  using      (<APP_SECRET>)
  with check (<APP_SECRET>);

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
-- 7) Gegenprobe — nach dem Ausführen ansehen
-- ------------------------------------------------------------

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
--   curl -s "$SUPABASE_URL/rest/v1/zuordnung_optionen?select=name&active=eq.true&order=sort_order.asc" \
--     -H "apikey: $SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
--     -H "x-app-secret: $APP_SECRET"
--
-- (Die Werte stehen in time_tracker/.env)
-- ============================================================
