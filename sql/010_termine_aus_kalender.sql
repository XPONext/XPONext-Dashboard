-- ============================================================
-- 010 — Termine aus dem Close-Kalender
--
-- Bis hierher zählte das Dashboard jeden neu angelegten „Meeting …"-Task in
-- Close als gebuchten Termin (daily_meetings). Das waren zu viele: Folge- und
-- Kundentermine zählten mit, jedes Verschieben war eine neue Buchung, und
-- Absagen galten als Show-up. Vom 21. bis 30.09.2026 standen 16 gebuchte
-- Termine im Dashboard — tatsächlich waren es 6 Erstgespräche.
--
-- Jetzt kommt jeder Kalendertermin aus Close als eigene Zeile hierher. Der
-- Abgleich läuft auf Railway (tools/vertrieb_sync/termine.py im Workflow-Repo)
-- und schlägt je Termin ein Ergebnis vor. Was davon ein Erstgespräch ist,
-- rechnet das Dashboard selbst (js/state.js).
--
-- daily_meetings bleibt stehen, wird aber nicht mehr gelesen.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen
--
-- Dieselbe Wegwerf-Hilfsfunktion wie in sql/009: liest die Policy einer
-- bestehenden Tabelle und überträgt sie. Ohne Vorlage bricht sie ab — lieber
-- gar nichts anlegen als etwas Ungeschütztes.
-- ------------------------------------------------------------
create or replace function public.xpo_policy_uebernehmen(ziel text)
returns void
language plpgsql
as $$
declare
  ausdruck text;
begin
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
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neue Tabelle darf nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;

-- ------------------------------------------------------------
-- 1) Ein Termin je Zeile
--
--   id               cal_<Kalender-ID> aus Close, hand_<…> für von Hand
--                    nachgetragene Termine ohne Einladung
--   booked_at        wann der Termin in Close angelegt wurde = Buchungstag
--   outcome          Vorschlag des Abgleichs, wird bei jedem Lauf neu gesetzt
--   outcome_reason   warum — steht im Dashboard neben dem Termin
--   client_since     Tag des ersten gewonnenen Auftrags dieses Leads in Close;
--                    Termine danach sind Kundentermine
--
--   kind_override    Korrektur von Hand: Erstgespräch ja/nein
--   outcome_override Korrektur von Hand: was wirklich war
--
-- Die beiden *_override-Spalten schreibt der Abgleich nie — eine Korrektur
-- bleibt also stehen, auch wenn Close später etwas anderes meint.
-- ------------------------------------------------------------
create table if not exists public.sales_meetings (
  id                text primary key,
  lead_id           text,
  title             text not null default '',
  booked_at         timestamptz not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  close_status      text,
  outcome           text not null default 'geplant'
                    check (outcome in ('geplant','stattgefunden','no_show','abgesagt','unklar')),
  outcome_reason    text,
  client_since      date,
  kind_override     text
                    check (kind_override is null or kind_override in ('erst','folge')),
  outcome_override  text
                    check (outcome_override is null or outcome_override in ('stattgefunden','no_show','abgesagt')),
  source            text not null default 'close'
                    check (source in ('close','hand')),
  updated_at        timestamptz not null default now()
);

create index if not exists sales_meetings_lead_idx on public.sales_meetings (lead_id);

select public.xpo_policy_uebernehmen('sales_meetings');

grant select, insert, update, delete on public.sales_meetings to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 3) Gegenprobe — die Tabelle muss angelegt und geschützt sein
-- ------------------------------------------------------------
select 'sales_meetings' as tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'sales_meetings'
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'sales_meetings'
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung;
