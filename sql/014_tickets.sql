-- ============================================================
-- 014 — Ticket-Boards und Sprints
--
-- Entwicklungsprojekte (zuerst der Mail-Agent, Repo xpo-mail-agent) laufen
-- nach Scrum: Tickets mit User Story und Akzeptanzkriterien, Sprints von
-- einer Woche. Bisher standen die Tickets als Markdown-Dateien im Repo —
-- jetzt führt das Dashboard, und Claude liest und schreibt dieselben Zeilen
-- über ein kleines Tool im Repo (tools/tickets/).
--
-- Bewusst getrennt von `tasks`: Das Wochen-Board im Reiter „Arbeit" bleibt
-- für die Alltagsaufgaben. Ein Ticket hat andere Felder (Story, Kriterien,
-- Umsetzung, Branch) und hängt an einem Sprint, nicht an einer Kalenderwoche.
--
-- Zwei Tabellen:
--   sprints  — je Board durchnummeriert, mit Ziel und Zeitraum
--   tickets  — je Board, Schlüssel wie MA-008
--
-- `board` ist ein Kürzel ("mail-agent"). Welche Boards es gibt und welches
-- Präfix ihre Tickets bekommen, steht in js/config.js (TICKET_BOARDS) — ein
-- neues Projekt braucht kein neues SQL.
--
-- NICHTS ANZUPASSEN. Einfach komplett einfügen und ausführen. Wiederholbar —
-- ein zweiter Lauf ändert nichts und löscht nichts.
-- ============================================================


-- ------------------------------------------------------------
-- 0) Die bestehende Absicherung übernehmen
--
-- Derselbe Wegwerf-Helfer wie in sql/009: liest die Policy einer
-- bestehenden Tabelle und überträgt sie. Ohne Vorlage bricht er ab — lieber
-- gar nichts anlegen als etwas Ungeschütztes.
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
-- 1) Sprints
--
-- Nummer je Board statt globaler ID: „Sprint 3" heißt im Gespräch und im
-- Ticket dasselbe. end_date ist gespeichert, nicht gerechnet — ein Sprint
-- darf ausnahmsweise länger laufen (Feiertage), ohne dass die Regel lügt.
-- ------------------------------------------------------------
create table if not exists public.sprints (
  board      text    not null,
  nummer     integer not null check (nummer > 0),
  ziel       text,
  start_date date    not null,
  end_date   date    not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (board, nummer),
  check (end_date >= start_date)
);

select public.xpo_policy_uebernehmen('sprints');


-- ------------------------------------------------------------
-- 2) Tickets
--
-- Die Felder entsprechen dem bisherigen Ticket-Format im Repo
-- (backlog/README.md), damit der Umzug verlustfrei ist:
--
--   key              — „MA-008". Eindeutig über alle Boards, weil das Präfix
--                      je Board verschieden ist.
--   status           — dieselben fünf Werte wie im Repo. Bewusst nicht die
--                      Schlüssel des Wochen-Boards (inarbeit, done …): Claude
--                      und die Branch-Regeln sprechen diese Sprache.
--   sprint           — Nummer, kein Fremdschlüssel: Ein Ticket darf für einen
--                      Sprint vorgemerkt werden, der noch nicht angelegt ist.
--   akzeptanz        — Markdown-Checkliste („- [ ] …"), so wie im Repo.
--   blockiert_durch  — Ticket-Schlüssel oder Verweise auf offene Punkte.
-- ------------------------------------------------------------
create table if not exists public.tickets (
  id              bigint generated always as identity primary key,
  board           text not null,
  key             text not null unique,
  titel           text not null,
  status          text not null default 'backlog'
                  check (status in ('backlog','bereit','in_arbeit','review','fertig')),
  sprint          integer,
  prioritaet      text not null default 'mittel'
                  check (prioritaet in ('hoch','mittel','niedrig')),
  aufwand         integer check (aufwand is null or aufwand >= 0),
  assignee        text,
  branch          text,
  blockiert_durch text[] not null default '{}',
  user_story      text,
  akzeptanz       text,
  umsetzung       text,
  notizen         text,
  erstellt        date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tickets_board_idx  on public.tickets (board, status);
create index if not exists tickets_sprint_idx on public.tickets (board, sprint);

select public.xpo_policy_uebernehmen('tickets');


-- ------------------------------------------------------------
-- 3) Hilfsfunktion wieder entfernen
-- ------------------------------------------------------------
drop function if exists public.xpo_policy_uebernehmen(text);


-- ------------------------------------------------------------
-- 4) Gegenprobe — beide Tabellen müssen auftauchen und geschützt sein
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
from (values ('sprints'), ('tickets')) as t(tabelle);
