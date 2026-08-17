-- ============================================================
-- 003 — Einmalige Aufträge zählen sofort, nicht anteilig
--
-- Bisher wurde ein einmaliger Auftrag gleichmäßig über seinen Zeitraum
-- verteilt: 1.500 € über drei Monate ergaben 500 € pro Monat. Das ist falsch.
-- Der Umsatz entsteht bei der Beauftragung, nicht scheibchenweise während
-- der Arbeit daran.
--
-- Ab jetzt:
--   einmalig  -> der VOLLE Betrag zählt im Monat von period_start
--   retainer  -> unverändert der Monatsbetrag über den ganzen Zeitraum
--
-- Bei einmaligen Aufträgen ist `period_end` damit reine Information
-- (bis wann die Arbeit läuft) und nicht mehr Pflicht.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen.
-- Es gehen keine Daten verloren — nur die Sicht rechnet anders.
-- ============================================================


-- ------------------------------------------------------------
-- 1) Enddatum ist bei Einmalaufträgen keine Pflicht mehr
-- ------------------------------------------------------------
alter table public.revenues
  drop constraint if exists einmalig_braucht_ende;


-- ------------------------------------------------------------
-- 2) Die Sicht neu rechnen
-- ------------------------------------------------------------
create or replace view public.revenue_months
with (security_invoker = on) as

-- Retainer: Monatsbetrag über jeden Monat des Zeitraums.
-- Ohne Enddatum läuft er bis zum aktuellen Monat weiter.
select
  r.customer_id,
  r.id                                    as revenue_id,
  r.kind,
  m::date                                 as month_start,
  (m + interval '1 month - 1 day')::date  as month_end,
  r.amount                                as amount
from public.revenues r
cross join lateral generate_series(
    date_trunc('month', r.period_start),
    date_trunc('month', coalesce(r.period_end, current_date)),
    interval '1 month') as m
where r.kind = 'retainer'

union all

-- Einmalig: der volle Betrag im Monat der Beauftragung.
select
  r.customer_id,
  r.id,
  r.kind,
  date_trunc('month', r.period_start)::date,
  (date_trunc('month', r.period_start) + interval '1 month - 1 day')::date,
  r.amount
from public.revenues r
where r.kind = 'einmalig';

grant select on public.revenue_months to anon, authenticated;


-- ------------------------------------------------------------
-- 3) Gegenprobe
--
-- Je Umsatzeintrag muss gelten:
--   einmalig -> genau EINE Zeile, Betrag = Originalbetrag
--   retainer -> eine Zeile je Monat, jede mit dem Monatsbetrag
-- ------------------------------------------------------------
select
  c.name                        as kunde,
  r.kind,
  r.title,
  r.amount                      as eingetragen,
  count(rm.*)                   as monate,
  sum(rm.amount)                as summe_in_der_sicht,
  case when r.kind = 'einmalig' and sum(rm.amount) = r.amount then 'ok'
       when r.kind = 'retainer' and sum(rm.amount) = r.amount * count(rm.*) then 'ok'
       else 'PRUEFEN' end       as stimmt
from public.revenues r
join public.customers c on c.id = r.customer_id
left join public.revenue_months rm on rm.revenue_id = r.id
group by c.name, r.kind, r.title, r.amount, r.id
order by c.name;
