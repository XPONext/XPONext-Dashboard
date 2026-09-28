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

alter table public.monthly_goals enable row level security;
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
-- 3) Gegenprobe — beides muss auftauchen, und die neue Tabelle geschützt sein
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
