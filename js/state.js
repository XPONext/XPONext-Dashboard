/* Zentraler Anwendungszustand und die daraus abgeleiteten Kennzahlen.
   Kein DOM, keine Netzwerkzugriffe — nur Daten und Rechnen. */

import { WEEKS, N_WEEKS, PERSONS, LEVERS, WEEKLY_TARGET, STATUS_COLUMNS } from "./config.js";
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
  goals:         [], // Wochenprojekt (Ueberschrift + Beschreibung) aus "weekly_goals"
  commitments:   [], // Wochen-Commitments aus "weekly_commitments"
  projects:      [], // Langzeitprojekte aus "projects"
  projectSteps:  [], // Zugehörige Schritte aus "project_steps"
  customers:     [], // Kunden und interne Zuordnungen aus "customers"
  calls:         [], // Calls je Tag und Person aus "daily_calls"
  settings:      {}, // Stellschrauben aus "settings", key -> Zahl
  leistungen:    [], // Leistungsarten aus tracker_options (kind = leistung)
  revenues:      [], // Rohe Umsatzeintraege aus "revenues" — zum Bearbeiten
  revenueMonths: [], // Umsatz je Kunde und Monat aus der Sicht "revenue_months"
  ladeFehler:    null, // Meldung, wenn Kunden/Umsaetze nicht geladen werden konnten

  boardWeekIdx: 0,    // aktuell im Aufgaben-Board angezeigte Woche (Index in WEEKS)
  ztWeekIdx: null,    // aktuell im Zeittracking angezeigte Woche; null = noch nicht gesetzt
  fokusWeekIdx: null  // Woche fuer Wochenprojekt und Commitments auf "Heute"; null = laufende Woche
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
  // Lead-Gen-Stunden aus dem Zeittracker: alles, was im Popup auf
  // "Neukunden" gebucht wurde, ist Akquise. Die Handeingabe bleibt additiv
  // fuers Nachtragen — vorher war sie der einzige Weg und wurde vergessen.
  state.timeEntries.forEach(e=>{
    if(e.state === "Pause") return;
    if(!/neukunden/i.test(String(e.zuordnung || ""))) return;
    const wi = weekIndexForDate(localDateStr(e.ts));
    if(wi < 0 || !data[wi][e.person]) return;
    data[wi][e.person].leadGenHours += (Number(e.duration_minutes) || 0) / 60;
  });

  // Getrackte Hebel-Stunden aus dem Popup dazu. Seit "Hebel" eine Auswahl im
  // Zeittracker ist, kommt der Grossteil von dort; die Handeingabe im
  // Dashboard bleibt nur noch zum Nachtragen.
  state.timeEntries.forEach(e=>{
    if(String(e.state || "").trim().toLowerCase() !== "hebel") return;
    const wi = weekIndexForDate(localDateStr(e.ts));
    if(wi < 0 || !data[wi][e.person]) return;
    const key = hebelKey(e.hebel);
    data[wi][e.person].hebel[key] =
      (data[wi][e.person].hebel[key] || 0) + (Number(e.duration_minutes) || 0) / 60;
  });

  state.data = data;
  state.dataTeam = dataTeam;
}

/* Ordnet den im Popup gewaehlten Hebel-Namen dem Schluessel aus LEVERS zu.
   Unbekannte Namen (jemand hat in der Datenbank umbenannt) landen unter
   "sonstige" statt still zu verschwinden. */
export const HEBEL_SONSTIGE = "sonstige";
export function hebelKey(name){
  const n = String(name || "").trim().toLowerCase();
  const treffer = LEVERS.find(([, label])=>label.toLowerCase() === n);
  return treffer ? treffer[0] : HEBEL_SONSTIGE;
}

/* Alle Hebel-Kategorien eines Eintrags: die festen aus LEVERS plus alles,
   was zusaetzlich in den Daten steckt. */
export function hebelKategorien(entry){
  const feste = LEVERS.map(([k,l])=>[k,l]);
  const extra = Object.keys(entry.hebel || {})
    .filter(k=>!LEVERS.some(([lk])=>lk === k))
    .map(k=>[k, k === HEBEL_SONSTIGE ? "Sonstige" : k]);
  return feste.concat(extra);
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
  // Ueber ALLE Schluessel, nicht nur LEVERS — sonst fielen getrackte Stunden
  // unter "sonstige" aus der Summe.
  return Object.values(entry.hebel || {}).reduce((s,v)=>s+(Number(v)||0),0);
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


/* ---------- Umsatz: eine einzige Quelle ----------
   Umsatz und Auftraege kommen ausschliesslich aus den Kundeneintraegen.
   Frueher wurden sie zusaetzlich als "Closes" in der Wochen-Eingabe erfasst —
   zwei Orte fuer dieselbe Zahl, die zwangslaeufig auseinanderlaufen. */

/* Realisierter Umsatz insgesamt, aus der Monatssicht. */
export function realisierterUmsatz(){
  return state.revenueMonths.reduce((s,r)=> s + (Number(r.amount) || 0), 0);
}

/* Ein Auftrag zaehlt in der Woche, in der er beauftragt wurde. */
export function auftraegeInWoche(i){
  const w = WEEKS[i];
  if(!w) return [];
  return state.revenues.filter(r=> r.period_start >= w[0] && r.period_start <= w[1]);
}

/* Auftragswert der Woche: beim Einmalauftrag der Gesamtbetrag, beim Retainer
   der erste Monatsbetrag — das ist der Wert, der in dieser Woche gewonnen
   wurde. Die Folgemonate des Retainers zaehlen ueber realisierterUmsatz(). */
export function auftragswertInWoche(i){
  return auftraegeInWoche(i).reduce((s,r)=> s + (Number(r.amount) || 0), 0);
}

export function auftraegeGesamt(){
  return state.revenues.length;
}


/* ---------- Calls und Opportunitaetskosten ----------

   Der Wert je Call ist eine feste Einstellung, keine mitlaufende Rechnung.
   Eine Zahl, die bei jedem neuen Auftrag springt, taugt nicht als Massstab —
   die Opportunitaetskosten wuerden mitspringen und die Aussage waere jeden
   Tag eine andere. */

export function wertJeCall(){
  const w = Number(state.settings.call_value_eur);
  return Number.isFinite(w) && w > 0 ? w : 0;
}

export function callsAmTag(datum, person){
  return state.calls
    .filter(c=>c.date === datum && (!person || c.person === person))
    .reduce((s,c)=>s + (Number(c.calls) || 0), 0);
}

/* Die Vorgabe des Tages. Gemessen wird gegen die HEUTE faelligen Tasks,
   nicht gegen die ganze Inbox — sonst waechst das Ziel genau dann, wenn man
   ohnehin im Rueckstand ist. */
export function vorgabeAmTag(datum, person){
  const zeilen = state.calls.filter(c=>c.date === datum && (!person || c.person === person));
  if(!zeilen.length) return null;
  return zeilen.reduce((s,c)=>{
    const gesamt = Number(c.target);
    const spaet  = Number(c.target_overdue) || 0;
    if(!Number.isFinite(gesamt)) return s;
    return s + Math.max(0, gesamt - spaet);
  }, 0) || null;
}

export function rueckstandAmTag(datum, person){
  return state.calls
    .filter(c=>c.date === datum && (!person || c.person === person))
    .reduce((s,c)=>s + (Number(c.target_overdue) || 0), 0);
}

/* Alle erfassten Tage, aufsteigend. */
/* Warm/kalt je Tag. Alte Eintraege ohne Aufteilung liefern null — die sollen
   nicht als "0 warm" erscheinen, das waere eine Aussage, die niemand gemacht hat. */
export function callsNachArt(datum, person){
  const zeilen = state.calls.filter(c=>c.date === datum && (!person || c.person === person));
  const hat = zeilen.some(c=>c.calls_warm != null || c.calls_cold != null);
  if(!hat) return null;
  return {
    warm: zeilen.reduce((s,c)=>s + (Number(c.calls_warm) || 0), 0),
    kalt: zeilen.reduce((s,c)=>s + (Number(c.calls_cold) || 0), 0)
  };
}

export function callTage(){
  return [...new Set(state.calls.map(c=>c.date))].sort();
}


/* ---------- Auftraege: Stunden, Budget, Leistung ----------

   Die Zeit eines Kunden laesst sich nicht eindeutig einem Auftrag zuordnen —
   der Tracker fragt nach dem Kunden, nicht nach dem Auftrag. Zugerechnet wird
   deshalb ueber den Zeitraum: Was waehrend eines Auftrags auf den Kunden
   gebucht wurde, gehoert zum Auftrag. Laufen mehrere Auftraege desselben
   Kunden gleichzeitig, wird jeder Eintrag gleich auf sie verteilt. */

function heuteStr(){ return localDateStr(new Date()); }

function auftragLaeuftAm(r, tag){
  return tag >= r.period_start && tag <= (r.period_end || "9999-12-31");
}

export function stundenFuerAuftrag(r, von, bis){
  let summe = 0;
  state.timeEntries.forEach(e=>{
    if(e.state === "Pause") return;
    if(String(e.customer_id || "") !== String(r.customer_id)) return;
    const tag = localDateStr(e.ts);
    if(!auftragLaeuftAm(r, tag)) return;
    if(von && tag < von) return;
    if(bis && tag > bis) return;
    const parallel = state.revenues.filter(x=>
      String(x.customer_id) === String(r.customer_id) && auftragLaeuftAm(x, tag)).length || 1;
    summe += (Number(e.duration_minutes) || 0) / 60 / parallel;
  });
  return summe;
}

export function zielStundensatz(){
  const w = Number(state.settings.target_hourly_rate_eur);
  return Number.isFinite(w) && w > 0 ? w : 100;
}

/* Budget in Stunden. Einmalig: Gesamtbetrag / Satz fuer den ganzen Auftrag.
   Retainer: Monatsbetrag / Satz je Monat, verbraucht = Stunden im laufenden
   (oder letzten) Monat. */
export function budgetFuerAuftrag(r){
  const satz = zielStundensatz();
  const heute = heuteStr();
  const laeuft = !r.period_end || r.period_end >= heute;
  if(r.kind === "retainer"){
    const ende = laeuft ? heute : r.period_end;
    const vonM = monatsStart(ende), bisM = letzterTagDesMonats(vonM);
    return { budget: Number(r.amount) / satz, verbraucht: stundenFuerAuftrag(r, vonM, bisM),
             einheit: "im Monat", laeuft };
  }
  return { budget: Number(r.amount) / satz, verbraucht: stundenFuerAuftrag(r),
           einheit: "im Auftrag", laeuft };
}

/* Stundensatz je Leistungsart im Fenster [vonMonat, bisMonat]:
   realisierter Umsatz aus revenue_months / zugerechnete Stunden. */
export function leistungsSaetze(vonMonat, bisMonat){
  const bisEnde = letzterTagDesMonats(bisMonat);
  const gruppen = {};
  state.revenues.forEach(r=>{
    const name = r.service || "Ohne Leistungsart";
    const umsatz = state.revenueMonths
      .filter(m=>String(m.revenue_id) === String(r.id) && m.month_start >= vonMonat && m.month_start <= bisMonat)
      .reduce((s,m)=>s + (Number(m.amount) || 0), 0);
    const stunden = stundenFuerAuftrag(r, vonMonat, bisEnde);
    if(!umsatz && !stunden) return;
    const g = gruppen[name] || (gruppen[name] = { name, umsatz:0, stunden:0, n:0 });
    g.umsatz += umsatz; g.stunden += stunden; g.n++;
  });
  return Object.values(gruppen)
    .map(g=>({ ...g, satz: g.stunden > 0 && g.umsatz > 0 ? g.umsatz / g.stunden : null }))
    .sort((a,b)=>(b.satz || 0) - (a.satz || 0));
}

/* Zeit-Mix je Kunde: Anteil der Arbeitsarten an der Zeit im Fenster. */
export function zeitMixFuerKunde(customerId, vonMonat, bisMonat){
  const bisEnde = letzterTagDesMonats(bisMonat);
  const minuten = {};
  let gesamt = 0;
  state.timeEntries.forEach(e=>{
    if(e.state === "Pause") return;
    if(String(e.customer_id || "") !== String(customerId)) return;
    const tag = localDateStr(e.ts);
    if(tag < vonMonat || tag > bisEnde) return;
    const m = Number(e.duration_minutes) || 0;
    const art = e.state || "Unbekannt";
    minuten[art] = (minuten[art] || 0) + m;
    gesamt += m;
  });
  return {
    stunden: gesamt / 60,
    anteile: Object.entries(minuten).map(([art, m])=>[art, gesamt ? m / gesamt : 0]).sort((a,b)=>b[1]-a[1])
  };
}
