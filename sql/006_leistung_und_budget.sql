-- ============================================================
-- 006 — Leistungsart am Umsatz, Ziel-Stundensatz
--
-- Damit das Dashboard zeigen kann, welche Leistung sich pro Stunde am besten
-- bezahlt, braucht jeder Umsatzeintrag eine Leistungsart. Und für das
-- Stundenbudget je Auftrag einen Ziel-Stundensatz als Stellschraube.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Leistungsarten als Auswahlliste (pflegbar wie die Hebel)
-- ------------------------------------------------------------
alter table public.tracker_options
  drop constraint if exists tracker_options_kind_check;
alter table public.tracker_options
  add constraint tracker_options_kind_check
  check (kind in ('state','aktivitaet','hebel','leistung'));

insert into public.tracker_options (kind, name, active, sort_order) values
  ('leistung', 'Webseite',         true, 10),
  ('leistung', 'Google Ads',       true, 20),
  ('leistung', 'GEO-Optimierung',  true, 30),
  ('leistung', 'Google Ads + GEO', true, 40),
  ('leistung', 'Beratung',         true, 50),
  ('leistung', 'Sonstiges',        true, 90)
on conflict (kind, name) do nothing;


-- ------------------------------------------------------------
-- 2) Leistungsart am Umsatz — bestehende Einträge aus dem Titel ableiten
-- ------------------------------------------------------------
alter table public.revenues
  add column if not exists service text;

update public.revenues set service = case
    when title ilike '%ads%' and title ilike '%geo%' then 'Google Ads + GEO'
    when title ilike '%ads%'                          then 'Google Ads'
    when title ilike '%geo%'                          then 'GEO-Optimierung'
    when title ilike '%web%'                          then 'Webseite'
    else service
  end
where service is null;


-- ------------------------------------------------------------
-- 3) Ziel-Stundensatz
--    100 € entspricht der grünen Ampelschwelle im Kunden-Reiter.
-- ------------------------------------------------------------
insert into public.settings (key, value, note) values
  ('target_hourly_rate_eur', 100, 'Ziel-Stundensatz — Grundlage für das Stundenbudget je Auftrag')
on conflict (key) do nothing;


-- ------------------------------------------------------------
-- 4) Gegenprobe — jeder Umsatz sollte eine Leistungsart haben
-- ------------------------------------------------------------
select title, service, amount, period_start
from public.revenues order by period_start;

select key, value from public.settings where key = 'target_hourly_rate_eur';
