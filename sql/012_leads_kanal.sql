-- ============================================================
-- 012 — Woher kommen Termine und Aufträge? Ein Lead je Zeile
--
-- Für jeden Lead mit Termin oder Opportunity in Close: wann die erste
-- Konversation war, und womit — eine Antwort auf eine Cold Email (Notiz
-- „Reply-Klassifikation" vom Reply-Sync) oder ein erreichter Anruf. Daraus
-- rechnet das Dashboard den Kanal (js/state.js, leadKanal): Was zuerst kam,
-- ist der Kanal. Seit 13.07.2026 waren es 15 Erstgespräche aus Cold Emails,
-- 15 aus Cold Calls und 3 sonstige.
--
-- Dazu die Opportunities aus Close: erste Opportunity (= Angebot) und
-- gewonnene Aufträge mit Datum und Wert.
--
-- Der Abgleich läuft auf Railway (tools/vertrieb_sync/leads.py im
-- Workflow-Repo).
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
      'Keine bestehende Policy als Vorlage gefunden. Bitte melden — die neue Tabelle darf nicht ungeschützt angelegt werden.';
  end if;

  execute format('alter table public.%I enable row level security', ziel);
  execute format('drop policy if exists "app_secret_all" on public.%I', ziel);
  execute format(
    'create policy "app_secret_all" on public.%I for all using (%s) with check (%s)',
    ziel, ausdruck, ausdruck);
end $$;

-- ------------------------------------------------------------
-- 1) Ein Lead je Zeile
--
--   first_reply_at        erste Notiz „Reply-Klassifikation: …" — der Lead hat
--                         auf eine Cold Email geantwortet (egal wie)
--   first_positive_at     erste „Reply-Klassifikation: positiv"
--   first_conversation_call_at
--                         erster ERREICHTER Anruf (Notiz beginnt nicht mit „ne",
--                         keine falsche Nummer, nicht 0 Sek. ohne Notiz)
--   first_call_at         erster Anruf überhaupt
--   first_incoming_mail_at erste eingehende Mail in Close (ohne Reply-Sync)
--   quelle_close          das Feld „Quelle" am Lead in Close, wenn gesetzt —
--                         schlägt die Ableitung (für Empfehlung, externen
--                         Setter, oder wenn die Ableitung danebenliegt)
--   first_opportunity_at  erste Opportunity in Close (= Angebot)
--   won_at / won_value    erster gewonnener Auftrag, Summe aller gewonnenen
--                         Opportunities in Euro
--   open_value            Summe der offenen Opportunities (Angebote, über die
--                         noch nicht entschieden ist), in Euro
--   kampagne_id / kampagne die Instantly-Kampagne, über die der Lead
--                         angeschrieben wurde (Suche über die Mail-Adresse)
-- ------------------------------------------------------------
create table if not exists public.sales_leads (
  lead_id                     text primary key,
  first_reply_at              timestamptz,
  first_positive_at           timestamptz,
  first_conversation_call_at  timestamptz,
  first_call_at               timestamptz,
  first_incoming_mail_at      timestamptz,
  quelle_close                text,
  first_opportunity_at        timestamptz,
  won_at                      date,
  won_value                   numeric(12,2),
  open_value                  numeric(12,2),
  kampagne_id                 text,
  kampagne                    text,
  updated_at                  timestamptz not null default now()
);

-- Falls die Tabelle aus einem früheren Lauf dieser Datei schon da ist
alter table public.sales_leads add column if not exists open_value  numeric(12,2);
alter table public.sales_leads add column if not exists kampagne_id text;
alter table public.sales_leads add column if not exists kampagne    text;

select public.xpo_policy_uebernehmen('sales_leads');

grant select, insert, update, delete on public.sales_leads to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 3) Gegenprobe — angelegt und geschützt
-- ------------------------------------------------------------
select 'sales_leads' as tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'sales_leads'
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'sales_leads'
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung;
