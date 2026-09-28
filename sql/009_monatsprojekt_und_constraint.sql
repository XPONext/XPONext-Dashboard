-- ============================================================
-- 009 — Monatsprojekt und Engpass
--
-- Zwei Dinge, die im wöchentlichen Meeting besprochen werden und bisher
-- nirgends standen:
--
--   * Das Monatsprojekt — das größere Vorhaben, auf das die Wochenprojekte
--     einzahlen. Eigene Tabelle, weil es einen Monat und nicht eine Woche gilt.
--
--   * Der aktuelle Engpass — der eine Satz, der erklärt, woran es gerade
--     hängt. Der hängt an der Woche, weil er dort besprochen wird: So sieht man
--     beim Zurückblättern, was in welcher Woche der Engpass war, statt nur den
--     letzten Stand.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen
--
-- Dieselbe Hilfsfunktion wie in sql/001 und sql/004. Sie muss hier erneut
-- angelegt werden, weil beide Dateien sie am Ende wieder löschen — sie ist
-- bewusst ein Wegwerf-Helfer und steht nicht dauerhaft in der Datenbank.
--
-- Sie liest die Policy einer bestehenden Tabelle und überträgt sie. Findet sie
-- keine Vorlage, bricht sie ab: lieber gar nichts anlegen als etwas
-- Ungeschütztes.
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
-- 1) Monatsprojekt
--
-- `month_start` ist immer der Monatserste. Das Dashboard rechnet den aus dem
-- gewählten Tag aus; hier steht deshalb keine Logik, nur die Ablage.
-- ------------------------------------------------------------
create table if not exists public.monthly_goals (
  month_start date primary key,
  goal        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

select public.xpo_policy_uebernehmen('monthly_goals');

-- ------------------------------------------------------------
-- 2) Engpass an der Woche
--
-- Bewusst eine Spalte in `weekly_goals` statt einer eigenen Tabelle: Er wird im
-- selben Meeting besprochen wie das Wochenprojekt, gilt für dieselbe Woche und
-- wird über dieselbe Zeile geladen. Eine eigene Tabelle hätte eine zweite
-- Abfrage gekostet, ohne etwas zu können.
-- ------------------------------------------------------------
alter table public.weekly_goals
  add column if not exists constraint_text text;

-- ------------------------------------------------------------
-- 3) Hilfsfunktion wieder entfernen
--
-- Sie hat ihre Arbeit getan. Eine Funktion, die Policies umschreiben kann,
-- bleibt nicht dauerhaft in der Datenbank stehen — so halten es sql/001 und
-- sql/004 auch.
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 4) Gegenprobe — beides muss auftauchen, und die neue Tabelle geschützt sein
-- ------------------------------------------------------------
select 'monthly_goals' as tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'monthly_goals'
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'monthly_goals'
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung
union all
select 'weekly_goals.constraint_text',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'weekly_goals'
           and column_name = 'constraint_text'
       ) then 'angelegt' else 'FEHLT' end,
       '—';
