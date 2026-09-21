-- ============================================================
-- 007 — Wochenprojekt: Überschrift plus Beschreibung
--
-- Aus dem "Wochenfokus" (eine Zeile) wird das "Wochenprojekt": eine
-- Überschrift und darunter Platz, es näher zu beschreiben.
--
-- Die bestehende Spalte `goal` bleibt die Überschrift — alle bisherigen
-- Einträge bleiben damit gültig. Neu ist nur `description`.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar.
-- ============================================================

alter table public.weekly_goals
  add column if not exists description text;

-- Gegenprobe: die Spalte muss auftauchen
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'weekly_goals'
order by ordinal_position;
