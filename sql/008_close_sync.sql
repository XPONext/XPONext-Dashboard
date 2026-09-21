-- ============================================================
-- 008 — Automatischer Abgleich mit Close: Calls, Termine, Show-ups
--
-- Bisher sollte die Call-Zahl über ein Fenster um 18 Uhr kommen. Das hat nie
-- funktioniert, weil der Tracker um 18 Uhr meist schon im Feierabend ist.
-- Ab jetzt schreibt ein Hintergrund-Abgleich (time_tracker/close_sync.py)
-- alle 30 Minuten die Tageszahlen aus Close hierher.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar.
-- ============================================================


-- ------------------------------------------------------------
-- 0) Absicherung von den bestehenden Tabellen übernehmen
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
    and p.tablename in ('time_entries','daily_team','daily_calls','customers')
    and p.qual is not null
  limit 1;
  if ausdruck is null then
    raise exception 'Keine bestehende Policy als Vorlage gefunden — die neue Tabelle darf nicht ungeschützt angelegt werden.';
  end if;
  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format('create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
                 ziel, ausdruck, ausdruck);
end $$;


-- ------------------------------------------------------------
-- 1) daily_calls darf jetzt auch aus Close kommen
-- ------------------------------------------------------------
alter table public.daily_calls
  drop constraint if exists daily_calls_source_check;
alter table public.daily_calls
  add constraint daily_calls_source_check
  check (source in ('popup','dashboard','close'));


-- ------------------------------------------------------------
-- 2) Termine je Tag und Person
--
--   booked — an dem Tag in Close angelegte "Meeting …"-Tasks (je Lead einmal)
--   showup — an dem Tag fällige Meetings, die stattgefunden haben
--   noshow — an dem Tag fällige Meetings mit Lead-Status "No Show" oder einer
--            Notiz wie "verschoben" / "nicht aufgetaucht" / "nicht erreicht"
--
-- showup und noshow bleiben bis 17 Uhr leer: Vorher stünde ein Termin, der
-- erst um 15 Uhr ist, schon als "stattgefunden" da.
-- ------------------------------------------------------------
create table if not exists public.daily_meetings (
  date        date not null,
  person      text not null,
  booked      integer not null default 0 check (booked >= 0),
  showup      integer          check (showup is null or showup >= 0),
  noshow      integer          check (noshow is null or noshow >= 0),
  source      text not null default 'close',
  updated_at  timestamptz not null default now(),
  primary key (date, person)
);

alter table public.daily_meetings enable row level security;
select public.xpo_policy_uebernehmen('daily_meetings');

grant select, insert, update, delete on public.daily_meetings to anon, authenticated;

drop function if exists public.xpo_policy_uebernehmen(text);


-- ------------------------------------------------------------
-- 3) Gegenprobe
-- ------------------------------------------------------------
select
  t.tabelle,
  case when p.policyname is not null then 'ja' else 'NEIN — ungeschützt!' end as geschuetzt
from (values ('daily_meetings'),('daily_calls')) as t(tabelle)
left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tabelle;
