-- ============================================================
-- 013 — Cold Emails je Kampagne und Tag aus Instantly
--
-- Wie viele Mails jede Kampagne an einem Tag verschickt hat, wie viele
-- Antworten und Interessenten kamen. Daraus rechnet das Dashboard den Aufwand
-- je Termin (versendete Mails je Termin aus Cold Email) und die Tabelle
-- "Cold Email nach Kampagne". Welcher Lead zu welcher Kampagne gehört, steht
-- in sales_leads (sql/012).
--
-- Der Abgleich läuft auf Railway (tools/vertrieb_sync/instantly.py im
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
-- 1) Eine Zeile je Kampagne und Tag
--
--   sent            versendete Mails
--   replies         Antworten insgesamt (eindeutig je Lead)
--   replies_auto    davon automatische (Abwesenheit u. ä.)
--   opportunities   Leads, die Instantly als interessiert führt
-- ------------------------------------------------------------
create table if not exists public.instantly_daily (
  date            date not null,
  campaign_id     text not null,
  campaign_name   text not null default '',
  sent            integer not null default 0,
  replies         integer not null default 0,
  replies_auto    integer not null default 0,
  opportunities   integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (date, campaign_id)
);

select public.xpo_policy_uebernehmen('instantly_daily');

grant select, insert, update, delete on public.instantly_daily to anon, authenticated;

-- ------------------------------------------------------------
-- 2) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);

-- ------------------------------------------------------------
-- 3) Gegenprobe — angelegt und geschützt
-- ------------------------------------------------------------
select 'instantly_daily' as tabelle,
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'instantly_daily'
       ) then 'angelegt' else 'FEHLT' end as status,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'instantly_daily'
       ) then 'geschützt' else 'UNGESCHÜTZT!' end as absicherung;
