-- ============================================================
-- SCHRITT 2 — Projekte ausbauen
--
-- Drei zusätzliche Spalten. Nichts wird gelöscht oder umbenannt, es gehen
-- keine Daten verloren, und das Skript ist beliebig oft wiederholbar.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen.
-- Ausführen: Supabase → SQL Editor → New query → alles einfügen → Run.
--
-- Supabase warnt eventuell wieder vor "destructive operations" — hier zu
-- Unrecht: Das Skript legt nur Spalten an, es entfernt nichts.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Schritte bekommen eine Fälligkeit
--
-- Damit lässt sich beantworten, was überfällig ist. Bisher war ein Schritt
-- entweder erledigt oder nicht — ohne jeden Zeitbezug.
-- ------------------------------------------------------------
alter table public.project_steps
  add column if not exists due_date date;


-- ------------------------------------------------------------
-- 2) Aufgaben können zu einem Projekt gehören
--
-- Eine Aufgabe im Wochen-Board kann auf ein Langzeitprojekt einzahlen.
-- on delete set null: Wird das Projekt gelöscht, bleibt die Aufgabe erhalten
-- und verliert nur die Zuordnung.
-- ------------------------------------------------------------
alter table public.tasks
  add column if not exists project_id bigint references public.projects(id) on delete set null;

create index if not exists tasks_projekt_idx
  on public.tasks (project_id);


-- ------------------------------------------------------------
-- 3) Projekte können zu einem Kunden gehören
--
-- Damit fällt die Frage "lohnt sich dieses Projekt" als Nebenprodukt ab:
-- getrackte Zeit auf den Kunden gegen den Umsatz dieses Kunden.
-- Optional — interne Projekte bleiben einfach ohne Kunden.
-- ------------------------------------------------------------
alter table public.projects
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists projects_kunde_idx
  on public.projects (customer_id);


-- ------------------------------------------------------------
-- 4) Gegenprobe — alle drei Spalten müssen hier auftauchen
-- ------------------------------------------------------------
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (   (table_name = 'project_steps' and column_name = 'due_date')
       or (table_name = 'tasks'         and column_name = 'project_id')
       or (table_name = 'projects'      and column_name = 'customer_id'))
order by table_name;
