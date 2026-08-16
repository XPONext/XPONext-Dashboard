-- ============================================================
-- 002 — Projekte ausbauen
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
-- 4) Gegenprobe
--
-- Drei Zeilen, überall "ja". Geprüft wird nicht nur, ob die Spalte da ist,
-- sondern auch, ob der Fremdschlüssel wirklich angelegt wurde: `add column
-- if not exists` überspringt eine vorhandene Spalte KOMPLETT — wäre ein
-- früherer Lauf mittendrin abgebrochen, bliebe die Spalte ohne Verknüpfung
-- zurück und das Skript meldete trotzdem Erfolg.
-- ------------------------------------------------------------
select
  x.tabelle,
  x.spalte,
  case when c.column_name is not null then 'ja' else 'NEIN' end as spalte_da,
  case when x.spalte = 'due_date' then 'entfällt'
       when fk.conname is not null then 'ja' else 'NEIN' end   as fremdschluessel
from (values
        ('project_steps','due_date'),
        ('tasks','project_id'),
        ('projects','customer_id')
     ) as x(tabelle, spalte)
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = x.tabelle and c.column_name = x.spalte
left join pg_constraint fk
  on fk.contype = 'f'
 and fk.conrelid = ('public.' || x.tabelle)::regclass
 and fk.conkey = array[(select attnum from pg_attribute
                        where attrelid = ('public.' || x.tabelle)::regclass
                          and attname = x.spalte)]
order by x.tabelle;


-- Und: Sind die Projekttabellen überhaupt abgesichert? Eine fehlende Policy
-- zeigt sich im Dashboard als leere Liste ohne Fehlermeldung.
select
  t.tabelle,
  case when p.policyname is not null then 'ja' else 'NEIN — ungeschützt!' end as geschuetzt
from (values ('projects'),('project_steps'),('tasks')) as t(tabelle)
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.tabelle;
