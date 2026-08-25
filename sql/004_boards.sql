-- ============================================================
-- 004 — Boards je Kunde und Projekt
--
-- Macht aus dem einen Wochen-Board viele kleine: eines pro Projekt und eines
-- ("Allgemein") pro Kunde. Dafuer bekommen Aufgaben eine Beschreibung, eine
-- Frist und einen Kundenbezug — und die Projekt-Schritte ziehen in die
-- Aufgaben um, damit es nicht laenger zwei Listen fuer dasselbe gibt.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfuegen und ausfuehren.
-- Ausfuehren: Supabase -> SQL Editor -> New query -> alles einfuegen -> Run.
--
-- Das Skript ist wiederholbar: ein zweiter Lauf legt nichts doppelt an und
-- kopiert keinen Schritt ein zweites Mal.
--
-- ABSCHNITT 1 holt sql/002_projekte.sql nach. Laut STAND.md ist das nie
-- gelaufen; 002 muss deshalb NICHT separat ausgefuehrt werden.
--
-- Supabase warnt eventuell vor "destructive operations" — hier zu Unrecht:
-- Das Skript legt Spalten an und kopiert Zeilen. Es loescht nichts, und
-- project_steps bleibt vollstaendig erhalten (Stilllegen kommt spaeter in
-- sql/005).
--
-- RUECKNAHME (falls der Umzug schiefgeht):
--     delete from public.tasks where legacy_step_id is not null;
-- ============================================================


-- ------------------------------------------------------------
-- 1) Nachholen aus sql/002_projekte.sql
--
-- "add column if not exists" ist billig, wenn die Spalte schon da ist. Der
-- Kopier-Befehl in Abschnitt 4 liest project_steps.due_date — waere 002 nie
-- gelaufen, gaebe es diese Spalte nicht und das Skript braeche ab.
-- ------------------------------------------------------------
alter table public.project_steps
  add column if not exists due_date date;

alter table public.tasks
  add column if not exists project_id bigint references public.projects(id) on delete set null;

alter table public.projects
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists projects_kunde_idx on public.projects (customer_id);


-- ------------------------------------------------------------
-- 2) Neue Spalten an den Aufgaben
--
-- description  — das grosse Textfeld unten im Dialog
-- due_date     — bis wann die Aufgabe spaetestens erledigt sein muss.
--                BEWUSST nullable: Das Pflichtfeld ist eine Regel im Dialog,
--                kein Constraint. Ein "not null" wuerde jede bestehende
--                Aufgabe ungueltig machen und den Umzug in Abschnitt 4
--                sprengen — Schritte hatten meist keine Frist.
-- customer_id  — der Kunde, dem das Board gehoert. Noetig neben project_id,
--                weil eine "Allgemein"-Aufgabe einen Kunden hat, aber kein
--                Projekt.
-- legacy_step_id — Marke des Schritt-Umzugs. TEXT, nicht bigint: project_steps
--                wurde von Hand angelegt, ob id bigint oder uuid ist, steht
--                nirgends im Code. Der Vergleich laeuft ueber s.id::text und
--                funktioniert in beiden Faellen.
-- ------------------------------------------------------------
alter table public.tasks add column if not exists description    text;
alter table public.tasks add column if not exists due_date       date;
alter table public.tasks add column if not exists customer_id    uuid references public.customers(id) on delete set null;
alter table public.tasks add column if not exists legacy_step_id text;

create index if not exists tasks_projekt_idx on public.tasks (project_id);
create index if not exists tasks_kunde_idx   on public.tasks (customer_id);
create index if not exists tasks_faellig_idx on public.tasks (due_date);

-- Verhindert hart, dass ein zweiter Lauf einen Schritt doppelt anlegt.
create unique index if not exists tasks_legacy_step_uidx
  on public.tasks (legacy_step_id) where legacy_step_id is not null;


-- ------------------------------------------------------------
-- 3) Die Wochenbindung wird optional
--
-- Eine Projektaufgabe gehoert zu keiner Kalenderwoche. Muss VOR Abschnitt 4
-- stehen — die umgezogenen Schritte haben keine.
-- ------------------------------------------------------------
alter table public.tasks alter column week_start drop not null;


-- ------------------------------------------------------------
-- 4) Die Schritte ziehen in die Aufgaben um
--
-- Doppelt abgesichert: der Unique-Index oben verhindert Duplikate, das
-- "where not exists" sorgt dafuer, dass ein zweiter Lauf nicht mit einem
-- Fehler abbricht, sondern einfach nichts tut.
--
-- created_at wird uebernommen, damit die Reihenfolge im Board erhalten bleibt.
-- ------------------------------------------------------------
insert into public.tasks
  (text, status, done, assignee, priority, due_date,
   project_id, customer_id, week_start, created_at, legacy_step_id)
select s.text,
       case when s.done then 'done' else 'backlog' end,
       coalesce(s.done, false),
       s.assignee,
       'mittel',              -- Schritte hatten keine Prioritaet
       s.due_date,
       s.project_id,
       p.customer_id,         -- Kunde vom Projekt ableiten
       null,                  -- keine Woche: das ist eine Projektaufgabe
       s.created_at,
       s.id::text
from public.project_steps s
left join public.projects p on p.id = s.project_id
where not exists (
  select 1 from public.tasks t where t.legacy_step_id = s.id::text);


-- ------------------------------------------------------------
-- 5) Bestandsaufgaben mit Projekt bekommen den Kunden des Projekts
-- ------------------------------------------------------------
update public.tasks t
   set customer_id = p.customer_id
  from public.projects p
 where p.id = t.project_id
   and t.customer_id is null
   and p.customer_id is not null;


-- ============================================================
-- 6) GEGENPROBE — vier Ergebnistabellen. Ueberall "ja"/"ok", sonst STOPP.
-- ============================================================

-- 6a) Sind alle Spalten da, und haengen die Fremdschluessel wirklich dran?
-- "add column if not exists" ueberspringt eine vorhandene Spalte KOMPLETT —
-- waere ein frueherer Lauf mittendrin abgebrochen, bliebe die Spalte ohne
-- Verknuepfung zurueck und das Skript meldete trotzdem Erfolg.
select
  x.tabelle,
  x.spalte,
  case when c.column_name is not null then 'ja' else 'NEIN' end as spalte_da,
  case when x.braucht_fk = false then 'entfaellt'
       when fk.gefunden is not null then 'ja' else 'NEIN' end    as fremdschluessel
from (values
        ('project_steps','due_date',       false),
        ('tasks',        'project_id',     true),
        ('tasks',        'description',    false),
        ('tasks',        'due_date',       false),
        ('tasks',        'customer_id',    true),
        ('tasks',        'legacy_step_id', false),
        ('projects',     'customer_id',    true)
     ) as x(tabelle, spalte, braucht_fk)
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = x.tabelle and c.column_name = x.spalte
-- Ueber die Spaltennamen statt ueber die Spaltennummern vergleichen: conkey
-- ist ein int2vector, und ein direkter Vergleich mit einem Array laesst die
-- ganze Gegenprobe scheitern — ausgerechnet nachdem oben schon alles
-- angelegt wurde.
left join lateral (
  select 1 as gefunden
  from pg_constraint fk
  join pg_attribute a
    on a.attrelid = fk.conrelid
   and a.attnum = any(fk.conkey::smallint[])
  where fk.contype = 'f'
    and fk.conrelid = to_regclass('public.' || x.tabelle)
    and a.attname = x.spalte
  limit 1
) fk on true
order by x.tabelle, x.spalte;


-- 6b) Ist die Wochenbindung wirklich optional geworden?
select 'tasks.week_start optional' as pruefung,
       case when is_nullable = 'YES' then 'ja' else 'NEIN' end as ergebnis
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'week_start';


-- 6c) Ist JEDER Schritt umgezogen?
-- Die reine Zahl reicht nicht: ein verlorener und ein doppelter Schritt
-- wuerden sich gegenseitig aufheben. Deshalb zusaetzlich die Liste der
-- Schritte ohne Gegenstueck — sie MUSS leer sein.
select
  (select count(*) from public.project_steps)                                  as schritte,
  (select count(*) from public.tasks where legacy_step_id is not null)         as umgezogen,
  case when (select count(*) from public.project_steps)
          = (select count(*) from public.tasks where legacy_step_id is not null)
       then 'ok' else 'PRUEFEN' end                                            as ergebnis;

select s.id, s.text, 'NICHT UMGEZOGEN' as hinweis
from public.project_steps s
where not exists (
  select 1 from public.tasks t where t.legacy_step_id = s.id::text);


-- 6d) Sind die betroffenen Tabellen abgesichert?
-- Eine fehlende Policy zeigt sich im Dashboard als leere Liste ohne Fehler.
select
  t.tabelle,
  case when p.policyname is not null then 'ja' else 'NEIN — ungeschuetzt!' end as geschuetzt
from (values ('tasks'),('projects'),('project_steps'),('customers')) as t(tabelle)
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = t.tabelle;
