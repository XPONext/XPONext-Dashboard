-- ============================================================
-- 011 — Anrufe aus Close, je Person, und der Zustand der Abgleiche
--
-- Bis hierher zählte ein LaunchAgent auf Tims Mac abgehakte Close-Tasks als
-- Calls und schrieb alles Tim zu. Simon hat keinen eigenen Close-Zugang, ruft
-- aber über seine Leitung „Simon Business" aus Close an — am 28.09.2026 standen
-- 49 Calls bei Tim, tatsächlich waren es 10 von Tim und 37 von Simon.
--
-- Jetzt kommt jeder Anruf aus Close als eigene Zeile hierher, mit der Person
-- aus der Leitung. Der Abgleich läuft auf Railway (tools/vertrieb_sync/ im
-- Workflow-Repo), unabhängig davon, ob ein Mac wach ist.
--
-- daily_calls bleibt stehen: Ältere Tagesvorgaben stehen nur dort, und von
-- Hand nachgetragene Calls (außerhalb von Close) landen weiter dort.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen (Wegwerf-Helfer wie in sql/009)
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
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neuen Tabellen dürfen nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;

-- ------------------------------------------------------------
-- 1) Ein Anruf je Zeile
--
--   person         aus der Leitung: „Tim Business"/„Tim Privat" → tim,
--                  „Simon Business" → simon, unbekannte Leitung → leer
--   reached        erreicht? Nicht erreicht heißt: Call-Notiz beginnt mit „ne",
--                  „falsche Nummer", oder 0 Sekunden ohne Notiz (Tim, 01.10.2026)
--   status_before  Lead-Status vor dem Anruf — daraus rechnet das Dashboard
--                  kalt/warm und mit Terminen und Aufträgen die Call-to-Termin-
--                  und Call-to-Close-Rate. Steht fest, auch wenn sich der Status
--                  durch den Anruf ändert.
-- ------------------------------------------------------------
create table if not exists public.sales_calls (
  id              text primary key,
  lead_id         text,
  person          text check (person is null or person in ('tim','simon')),
  line_label      text,
  started_at      timestamptz not null,
  duration        integer not null default 0 check (duration >= 0),
  reached         boolean not null,
  reached_reason  text,
  status_before   text,
  updated_at      timestamptz not null default now()
);

create index if not exists sales_calls_start_idx on public.sales_calls (started_at);
create index if not exists sales_calls_lead_idx on public.sales_calls (lead_id);

select public.xpo_policy_uebernehmen('sales_calls');

-- ------------------------------------------------------------
-- 2) Tagesvorgabe fürs Team
--
-- Wie bisher: alle Call-Tasks in Close, die heute oder früher fällig waren,
-- plus die heute erledigten. Eine Momentaufnahme je Tag — wird mitgeschrieben,
-- nicht später neu berechnet, sonst änderte sich rückwirkend, woran ein Tag
-- gemessen wurde. Eine Zahl fürs Team: Die Tasks hängen alle an Tims
-- Close-Nutzer.
-- ------------------------------------------------------------
create table if not exists public.daily_call_targets (
  date            date primary key,
  target          integer not null check (target >= 0),
  target_overdue  integer not null default 0 check (target_overdue >= 0),
  updated_at      timestamptz not null default now()
);

select public.xpo_policy_uebernehmen('daily_call_targets');

-- ------------------------------------------------------------
-- 3) Zustand der Abgleiche
--
-- Ein Abgleich, der still stehen bleibt, sieht im Dashboard aus wie eine
-- ruhige Woche. Deshalb schreibt jeder Lauf hierher, ob er durchkam — und ob
-- Tims und Simons Kalender in Close noch verbunden sind. Reißt Simons
-- Verbindung ab, fehlen seine Termine, ohne dass es sonst jemand merkt.
-- ------------------------------------------------------------
create table if not exists public.sync_status (
  key         text primary key,
  ok          boolean not null,
  detail      text,
  updated_at  timestamptz not null default now()
);

select public.xpo_policy_uebernehmen('sync_status');

grant select, insert, update, delete
  on public.sales_calls, public.daily_call_targets, public.sync_status
  to anon, authenticated;

-- ------------------------------------------------------------
-- 4) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 5) Gegenprobe — alle drei angelegt und geschützt
-- ------------------------------------------------------------
select t.tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = t.tabelle
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = t.tabelle
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung
from (values ('sales_calls'), ('daily_call_targets'), ('sync_status')) as t(tabelle);
