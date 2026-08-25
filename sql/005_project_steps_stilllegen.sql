-- ============================================================
-- 005 — project_steps stilllegen
--
-- ERST AUSFUEHREN, WENN sql/004 gelaufen ist UND das Dashboard mit den neuen
-- Boards ein paar Wochen im Betrieb war.
--
-- Warum warten? Es gibt keinen gemeinsamen Deploy: Ein Browser, der die alte
-- Fassung noch im Cache hat, liest project_steps weiter. Nach dem Umbenennen
-- bekaeme er dort einen Fehler und zeigte alle Projekte leer an — ohne
-- Meldung, denn eine fehlende Tabelle sieht im Dashboard aus wie "keine
-- Daten".
--
-- Die Tabelle wird NICHT geloescht, nur umbenannt. Sie ist die einzige Kopie
-- der urspruenglichen Schrittdaten. Gleiches Vorgehen wie bei
-- zuordnung_optionen_alt in sql/001.
--
-- Supabase warnt zu Recht vor "destructive operations" — der Schritt ist
-- umkehrbar: alter table public.project_steps_alt rename to project_steps;
--
-- Ausfuehren: Supabase -> SQL Editor -> New query -> alles einfuegen -> Run.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Sicherheitshalter: nur umbenennen, wenn wirklich jeder Schritt
--    als Aufgabe angekommen ist.
-- ------------------------------------------------------------
do $$
declare
  fehlend integer;
begin
  -- Schon umbenannt? Dann ist nichts zu tun.
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'project_steps' and c.relkind = 'r')
  then
    raise notice 'project_steps gibt es nicht mehr — nichts zu tun.';
    return;
  end if;

  select count(*) into fehlend
  from public.project_steps s
  where not exists (
    select 1 from public.tasks t where t.legacy_step_id = s.id::text);

  if fehlend > 0 then
    raise exception
      'ABBRUCH: % Schritt(e) sind nicht als Aufgabe vorhanden. Erst sql/004 erneut ausfuehren.', fehlend;
  end if;

  execute 'alter table public.project_steps rename to project_steps_alt';
  raise notice 'project_steps heisst jetzt project_steps_alt.';
end $$;


-- ------------------------------------------------------------
-- 2) Gegenprobe
-- ------------------------------------------------------------
select
  case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname='public' and c.relname='project_steps_alt')
       then 'ja' else 'NEIN' end as umbenannt,
  case when exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname='public' and c.relname='project_steps' and c.relkind='r')
       then 'NEIN — steht noch da' else 'ja' end as alte_weg;
