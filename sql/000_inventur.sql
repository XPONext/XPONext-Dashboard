-- ============================================================
-- SCHRITT 0 — Inventur. Nur lesen, ändert nichts.
--
-- Vor der Migration ausführen und die Ergebnisse ansehen. Es geht um zwei
-- Fragen: Welche Zuordnungswerte gibt es wirklich? Und wie sind die
-- bestehenden Policies formuliert?
--
-- Ausführen: Supabase → SQL Editor → einfügen → Run.
-- ============================================================


-- 1) Welche Zuordnungen stecken in den Zeiteinträgen?
--    Erfahrungsgemäß tauchen hier 2-5 Karteileichen auf: Tippfehler,
--    Groß-/Kleinschreibung, Leerstrings. Die sollen wir kennen, BEVOR
--    daraus Kunden werden.
select
  coalesce(nullif(trim(zuordnung), ''), '(leer)') as zuordnung,
  count(*)                                        as eintraege,
  round(sum(duration_minutes) / 60.0, 1)          as stunden,
  min(ts)::date                                   as erster,
  max(ts)::date                                   as letzter
from time_entries
group by 1
order by 2 desc;


-- 2) Fallen Werte nur durch Groß-/Kleinschreibung oder Leerzeichen auseinander?
--    Wenn hier Zeilen erscheinen, müssen die vor der Migration vereinheitlicht
--    werden — sonst entstehen zwei Kunden für denselben Kunden.
select
  lower(trim(zuordnung))                     as normalisiert,
  count(distinct zuordnung)                  as schreibweisen,
  string_agg(distinct zuordnung, ' | ')      as varianten
from time_entries
where zuordnung is not null and trim(zuordnung) <> ''
group by 1
having count(distinct zuordnung) > 1;


-- 3) Wie ist die aktuelle Optionsliste gepflegt?
select name, active, sort_order
from zuordnung_optionen
order by sort_order, name;


-- 4) Wie sind die bestehenden Policies formuliert?
--    WICHTIG: Die Formulierung aus `qual` / `with_check` wird in Schritt 1
--    wörtlich für die neuen Tabellen übernommen, damit alles gleich
--    abgesichert ist.
--
--    Zusätzlich die Frage aus der Prüfung von Phase 0:
--    Hat die Policy auf daily_team ein `with_check`? Wenn dort NULL steht,
--    schützt die Passwortprüfung beim Anmelden NICHT — sie beruht darauf,
--    dass ein Schreibvorgang mit falschem Secret einen Fehler wirft.
select
  tablename,
  policyname,
  cmd,
  qual        as using_bedingung,
  with_check  as with_check_bedingung
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- 5) Schreibt außer popup.py noch etwas in zuordnung_optionen?
--    Die Tabelle wird in Schritt 1 zu einer View. Views sind nicht ohne
--    Weiteres beschreibbar — falls hier etwas schreibt, brauchen wir eine
--    andere Lösung.
--    (Im Dashboard-Code steht kein Schreibzugriff; das hier ist die
--    Gegenprobe auf der Datenbankseite.)
select
  schemaname, tablename,
  n_tup_ins as eingefuegt,
  n_tup_upd as geaendert,
  n_tup_del as geloescht
from pg_stat_user_tables
where relname = 'zuordnung_optionen';
