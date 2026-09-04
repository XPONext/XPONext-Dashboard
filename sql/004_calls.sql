-- ============================================================
-- 004 — Calls und Opportunitätskosten
--
-- Zwei Tabellen:
--   daily_calls  — wie viele Calls an einem Tag gemacht wurden, und wie
--                  viele an dem Tag vorgesehen waren (Tasks in der
--                  Close-Inbox)
--   settings     — einzelne Stellschrauben, die ihr im Dashboard ändern
--                  könnt, ohne dass jemand Code anfassen muss
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen.
-- Das Skript ist wiederholbar.
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
    and p.tablename in ('time_entries','daily_team','daily_personal','customers')
    and p.qual is not null
  limit 1;

  if ausdruck is null then
    raise exception
      'Keine bestehende Policy als Vorlage gefunden — die neuen Tabellen dürfen nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;


-- ------------------------------------------------------------
-- 1) Calls je Tag und Person
--
-- Die Vorgabe wird MITGESCHRIEBEN und nicht später neu berechnet — sonst
-- ändert sich rückwirkend, woran ein vergangener Tag gemessen wurde.
--
-- Zwei Zahlen statt einer, weil "Inbox" zwei verschiedene Dinge enthält:
--   target          — was in der Close-Inbox stand (heute fällig + überfällig)
--   target_overdue  — wie viel davon Rückstand aus früheren Tagen war
--
-- Der Unterschied ist nicht kosmetisch: Wer die Inbox-Summe als Tagesziel
-- nimmt, wird für Rückstand doppelt bestraft — das Ziel wächst genau dann,
-- wenn man ohnehin hinterherhängt. Das Dashboard misst deshalb gegen die
-- heute fälligen Tasks und zeigt den Rückstand daneben.
-- ------------------------------------------------------------
create table if not exists public.daily_calls (
  date           date not null,
  person         text not null,
  calls          integer not null default 0 check (calls >= 0),
  calls_warm     integer          check (calls_warm is null or calls_warm >= 0),
  calls_cold     integer          check (calls_cold is null or calls_cold >= 0),
  target         integer          check (target is null or target >= 0),
  target_overdue integer          check (target_overdue is null or target_overdue >= 0),
  source      text    not null default 'popup'
              check (source in ('popup','dashboard')),
  updated_at  timestamptz not null default now(),
  primary key (date, person)
);

create index if not exists daily_calls_datum_idx on public.daily_calls (date);

-- Falls die Tabelle aus einem frueheren Lauf ohne diese Spalte existiert
alter table public.daily_calls add column if not exists target_overdue integer;
alter table public.daily_calls add column if not exists calls_warm integer;
alter table public.daily_calls add column if not exists calls_cold integer;

alter table public.daily_calls enable row level security;
select public.xpo_policy_uebernehmen('daily_calls');


-- ------------------------------------------------------------
-- 2) Stellschrauben
--
-- Startwerte aus Tims Historie: 5.200 € Umsatz aus 1.550 Cold Calls.
-- Daraus 3,35 € je Call. Der Wert bleibt fest, bis ihr ihn ändert —
-- eine mitlaufende Zahl würde bei jedem neuen Auftrag springen und die
-- Opportunitätskosten mit ihr.
-- ------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       numeric not null,
  note        text,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;
select public.xpo_policy_uebernehmen('settings');

insert into public.settings (key, value, note) values
  ('call_value_eur',      3.35, 'Umsatz je Cold Call — Startwert: 5.200 € aus 1.550 Calls'),
  ('call_history_calls',  1550, 'Calls vor Beginn der Erfassung'),
  ('call_history_revenue',5200, 'Umsatz aus diesen Calls'),
  ('call_target_default',   20, 'Tagesvorgabe, wenn Close nicht erreichbar ist')
on conflict (key) do nothing;


-- ------------------------------------------------------------
-- 3) Aufräumen und Gegenprobe
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

grant select, insert, update, delete
  on public.daily_calls, public.settings to anon, authenticated;

select
  t.tabelle,
  case when p.policyname is not null then 'ja' else 'NEIN — ungeschützt!' end as geschuetzt
from (values ('daily_calls'),('settings')) as t(tabelle)
left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tabelle;

select key, value, note from public.settings order by key;
