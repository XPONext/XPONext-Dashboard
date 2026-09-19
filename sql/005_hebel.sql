-- ============================================================
-- 005 — Hebel im Zeittracker
--
-- Hebel-Stunden werden ab jetzt im Popup erfasst statt von Hand im
-- Dashboard: "Was für Arbeit war das?" → Hebel → "Welcher Hebel?".
-- Die Handeingabe bleibt zum Nachtragen erhalten.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen.
-- Das Skript ist wiederholbar; es löscht nichts.
-- ============================================================


-- ------------------------------------------------------------
-- 1) tracker_options darf jetzt auch Hebel enthalten
--
-- Die Prüfregel auf `kind` kennt bisher nur state und aktivitaet. Sie wird
-- ersetzt, nicht ergänzt — Postgres kann Check-Constraints nicht erweitern.
-- ------------------------------------------------------------
alter table public.tracker_options
  drop constraint if exists tracker_options_kind_check;
alter table public.tracker_options
  add constraint tracker_options_kind_check
  check (kind in ('state','aktivitaet','hebel'));


-- ------------------------------------------------------------
-- 2) "Hebel" als Arbeitsart, dahinter die fünf Hebel
--
-- Die Namen müssen zu LEVERS in js/config.js passen — das Dashboard ordnet
-- die getrackten Einträge über den Namen zu. Wer hier umbenennt, muss dort
-- mitziehen, sonst landen die Stunden unter "Sonstige".
-- ------------------------------------------------------------
insert into public.tracker_options (kind, name, active, sort_order) values
  ('state', 'Hebel',                  true, 45),
  ('hebel', 'Call-Breakdowns',        true, 10),
  ('hebel', 'Cold-Call-Breakdowns',   true, 20),
  ('hebel', 'Coachings',              true, 30),
  ('hebel', 'Offer-Verbesserung',     true, 40),
  ('hebel', 'Zielgruppenverständnis', true, 50)
on conflict (kind, name) do nothing;


-- ------------------------------------------------------------
-- 3) Zeiteinträge merken sich den Hebel
-- ------------------------------------------------------------
alter table public.time_entries
  add column if not exists hebel text;


-- ------------------------------------------------------------
-- 4) Gegenprobe
--    Erwartet: state=6 Zeilen (Hebel dabei), hebel=5 Zeilen,
--    und "hebel_spalte" = ja.
-- ------------------------------------------------------------
select kind, count(*) as anzahl, string_agg(name, ' · ' order by sort_order) as namen
from public.tracker_options
where active
group by kind
order by kind;

select
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'time_entries' and column_name = 'hebel')
  then 'ja' else 'NEIN' end as hebel_spalte;
