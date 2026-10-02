-- ============================================================
-- 014 — Finanzen: Ausgaben aus den Rechnungen, feste Kosten, Rücklagen
--
-- Tim, 01.10.2026: „eine Übersicht mit Cash-In, Cash-Out, Profit — wie viel
-- müssen wir für Steuern zurücklegen, wie viel können wir uns auszahlen".
-- Das Geschäftskonto wird bewusst NICHT angebunden. Die Ausgaben kommen aus
-- den Rechnungs-Mails: Ein Abgleich auf Railway (tools/finanzen/ im
-- Workflow-Repo) sucht sie in Gmail, legt das PDF in Drive unter
-- „Finanzen / Belege / JJJJ-MM" ab und liest die Beträge aus. Die Einnahmen
-- kommen wie bisher aus den Aufträgen im Kunden-Reiter.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen (Wegwerf-Helfer wie in sql/009)
-- ------------------------------------------------------------
create or replace function public.xpo_policy_uebernehmen(ziel text)
returns void
language plpgsql
as $$
declare
  ausdruck text;
begin
  select p.qual into ausdruck
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('time_entries','daily_team','daily_personal','tasks')
    and p.qual is not null
  order by case p.tablename
             when 'time_entries' then 0 when 'daily_team' then 1 else 2 end
  limit 1;

  if ausdruck is null then
    raise exception
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neuen Tabellen dürfen nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;

-- ------------------------------------------------------------
-- 1) Ausgaben — eine Rechnung je Zeile
--
--   id            gmail_<Mail-ID>[_<n>] aus dem Abgleich, hand_<…> von Hand
--   status        ok | pruefen (Betrag oder Datum unsicher) | doppelt
--                 (dieselbe Rechnung kam zweimal) | verworfen (keine
--                 Rechnung — bleibt stehen, damit die Mail nicht jedes Mal
--                 neu gelesen wird)
--   *_eur         in Euro umgerechnet (EZB-Kurs am Rechnungsdatum), wenn die
--                 Rechnung in einer anderen Währung kam
--   korrigiert    von Hand geändert — der Abgleich fasst die Zeile nie wieder an
-- ------------------------------------------------------------
create table if not exists public.expenses (
  id               text primary key,
  message_id       text,
  konto            text,
  eingang_at       timestamptz,
  lieferant        text,
  rechnungsnummer  text,
  rechnungsdatum   date,
  leistung_von     date,
  leistung_bis     date,
  waehrung         text not null default 'EUR',
  netto            numeric(12,2),
  ust              numeric(12,2),
  brutto           numeric(12,2),
  netto_eur        numeric(12,2),
  ust_eur          numeric(12,2),
  brutto_eur       numeric(12,2),
  reverse_charge   boolean not null default false,
  kategorie        text,
  beschreibung     text,
  status           text not null default 'ok'
                   check (status in ('ok','pruefen','doppelt','verworfen')),
  grund            text,
  drive_file_id    text,
  drive_link       text,
  betreff          text,
  absender         text,
  korrigiert       boolean not null default false,
  source           text not null default 'gmail' check (source in ('gmail','hand')),
  updated_at       timestamptz not null default now()
);

create index if not exists expenses_datum_idx on public.expenses (rechnungsdatum);
create index if not exists expenses_mail_idx on public.expenses (message_id);

select public.xpo_policy_uebernehmen('expenses');

-- ------------------------------------------------------------
-- 2) Feste Kosten — euer Tool-Stack
--
-- Dient dem Abgleich: Kam für ein Tool im Monat keine Rechnung, zählt der
-- hier eingetragene Betrag als erwartete Ausgabe, und das Dashboard zeigt
-- „Rechnung fehlt". So ist der Monat vollständig, auch wenn ein Anbieter
-- seine Rechnung nur im Kundenportal ablegt.
--
--   suchwort   woran die Rechnung des Tools erkannt wird (Teil des
--              Lieferantennamens, z. B. „close" oder „instantly")
--   rhythmus   monatlich | jaehrlich
-- ------------------------------------------------------------
create table if not exists public.fixed_costs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  suchwort    text not null,
  betrag      numeric(12,2) not null check (betrag >= 0),
  ist_netto   boolean not null default true,
  waehrung    text not null default 'EUR',
  rhythmus    text not null default 'monatlich' check (rhythmus in ('monatlich','jaehrlich')),
  ab          date not null,
  bis         date,
  kategorie   text,
  notiz       text,
  updated_at  timestamptz not null default now()
);

select public.xpo_policy_uebernehmen('fixed_costs');

grant select, insert, update, delete on public.expenses, public.fixed_costs to anon, authenticated;

-- ------------------------------------------------------------
-- 3) Stellschrauben für die Rücklagen (Tim, 01.10.2026: 30 %, Rest 50/50)
-- ------------------------------------------------------------
insert into public.settings (key, value, note) values
  ('steuer_ruecklage_prozent', 30,  'Rücklage für Einkommen- und Gewerbesteuer in % vom Gewinn — bis der Steuerberater einen Satz nennt'),
  ('auszahlung_anteil_tim',    50,  'Anteil Tim am auszahlbaren Gewinn in % — der Rest geht an Simon'),
  ('ust_satz_prozent',         19,  'Umsatzsteuer auf eure Rechnungen in % — 2026 ohne Kleinunternehmerregelung')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 4) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 5) Gegenprobe — beide angelegt und geschützt
-- ------------------------------------------------------------
select t.tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = t.tabelle
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = t.tabelle
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung
from (values ('expenses'), ('fixed_costs')) as t(tabelle);
