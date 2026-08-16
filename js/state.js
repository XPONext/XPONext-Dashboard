/* Zentraler Anwendungszustand und die daraus abgeleiteten Kennzahlen.
   Kein DOM, keine Netzwerkzugriffe — nur Daten und Rechnen. */

import { N_WEEKS, PERSONS, LEVERS, WEEKLY_TARGET, STATUS_COLUMNS } from "./config.js";
import { weekIndexForDate } from "./utils/weeks.js";
import { localDateStr } from "./utils/format.js";

/* Ein einziges Objekt statt zehn Modul-Variablen: importierte Bindings sind
   in ES-Modulen schreibgeschuetzt, Eigenschaften eines importierten Objekts
   dagegen nicht. */
export const state = {
  dailyPersonal: {}, // { "2026-07-14": { tim: {leadGenHours, hebel:{...}}, simon: {...} } }
  dailyTeam:     {}, // { "2026-07-14": {termineGebucht, termineShowup, closes} }
  data:          {}, // Wochen-Aggregate aus dailyPersonal
  dataTeam:      {}, // Wochen-Aggregate aus dailyTeam
  timeEntries:   [], // Rohe Zeittracking-Einträge aus "time_entries"
  tasks:         [], // Rohe Aufgaben aus "tasks"
  goals:         [], // Wochenfokus aus "weekly_goals"
  commitments:   [], // Wochen-Commitments aus "weekly_commitments"
  projects:      [], // Langzeitprojekte aus "projects"
  projectSteps:  [], // Zugehörige Schritte aus "project_steps"
  customers:     [], // Kunden und interne Zuordnungen aus "customers"
  revenueMonths: [], // Umsatz je Kunde und Monat aus der Sicht "revenue_months"

  boardWeekIdx: 0,    // aktuell im Aufgaben-Board angezeigte Woche (Index in WEEKS)
  ztWeekIdx: null     // aktuell im Zeittracking angezeigte Woche; null = noch nicht gesetzt
};

/* Rechnet die Tageswerte zu Wochenwerten hoch.
   Tage ausserhalb des in WEEKS definierten Zeitraums fallen bewusst heraus. */
export function buildWeeklyAggregates(){
  const data = {}, dataTeam = {};
  for(let i=0;i<N_WEEKS;i++){
    data[i] = { tim: {leadGenHours:0, hebel:{}}, simon: {leadGenHours:0, hebel:{}} };
    dataTeam[i] = { termineGebucht:0, termineShowup:0, closesCount:0, closesSum:0 };
  }
  Object.entries(state.dailyPersonal).forEach(([date, persons])=>{
    const wi = weekIndexForDate(date);
    if(wi<0) return;
    PERSONS.forEach(([key])=>{
      const d = persons[key];
      if(!d) return;
      data[wi][key].leadGenHours += Number(d.leadGenHours)||0;
      LEVERS.forEach(([lk])=>{
        data[wi][key].hebel[lk] = (data[wi][key].hebel[lk]||0) + (Number(d.hebel[lk])||0);
      });
    });
  });
  Object.entries(state.dailyTeam).forEach(([date, t])=>{
    const wi = weekIndexForDate(date);
    if(wi<0) return;
    dataTeam[wi].termineGebucht += Number(t.termineGebucht)||0;
    dataTeam[wi].termineShowup += Number(t.termineShowup)||0;
    const closes = t.closes || [];
    dataTeam[wi].closesCount += closes.length;
    dataTeam[wi].closesSum += closes.reduce((s,v)=>s+(Number(v)||0),0);
  });
  state.data = data;
  state.dataTeam = dataTeam;
}

export function personEntry(i, person){
  const w = (state.data[i] && state.data[i][person]) || {};
  return {
    leadGenHours: Number(w.leadGenHours)||0,
    hebel: w.hebel || {}
  };
}

export function teamEntry(i){
  const w = state.dataTeam[i] || {};
  return {
    termineGebucht: Number(w.termineGebucht)||0,
    termineShowup: Number(w.termineShowup)||0,
    closes: Number(w.closesCount)||0,
    umsatz: Number(w.closesSum)||0
  };
}

export function hebelHours(entry){
  return LEVERS.reduce((s,[k])=>s+(Number(entry.hebel[k])||0),0);
}

export function combinedEntry(i){
  const t = personEntry(i,"tim"), s = personEntry(i,"simon"), team = teamEntry(i);
  return {
    leadGenHours: t.leadGenHours+s.leadGenHours,
    termineGebucht: team.termineGebucht,
    termineShowup: team.termineShowup,
    closes: team.closes,
    umsatz: team.umsatz,
    hebelHours: hebelHours(t)+hebelHours(s)
  };
}

export function cumulative(){
  const c = {leadGenHours:0,termineGebucht:0,termineShowup:0,closes:0,umsatz:0,hebel:0};
  let weeksLogged = 0, onTarget = 0, bestWeek = null, bestUmsatz = -1;
  for(let i=0;i<N_WEEKS;i++){
    const e = combinedEntry(i);
    const hasAny = e.leadGenHours||e.termineGebucht||e.termineShowup||e.closes||e.umsatz||e.hebelHours>0;
    if(!hasAny) continue;
    weeksLogged++;
    c.leadGenHours += e.leadGenHours; c.termineGebucht += e.termineGebucht; c.termineShowup += e.termineShowup;
    c.closes += e.closes; c.umsatz += e.umsatz;
    c.hebel += e.hebelHours;
    if(e.umsatz >= WEEKLY_TARGET.umsatz) onTarget++;
    if(e.umsatz > bestUmsatz){ bestUmsatz = e.umsatz; bestWeek = i; }
  }
  return {c, weeksLogged, onTarget, bestWeek, bestUmsatz};
}

/* Status robust bestimmen — auch für Alt-Aufgaben ohne status-Feld. */
export function normStatus(t){
  if(t.status && STATUS_COLUMNS.some(c=>c[0]===t.status)) return t.status;
  return t.done ? "done" : "backlog";
}


/* ---------- Kunden und Stundenlohn ----------
   Bewusst kalendarisch gerechnet, NICHT ueber WEEKS: Retainer laufen in
   Monaten, und weekIndexForDate() liefert ausserhalb des definierten
   Zeitraums -1, wodurch Eintraege still aus allen Summen fielen. */

/* "2026-08-16" -> "2026-08-01" */
export function monatsStart(datumStr){
  return datumStr.slice(0, 7) + "-01";
}

/* Liste der Monatsanfaenge von vonMonat bis bisMonat, beide einschliesslich. */
export function monateZwischen(vonMonat, bisMonat){
  const raus = [];
  let [j, m] = vonMonat.split("-").map(Number);
  const [jb, mb] = bisMonat.split("-").map(Number);
  while(j < jb || (j === jb && m <= mb)){
    raus.push(j + "-" + String(m).padStart(2, "0") + "-01");
    m++;
    if(m > 12){ m = 1; j++; }
  }
  return raus;
}

export function kundeNach(id){
  return state.customers.find(c=>String(c.id) === String(id)) || null;
}

/* Umsatz eines Kunden im Zeitraum [vonMonat, bisMonat] (Monatsanfaenge). */
export function umsatzImZeitraum(customerId, vonMonat, bisMonat){
  return state.revenueMonths
    .filter(r=>String(r.customer_id) === String(customerId)
            && r.month_start >= vonMonat && r.month_start <= bisMonat)
    .reduce((s,r)=> s + (Number(r.amount) || 0), 0);
}

/* Getrackte Arbeitsstunden eines Kunden im Zeitraum.
   Pausen zaehlen nicht als Arbeitszeit. */
export function stundenImZeitraum(customerId, vonMonat, bisMonat){
  const bisEnde = letzterTagDesMonats(bisMonat);
  const minuten = state.timeEntries
    .filter(e=>{
      if(e.state === "Pause") return false;
      if(String(e.customer_id || "") !== String(customerId)) return false;
      const tag = localDateStr(e.ts);
      return tag >= vonMonat && tag <= bisEnde;
    })
    .reduce((s,e)=> s + (Number(e.duration_minutes) || 0), 0);
  return minuten / 60;
}

export function letzterTagDesMonats(monatsStartStr){
  const [j, m] = monatsStartStr.split("-").map(Number);
  const d = new Date(j, m, 0);   // Tag 0 des Folgemonats = letzter Tag
  return j + "-" + String(m).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

/* Alle getrackten Arbeitsstunden im Zeitraum — auch die ohne Kunden.
   Braucht man fuer den Abdeckungsgrad. */
export function stundenGesamt(vonMonat, bisMonat){
  const bisEnde = letzterTagDesMonats(bisMonat);
  const minuten = state.timeEntries
    .filter(e=>{
      if(e.state === "Pause") return false;
      const tag = localDateStr(e.ts);
      return tag >= vonMonat && tag <= bisEnde;
    })
    .reduce((s,e)=> s + (Number(e.duration_minutes) || 0), 0);
  return minuten / 60;
}
