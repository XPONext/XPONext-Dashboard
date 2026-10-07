-- ============================================================
-- 015 — Kontostände und wann das Geld eines Auftrags kommt
--
-- Tim, 07.10.2026: Drei Konten (Geschäftskonto, Rücklagen, Auszahlungen),
-- keins angebunden. Rücklagen und Auszahlungen tragt ihr von Hand ein. Das
-- Geschäftskonto rechnet das Dashboard ab eurem letzten Stand selbst weiter:
-- plus was Kunden zahlen, minus Rechnungen und Auszahlungen. Stimmt es mal
-- nicht, tragt ihr es neu ein, und es geht von dort aus weiter.
--
-- Je Konto und Tag eine Zeile. Der neueste Tag ist der aktuelle Stand. Wer für
-- einen Tag noch einmal einträgt, überschreibt ihn — so korrigiert man einen
-- Tippfehler. Welche Konten es gibt, steht in js/config.js (KONTEN).
--
-- Dazu bekommt jeder Umsatz zwei Felder: wann das Geld kommt und in wie
-- vielen Raten. Leer heißt: zwei Wochen nach „beauftragt am", beim
-- Einzelauftrag auf einmal, beim Retainer monatlich. Abschnitt 3 trägt euren
-- Stand vom 07.10.2026 ein.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen (Wegwerf-Helfer wie in sql/014)
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
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neue Tabelle darf nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;

-- ------------------------------------------------------------
-- 1) Kontostände
--
--   konto    Schlüssel aus KONTEN in js/config.js (geschaeftskonto, ruecklagen)
--   datum    Tag, zu dem der Stand gilt
--   betrag   Stand in Euro, darf negativ sein
-- ------------------------------------------------------------
create table if not exists public.kontostaende (
  konto       text not null,
  datum       date not null,
  betrag      numeric(12,2) not null,
  updated_at  timestamptz not null default now(),
  primary key (konto, datum)
);

select public.xpo_policy_uebernehmen('kontostaende');

grant select, insert, update, delete on public.kontostaende to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Wann das Geld eines Umsatzes kommt — im Kunden-Reiter am Umsatz
--
--   zahlung_am     erste (oder einzige) Zahlung; leer = 14 Tage nach period_start
--   zahlung_raten  in so vielen Monatsraten; leer = Einzelauftrag auf einmal,
--                  Retainer je Monat eine
-- ------------------------------------------------------------
alter table public.revenues add column if not exists zahlung_am date;
alter table public.revenues add column if not exists zahlung_raten integer;

alter table public.revenues drop constraint if exists zahlung_raten_positiv;
alter table public.revenues add constraint zahlung_raten_positiv
  check (zahlung_raten is null or zahlung_raten >= 1);

-- ------------------------------------------------------------
-- 3) Euer Stand vom 07.10.2026 (Tim)
--
-- „Den ganzen Umsatz bis auf die 1.200, die in den nächsten zwei Monaten
-- reinkommen, kannst du verbuchen, dass es diese Woche noch reinkommt" —
-- gebucht auf Montag, 12.10.2026. Die 1.200 € sind Zittrich (GEO), in zwei
-- Raten am 07.11. und 07.12. Rücklagenkonto: 1.000 €.
-- Nur wo noch nichts eingetragen ist — ein zweiter Lauf ändert nichts.
-- ------------------------------------------------------------
update public.revenues set zahlung_am = '2026-10-12', zahlung_raten = 1
where zahlung_am is null and id in (
  'a46cf0d3-2ebf-4057-b08e-32c7187a0587',  -- chuong, Webseite, 1.500 €
  'f0752404-46cb-4f9c-8340-5d55becbe812',  -- Bünger, Webseite, 300 €
  '1c6f33f6-69ea-4662-a4c8-6c4985d2933a',  -- Protours, Google Ads + GEO, 2.200 €
  'ee67f145-66cd-41a6-8f44-1117e3a24e0d',  -- Böckenholt-Korte, Webseite, 620 €
  '2c171a7e-fed6-4fb8-9e0b-16692ae3ae74'   -- Noesser-Padberg, Retainer 3 × 667 €, alles auf einmal
);

update public.revenues set zahlung_am = '2026-11-07', zahlung_raten = 2
where zahlung_am is null
  and id = '41f9cdd5-4481-4f9b-a38e-2a1b16963d63';  -- Zittrich, GEO, 1.200 € in 2 Raten

insert into public.kontostaende (konto, datum, betrag)
values ('ruecklagen', '2026-10-07', 1000)
on conflict (konto, datum) do nothing;

-- ------------------------------------------------------------
-- 4) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 5) Gegenprobe — muss „angelegt" und „geschützt" zeigen
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
from (values ('kontostaende')) as t(tabelle);
