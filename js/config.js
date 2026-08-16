/* Feste Konfiguration: Zeitraum, Ziele, Kategorien.
   Hier stehen nur Werte — keine Logik, keine DOM-Zugriffe. */

/* ---------- Wochen-Definition (14.07.2026 – 31.12.2026, 25 Kalenderwochen) ---------- */
export const WEEKS = [
  ["2026-07-13","2026-07-19"],["2026-07-20","2026-07-26"],["2026-07-27","2026-08-02"],
  ["2026-08-03","2026-08-09"],["2026-08-10","2026-08-16"],["2026-08-17","2026-08-23"],
  ["2026-08-24","2026-08-30"],["2026-08-31","2026-09-06"],["2026-09-07","2026-09-13"],
  ["2026-09-14","2026-09-20"],["2026-09-21","2026-09-27"],["2026-09-28","2026-10-04"],
  ["2026-10-05","2026-10-11"],["2026-10-12","2026-10-18"],["2026-10-19","2026-10-25"],
  ["2026-10-26","2026-11-01"],["2026-11-02","2026-11-08"],["2026-11-09","2026-11-15"],
  ["2026-11-16","2026-11-22"],["2026-11-23","2026-11-29"],["2026-11-30","2026-12-06"],
  ["2026-12-07","2026-12-13"],["2026-12-14","2026-12-20"],["2026-12-21","2026-12-27"],
  ["2026-12-28","2026-12-31"]
];
export const N_WEEKS = WEEKS.length;

export const LEAD_GEN_PER_PERSON = 12; // Std./Woche pro Person (4 Std./Tag x 3 Tage)
export const TOTAL = { leadGen: LEAD_GEN_PER_PERSON * 2 * 25, termineGebucht: 167, termineShowup: 100, closes: 10, umsatz: 20000 };
export const WEEKLY_TARGET = {
  leadGen: LEAD_GEN_PER_PERSON * 2, // kombiniert für beide Personen
  termineGebucht: TOTAL.termineGebucht / N_WEEKS,
  termineShowup: TOTAL.termineShowup / N_WEEKS,
  closes: TOTAL.closes / N_WEEKS,
  umsatz: TOTAL.umsatz / N_WEEKS,
  hebel: 7 // Std./Woche pro Person
};
export const LEVERS = [
  ["callBreakdowns","Call-Breakdowns"],
  ["coldCall","Cold-Call-Breakdowns"],
  ["coachings","Coachings"],
  ["offer","Offer-Verbesserung"],
  ["zielgruppe","Zielgruppenverständnis"]
];
export const PERSONS = [["tim","Tim"],["simon","Simon"]];
export const TOTAL_HEBEL = WEEKLY_TARGET.hebel * PERSONS.length * N_WEEKS; // 350 (7 Std. x 2 Personen x 25 Wochen)

export const PRIORITY_ORDER = { hoch: 0, mittel: 1, niedrig: 2 };

// Kanban-Spalten: [status-key, Anzeigename]
export const STATUS_COLUMNS = [
  ["backlog","Backlog"],
  ["auswahl","Zur Auswahl"],
  ["inarbeit","In Arbeit"],
  ["review","In Review"],
  ["done","Done"]
];

/* ---------- Supabase ----------
   Anon-Key und URL sind öffentlich — der eigentliche Schutz sind die
   RLS-Policies, die auf den Header x-app-secret prüfen. Das Team-Passwort
   steht deshalb nirgends im Code. */
export const SUPABASE_URL = "https://powtvdmtphudlnsffmtk.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvd3R2ZG10cGh1ZGxuc2ZmbXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNTAzNTgsImV4cCI6MjA5OTYyNjM1OH0.WHE73m7pXpD3MnzPQQn0FJ0HTGx_bq0cVBL6G3DkYuo";

export const SECRET_STORAGE_KEY = "xponext_kpi_secret";
export const PERSON_STORAGE_KEY = "xponext_kpi_person";
