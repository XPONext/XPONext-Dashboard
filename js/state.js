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
  goals:         [], // Wochenprojekt + Engpass je Woche aus "weekly_goals"
  monthGoals:    [], // Monatsprojekt aus "monthly_goals" (erst nach sql/009)
  commitments:   [], // Wochen-Commitments aus "weekly_commitments"
  projects:      [], // Langzeitprojekte aus "projects"
  projectSteps:  [], // Zugehörige Schritte aus "project_steps"
  customers:     [], // Kunden und interne Zuordnungen aus "customers"
  meetings:      [], // Alt: Termine je Tag und Person aus Close-Tasks ("daily_meetings") — nur noch Rueckfall
  salesMeetings: [], // Jeder Kalendertermin aus Close ("sales_meetings", sql/010)
  salesTabelleDa: false,  // sql/010 ist ausgefuehrt
  salesMeetingsOk: false, // ... und der Abgleich hat schon Termine geliefert — erst dann zaehlen sie
  salesCalls:    [], // Jeder Anruf aus Close mit Person aus der Leitung ("sales_calls", sql/011)
  salesCallsOk:  false, // erst wenn der Abgleich Anrufe geliefert hat — vorher zaehlt daily_calls
  callTargets:   {}, // Tagesvorgabe fuers Team je Datum ("daily_call_targets")
  syncStatus:    {}, // Zustand der Abgleiche je Schluessel ("sync_status")
  salesLeads:    {}, // Je Lead mit Termin/Opportunity: erste Konversation, Auftraege ("sales_leads", sql/012)
  salesLeadsOk:  false,
  salesLeadsTabelleDa: false,
  instantlyDaily: [], // Cold Emails je Kampagne und Tag ("instantly_daily", sql/013)
  expenses:      [], // Ausgaben aus Rechnungs-Mails und von Hand ("expenses", sql/014)
  finanzenTabelleDa: false,
  calls:         [], // Calls je Tag und Person aus "daily_calls"
  settings:      {}, // Stellschrauben aus "settings", key -> Zahl
  leistungen:    [], // Leistungsarten aus tracker_options (kind = leistung)
  revenues:      [], // Rohe Umsatzeintraege aus "revenues" — zum Bearbeiten
  revenueMonths: [], // Umsatz je Kunde und Monat aus der Sicht "revenue_months"
  ladeFehler:    null, // Meldung, wenn Kunden/Umsaetze nicht geladen werden konnten

  boardWeekIdx: 0,    // aktuell im Aufgaben-Board angezeigte Woche (Index in WEEKS)
  ztWeekIdx: null,    // aktuell im Zeittracking angezeigte Woche; null = noch nicht gesetzt
  fokusWeekIdx: null, // Woche fuer Wochenprojekt und Commitments auf "Heute"; null = laufende Woche
  heuteTag: null      // Tag fuer das Cockpit auf "Heute" (YYYY-MM-DD); null = heute
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
    if(!state.salesMeetingsOk){
      dataTeam[wi].termineGebucht += Number(t.termineGebucht)||0;
      dataTeam[wi].termineShowup += Number(t.termineShowup)||0;
    }
    const closes = t.closes || [];
    dataTeam[wi].closesCount += closes.length;
    dataTeam[wi].closesSum += closes.reduce((s,v)=>s+(Number(v)||0),0);
  });
  if(state.salesMeetingsOk){
    // Termine kommen nur noch aus dem Close-Kalender, rueckwirkend ab Juni.
    // Die Handeingaben bis 07.09. und die Task-Zaehlung ab 21.09. bleiben in
    // der Datenbank, zaehlen aber nicht mehr mit — der Kalender deckt beide
    // Zeitraeume ab, und die alte Summe aus beiden hat doppelt gezaehlt
    // (21.09.2026: 7 statt 4).
    const { alle, buchungen } = erstgespraeche();
    buchungen.forEach(t=>{
      const wi = weekIndexForDate(t.gebuchtTag);
      if(wi >= 0) dataTeam[wi].termineGebucht += 1;
    });
    alle.forEach(t=>{
      if(!FAND_STATT.has(t.ergebnis)) return;
      const wi = weekIndexForDate(t.tag);
      if(wi >= 0) dataTeam[wi].termineShowup += 1;
    });
  } else {
    // Rueckfall bis sql/010: Termine aus den "Meeting …"-Tasks in Close.
    state.meetings.forEach(m=>{
      const wi = weekIndexForDate(m.date);
      if(wi < 0) return;
      dataTeam[wi].termineGebucht += Number(m.booked) || 0;
      dataTeam[wi].termineShowup  += Number(m.showup) || 0;
    });
  }

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

/* ---------- Termine aus dem Close-Kalender (sql/010) ----------

   Als Termin zaehlt nur das Erstgespraech (Tim, 01.10.2026). Der Abgleich auf
   Railway liefert jeden Kalendertermin mit einem vorgeschlagenen Ergebnis.
   Welcher davon das Erstgespraech ist, steht hier und nicht im Abgleich —
   damit eine Korrektur im Dashboard sofort wirkt und eine geaenderte Regel
   rueckwirkend gilt, ohne dass irgendetwas neu abgeglichen werden muss.

   Je Lead, der Reihe nach:
   - Ein Titel wie "Onboarding", "Check-in" oder "Austausch" ist ein Folgetermin.
   - Ab dem ersten gewonnenen Auftrag ist jeder Termin ein Kundentermin.
   - Das erste Gespraech, das stattfand oder noch ansteht, ist DAS
     Erstgespraech. Alles danach ist Folgetermin.
   - No-Shows und Absagen davor sind Versuche desselben Erstgespraechs: Sie
     senken die Show-up-Rate, zaehlen aber nicht als weitere Buchung. Genau
     das hat die alte Zaehlung falsch gemacht — jedes Verschieben war dort
     eine neue Buchung. */

const FOLGE_TITEL = /onboarding|check.?in|kick.?off|jour fixe|abstimmung|austausch|feedback|review|follow.?up|workshop|schulung|übergabe|nächste schritte/i;

/* "unklar" heisst: Close hat den Termin als erledigt gefuehrt, aber es gibt
   keine Spur eines Gespraechs. Er zaehlt als stattgefunden, bis jemand etwas
   anderes sagt — das Dashboard fragt bei diesen nach. */
export const FAND_STATT = new Set(["stattgefunden","unklar"]);

export function terminErgebnis(t){
  return t.outcome_override || t.outcome;
}

// Je kleiner, desto staerker der Beleg — entscheidet bei doppelten Einladungen.
const BELEG_RANG = { stattgefunden: 0, no_show: 1, abgesagt: 2, unklar: 3, geplant: 4 };

/* Alle Termine mit Art ("erst" | "folge"), der Art ohne Korrektur (artAuto),
   wirksamem Ergebnis und lokalem Termin- und Buchungstag. */
export function termineMitArt(){
  const proLead = new Map();
  state.salesMeetings.forEach(t=>{
    const k = t.lead_id || t.id;
    if(!proLead.has(k)) proLead.set(k, []);
    proLead.get(k).push(t);
  });
  const raus = [];
  proLead.forEach(alle=>{
    // Zwei Einladungen fuer denselben Lead zur selben Uhrzeit sind ein Termin —
    // etwa wenn Tim und Simon beide eingeladen haben (SM Architektur, 01.09.2026:
    // einmal mit Zusammenfassung, einmal ohne Spur). Es bleibt der mit dem
    // staerksten Beleg.
    const proStart = new Map();
    alle.forEach(t=>{
      const k = new Date(t.starts_at).getTime();
      const bisher = proStart.get(k);
      if(!bisher || BELEG_RANG[terminErgebnis(t)] < BELEG_RANG[terminErgebnis(bisher)]) proStart.set(k, t);
    });
    const liste = [...proStart.values()];
    liste.sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at));
    let erstVorbei = false;
    liste.forEach(t=>{
      const ergebnis = terminErgebnis(t);
      const tag = localDateStr(t.starts_at);
      const istFolge = erstVorbei || FOLGE_TITEL.test(t.title || "") ||
                       (!!t.client_since && tag >= t.client_since);
      const artAuto = istFolge ? "folge" : "erst";
      const art = t.kind_override || artAuto;
      if(art === "erst" && (FAND_STATT.has(ergebnis) || ergebnis === "geplant")) erstVorbei = true;
      raus.push({ ...t, art, artAuto, ergebnis, tag, gebuchtTag: localDateStr(t.booked_at) });
    });
  });
  return raus.sort((a,b)=> new Date(a.starts_at) - new Date(b.starts_at));
}

/* alle      — jeder Erstgespraechs-Termin, auch abgesagte Versuche
   buchungen — je Lead einer, am Tag der ersten Buchung */
export function erstgespraeche(){
  const alle = termineMitArt().filter(t=>t.art === "erst");
  const ersteBuchung = new Map();
  alle.forEach(t=>{
    const k = t.lead_id || t.id;
    const bisher = ersteBuchung.get(k);
    if(!bisher || new Date(t.booked_at) < new Date(bisher.booked_at)) ersteBuchung.set(k, t);
  });
  return { alle, buchungen: [...ersteBuchung.values()] };
}

/* Show-up-Rate im Zeitraum [von, bis] (lokale Tage): gefuehrte durch faellige
   Erstgespraeche. Beides dieselbe Gruppe — die alte Zaehlung teilte Show-ups
   nach Termintag durch Buchungen nach Buchungstag. */
export function showupQuote(von, bis){
  const faellig = erstgespraeche().alle
    .filter(t=>t.tag >= von && t.tag <= bis && t.ergebnis !== "geplant");
  const gefuehrt = faellig.filter(t=>FAND_STATT.has(t.ergebnis)).length;
  return {
    gefuehrt,
    faellig: faellig.length,
    unklar: faellig.filter(t=>t.ergebnis === "unklar").length,
    quote: faellig.length ? gefuehrt / faellig.length : null
  };
}

/* Termine im Zeitraum [von, bis] (lokale Tage) — eine Stelle fuer den
   Vertrieb-Reiter. Vor sql/010 aus den alten Quellen (Handeingabe plus
   Task-Zaehlung), damit die Seite nicht leer steht. */
export function termineImZeitraum(von, bis){
  if(state.salesMeetingsOk){
    const { alle, buchungen } = erstgespraeche();
    const faellig = alle.filter(t=>t.tag >= von && t.tag <= bis && t.ergebnis !== "geplant");
    return {
      gebucht: buchungen.filter(t=>t.gebuchtTag >= von && t.gebuchtTag <= bis).length,
      gefuehrt: faellig.filter(t=>FAND_STATT.has(t.ergebnis)).length,
      faellig: faellig.length,
      unklar: faellig.filter(t=>t.ergebnis === "unklar").length
    };
  }
  let gebucht = 0, gefuehrt = 0;
  Object.entries(state.dailyTeam).forEach(([tag, t])=>{
    if(tag < von || tag > bis) return;
    gebucht += Number(t.termineGebucht) || 0;
    gefuehrt += Number(t.termineShowup) || 0;
  });
  state.meetings.forEach(m=>{
    if(m.date < von || m.date > bis) return;
    gebucht += Number(m.booked) || 0;
    gefuehrt += Number(m.showup) || 0;
  });
  return { gebucht, gefuehrt, faellig: null, unklar: 0 };
}

/* Auftraege, die im Zeitraum beauftragt wurden: Anzahl und Auftragswert
   (beim Retainer der erste Monatsbetrag, wie in auftragswertInWoche). */
export function auftraegeImZeitraum(von, bis){
  const liste = state.revenues.filter(r=>r.period_start >= von && r.period_start <= bis);
  return { anzahl: liste.length, wert: liste.reduce((s,r)=>s + (Number(r.amount) || 0), 0) };
}

/* Lead-Gen-Stunden im Zeitraum, je Person oder alle: Zeit auf "Neukunden" im
   Zeittracker plus Nachgetragenes — dieselben Quellen wie in
   buildWeeklyAggregates, nur nach Tagen statt nach Wochen. */
export function leadGenStunden(von, bis, person){
  let std = 0;
  Object.entries(state.dailyPersonal).forEach(([tag, personen])=>{
    if(tag < von || tag > bis) return;
    Object.entries(personen).forEach(([p, d])=>{
      if(!person || p === person) std += Number(d.leadGenHours) || 0;
    });
  });
  state.timeEntries.forEach(e=>{
    if(e.state === "Pause" || !/neukunden/i.test(String(e.zuordnung || ""))) return;
    if(person && e.person !== person) return;
    const tag = localDateStr(e.ts);
    if(tag >= von && tag <= bis) std += (Number(e.duration_minutes) || 0) / 60;
  });
  return std;
}

/* Wann der Close-Abgleich zuletzt lief: Jeder Lauf frischt updated_at aller
   Termine auf. null, wenn es noch keinen gab. */
export function letzterTerminAbgleich(){
  let spaetester = null;
  state.salesMeetings.forEach(t=>{
    if(t.source !== "close" || !t.updated_at) return;
    const d = new Date(t.updated_at);
    if(!spaetester || d > spaetester) spaetester = d;
  });
  return spaetester;
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

/* ---------- Anrufe aus Close (sql/011) ----------

   Seit 01.10.2026 kommt jeder Anruf aus Close als eigene Zeile, mit der
   Person aus der Leitung ("Tim Business" / "Simon Business"). Vorher zaehlte
   ein LaunchAgent auf Tims Mac abgehakte Tasks und schrieb alles Tim zu — am
   28.09.2026 standen 49 Calls bei Tim, tatsaechlich 10 von Tim und 37 von
   Simon. Solange der neue Abgleich noch nichts geliefert hat, rechnen die
   Funktionen hier wie vorher aus daily_calls.

   Ein "Call" ist ein gewaehlter Anruf, erreicht oder nicht — daran misst sich
   die Tagesvorgabe. Von Hand nachgetragene Calls (daily_calls, Quelle
   "dashboard") sind Anrufe ausserhalb von Close und kommen dazu. */

/* Art eines Anrufs nach dem Lead-Status VOR dem Anruf — der steht fest, auch
   wenn der Anruf den Status aendert.
   kalt:  kein aktives Interesse, auch Re-Engagement nach einer Absage
   warm:  der Lead hat Interesse gezeigt
   kunde: laufende oder fruehere Kunden — Betreuung, kein Vertrieb */
const STATUS_KALT  = ["cold","keine interesse","not interested","lost","bad fit","nicht mehr kontaktieren"];
const STATUS_KUNDE = ["client","ex kunde"];
// So lange nach einem erreichten Anruf zaehlt ein Erstgespraech bzw. der erste
// gewonnene Auftrag als Ergebnis dieses Anrufs.
const TERMIN_NACH_ANRUF_TAGE = 30;
const CLOSE_NACH_ANRUF_TAGE = 180;

export function anrufArt(c){
  const s = String(c.status_before || "").trim().toLowerCase();
  if(STATUS_KUNDE.includes(s)) return "kunde";
  if(!s || STATUS_KALT.includes(s)) return "kalt";
  return "warm";
}

function anrufTag(c){ return localDateStr(c.started_at); }

function vonHandNachgetragen(datum, person){
  return state.calls
    .filter(c=>c.source === "dashboard" && c.date === datum && (!person || c.person === person))
    .reduce((s,c)=>s + (Number(c.calls) || 0), 0);
}

export function callsAmTag(datum, person){
  if(!state.salesCallsOk){
    return state.calls
      .filter(c=>c.date === datum && (!person || c.person === person))
      .reduce((s,c)=>s + (Number(c.calls) || 0), 0);
  }
  return state.salesCalls.filter(c=>anrufTag(c) === datum && (!person || c.person === person)).length
       + vonHandNachgetragen(datum, person);
}

export function callsGesamt(){
  if(!state.salesCallsOk) return state.calls.reduce((s,c)=>s + (Number(c.calls) || 0), 0);
  return state.salesCalls.length +
    state.calls.filter(c=>c.source === "dashboard").reduce((s,c)=>s + (Number(c.calls) || 0), 0);
}

/* Die Vorgabe des Tages: alle Call-Tasks, die heute oder frueher faellig
   waren — die noch offenen plus die heute erledigten.

   Eine fruehere Fassung hat nur die HEUTE faelligen Tasks gezaehlt, mit der
   Begruendung, Rueckstand sei kein Tagespensum. In der Praxis lag sie damit
   daneben: Bei 137 ueberfaelligen und 6 heute faelligen Tasks waeren 27
   gemachte Calls als "450 % Zielerreichung" erschienen. Wer seine Inbox
   abarbeitet, arbeitet am Rueckstand — also ist die Inbox das Mass. Der
   ueberfaellige Anteil steht daneben.

   Seit sql/011 eine Zahl fuers Team (daily_call_targets): Die Tasks haengen
   alle an Tims Close-Nutzer. Fuer Tage davor gilt, was in daily_calls steht. */
export function vorgabeAmTag(datum, person){
  const neu = state.callTargets[datum];
  if(neu) return Number(neu.target) || null;
  const zeilen = state.calls.filter(c=>c.date === datum && (!person || c.person === person));
  if(!zeilen.length) return null;
  const summe = zeilen.reduce((s,c)=>{
    const gesamt = Number(c.target);
    return Number.isFinite(gesamt) ? s + gesamt : s;
  }, 0);
  return summe || null;
}

export function rueckstandAmTag(datum, person){
  const neu = state.callTargets[datum];
  if(neu) return Number(neu.target_overdue) || 0;
  return state.calls
    .filter(c=>c.date === datum && (!person || c.person === person))
    .reduce((s,c)=>s + (Number(c.target_overdue) || 0), 0);
}

/* Warm/kalt je Tag. Alte Eintraege ohne Aufteilung liefern null — die sollen
   nicht als "0 warm" erscheinen, das waere eine Aussage, die niemand gemacht hat. */
export function callsNachArt(datum, person){
  if(state.salesCallsOk){
    const tag = state.salesCalls.filter(c=>anrufTag(c) === datum && (!person || c.person === person));
    return {
      warm: tag.filter(c=>anrufArt(c) === "warm").length,
      kalt: tag.filter(c=>anrufArt(c) === "kalt").length
    };
  }
  const zeilen = state.calls.filter(c=>c.date === datum && (!person || c.person === person));
  const hat = zeilen.some(c=>c.calls_warm != null || c.calls_cold != null);
  if(!hat) return null;
  return {
    warm: zeilen.reduce((s,c)=>s + (Number(c.calls_warm) || 0), 0),
    kalt: zeilen.reduce((s,c)=>s + (Number(c.calls_cold) || 0), 0)
  };
}

/* Alle Tage mit Calls oder Vorgabe, aufsteigend. */
export function callTage(){
  const tage = new Set(state.calls.map(c=>c.date));
  Object.keys(state.callTargets).forEach(t=>tage.add(t));
  state.salesCalls.forEach(c=>tage.add(anrufTag(c)));
  return [...tage].sort();
}

/* Kennzahlen je Person im Zeitraum [von, bis] (lokale Tage). person null =
   Anrufe ohne Leitung.

   Termine und Auftraege sind Teamzahlen — hier steht nicht, wem sie gehoeren,
   sondern wie oft sie auf erreichte Anrufe DIESER Person folgten (Tim,
   01.10.2026: "Call to Termin" statt "Call to Warm", dazu "Call to Close").

   Gerechnet wird je Lead, nicht je Anruf: Von den Leads, die die Person im
   Zeitraum kalt (bzw. warm) erreicht hat — wie viele bekamen binnen 30 Tagen
   danach ein Erstgespraech? Zuerst gab es hier nur den letzten Anruf vor der
   Buchung. Damit lag "kalt -> Termin" fast immer bei 0: Ein kalter Lead wird
   nach dem ersten Gespraech "Warm", und erst ein Folgeanruf legt den Termin.
   Cold Calls sahen dadurch wertlos aus. Ein Lead, der erst kalt und dann warm
   angerufen wurde, zaehlt jetzt in beiden Spalten.

   -> Close: von allen im Zeitraum erreichten Leads die, deren erster Auftrag
   in Close binnen 180 Tagen nach dem Anruf gewonnen wurde. Juengere Anrufe
   haben dafuer noch Zeit — die Rate eines laufenden Zeitraums steigt also
   noch. */
export function anrufKennzahlen(von, bis, person){
  const imZeitraum = state.salesCalls.filter(c=>{
    const tag = anrufTag(c);
    return tag >= von && tag <= bis && (person === undefined || c.person === person);
  });
  const erreicht = imZeitraum.filter(c=>c.reached);

  // Je Art: Lead -> Zeitpunkte der erreichten Anrufe
  const leads = { kalt: new Map(), warm: new Map() };
  erreicht.forEach(c=>{
    const art = anrufArt(c);
    if(art === "kunde" || !c.lead_id) return;
    if(!leads[art].has(c.lead_id)) leads[art].set(c.lead_id, []);
    leads[art].get(c.lead_id).push(new Date(c.started_at).getTime());
  });

  const buchung = new Map();
  if(state.salesMeetingsOk) erstgespraeche().buchungen.forEach(t=>{ if(t.lead_id) buchung.set(t.lead_id, t); });
  const TAG = 86400000;

  const mitTermin = art => [...leads[art]].filter(([lead, zeiten])=>{
    const t = buchung.get(lead);
    if(!t) return false;
    const gebucht = new Date(t.booked_at).getTime();
    return zeiten.some(z=>gebucht >= z && gebucht <= z + TERMIN_NACH_ANRUF_TAGE * TAG);
  }).length;

  const alleLeads = new Map();
  ["kalt", "warm"].forEach(art=>leads[art].forEach((zeiten, lead)=>{
    alleLeads.set(lead, (alleLeads.get(lead) || []).concat(zeiten));
  }));
  const closes = [...alleLeads].filter(([lead, zeiten])=>{
    const t = buchung.get(lead);
    if(!t || !t.client_since) return false;
    const gewonnen = new Date(t.client_since + "T12:00:00").getTime();
    return zeiten.some(z=>gewonnen >= z - TAG && gewonnen <= z + CLOSE_NACH_ANRUF_TAGE * TAG);
  }).length;

  // Termine je Person: Leads (kalt oder warm erreicht), die binnen 30 Tagen
  // ein Erstgespraech bekamen — jeder Lead einmal, auch wenn er in beiden
  // Spalten steht.
  const termine = [...alleLeads].filter(([lead, zeiten])=>{
    const t = buchung.get(lead);
    if(!t) return false;
    const gebucht = new Date(t.booked_at).getTime();
    return zeiten.some(z=>gebucht >= z && gebucht <= z + TERMIN_NACH_ANRUF_TAGE * TAG);
  }).length;

  return {
    anwahlen: imZeitraum.length,
    erreicht: erreicht.length,
    termine,
    kaltLeads: leads.kalt.size,
    warmLeads: leads.warm.size,
    leads: alleLeads.size,
    terminKalt: mitTermin("kalt"),
    terminWarm: mitTermin("warm"),
    closes
  };
}


/* ---------- Woher kommen Termine und Auftraege? (sql/012) ----------

   Der Kanal eines Leads ist, womit die erste Konversation kam (Tim,
   01.10.2026): eine Antwort auf eine Cold Email (Notiz "Reply-Klassifikation"
   vom Reply-Sync) oder ein erreichter Anruf. Ist in Close das Feld "Quelle"
   gesetzt, gilt das — fuer Empfehlungen, den externen Terminsetzer oder eine
   Antwort, die den Reply-Sync nie erreicht hat. */

export const KANAELE = ["Cold Email", "Cold Call", "Sonstige"];

export function leadKanal(lead_id){
  const l = state.salesLeads[lead_id];
  if(!l) return "Sonstige";
  if(l.quelle_close) return l.quelle_close;
  const reply = l.first_reply_at ? new Date(l.first_reply_at).getTime() : null;
  const call = l.first_conversation_call_at ? new Date(l.first_conversation_call_at).getTime() : null;
  if(reply != null && (call == null || reply <= call)) return "Cold Email";
  if(call != null) return "Cold Call";
  return "Sonstige";
}

/* Die Leads, deren Erstgespraech im Zeitraum gebucht wurde — und was aus
   ihnen wurde: ob der Termin stattfand, ob ein Angebot (Opportunity in Close)
   und ob ein Auftrag daraus wurde, auch wenn das erst spaeter kam. Zuerst
   standen hier die im Zeitraum gewonnenen Auftraege neben den im Zeitraum
   gebuchten Terminen; das waren verschiedene Leads, und "Termin -> Auftrag"
   haette nicht gestimmt. gruppe(lead_id) ordnet zu (Kanal, Kampagne, Team). */
function kohorte(von, bis, gruppe){
  const leer = k=>({ name: k, termine: 0, gefuehrt: 0, angebote: 0, auftraege: 0, wert: 0 });
  const zeilen = new Map();
  const { alle, buchungen } = erstgespraeche();
  buchungen.forEach(t=>{
    if(t.gebuchtTag < von || t.gebuchtTag > bis) return;
    const k = gruppe(t.lead_id);
    if(k == null) return;
    if(!zeilen.has(k)) zeilen.set(k, leer(k));
    const z = zeilen.get(k);
    z.termine++;
    const schluessel = t.lead_id || t.id;
    if(alle.some(x=>(x.lead_id || x.id) === schluessel && FAND_STATT.has(x.ergebnis))) z.gefuehrt++;
    const l = t.lead_id && state.salesLeads[t.lead_id];
    if(!l) return;
    if(l.first_opportunity_at && localDateStr(l.first_opportunity_at) >= t.gebuchtTag) z.angebote++;
    if(l.won_at && l.won_at >= t.gebuchtTag){
      z.auftraege++;
      z.wert += Number(l.won_value) || 0;
    }
  });
  return zeilen;
}

/* Trichter fuers Team: Termin -> gefuehrt -> Angebot -> Auftrag, dazu die
   offenen Angebote (Stand heute, unabhaengig vom Zeitraum). */
export function trichter(von, bis){
  const z = kohorte(von, bis, ()=>"Team").get("Team") || { termine: 0, gefuehrt: 0, angebote: 0, auftraege: 0, wert: 0 };
  const offen = Object.values(state.salesLeads).filter(l=>Number(l.open_value) > 0);
  return { ...z, offenAnzahl: offen.length, offenWert: offen.reduce((s,l)=>s + Number(l.open_value), 0) };
}

/* Instantly-Zahlen im Zeitraum, je Kampagne oder gesamt */
export function mailsImZeitraum(von, bis, kampagneId){
  const r = { sent: 0, replies: 0, auto: 0, interessiert: 0 };
  state.instantlyDaily.forEach(t=>{
    if(t.date < von || t.date > bis || (kampagneId && t.campaign_id !== kampagneId)) return;
    r.sent += Number(t.sent) || 0;
    r.replies += Number(t.replies) || 0;
    r.auto += Number(t.replies_auto) || 0;
    r.interessiert += Number(t.opportunities) || 0;
  });
  return r;
}

/* Je Kanal: Kohorte plus Aufwand — bei Cold Call die kalten Anrufe im
   Zeitraum, bei Cold Email die versendeten Mails. Kanaele aus dem Feld
   "Quelle" kommen als eigene Zeilen dazu. */
export function kanalKennzahlen(von, bis){
  const zeilen = kohorte(von, bis, leadKanal);
  KANAELE.forEach(k=>{ if(!zeilen.has(k)) zeilen.set(k, { name: k, termine: 0, gefuehrt: 0, angebote: 0, auftraege: 0, wert: 0 }); });
  const raus = [...zeilen.values()].map(z=>({ ...z, kanal: z.name, aufwand: null, einheit: null }));
  const call = raus.find(z=>z.kanal === "Cold Call");
  if(call && state.salesCallsOk){
    call.aufwand = state.salesCalls.filter(c=>{
      const tag = localDateStr(c.started_at);
      return tag >= von && tag <= bis && anrufArt(c) === "kalt";
    }).length;
    call.einheit = "kalte Anrufe";
  }
  const mail = raus.find(z=>z.kanal === "Cold Email");
  if(mail && state.instantlyDaily.length){
    mail.aufwand = mailsImZeitraum(von, bis).sent;
    mail.einheit = "Mails";
  }
  const reihenfolge = k=>{ const i = KANAELE.indexOf(k); return i < 0 ? KANAELE.length - 0.5 : i; };
  return raus.sort((a,b)=>reihenfolge(a.kanal) - reihenfolge(b.kanal));
}

/* Cold Email je Kampagne: versendet, Antworten (ohne automatische),
   Interessenten aus Instantly — und aus der Kohorte die Termine, Angebote und
   Auftraege der Leads aus dieser Kampagne. */
export function kampagnenKennzahlen(von, bis){
  const namen = new Map();
  state.instantlyDaily.forEach(t=>namen.set(t.campaign_id, t.campaign_name));
  Object.values(state.salesLeads).forEach(l=>{ if(l.kampagne_id) namen.set(l.kampagne_id, l.kampagne || namen.get(l.kampagne_id)); });
  const kohorteJe = kohorte(von, bis, lead=>{
    const l = state.salesLeads[lead];
    return l && l.kampagne_id && leadKanal(lead) === "Cold Email" ? l.kampagne_id : null;
  });
  return [...namen].map(([id, name])=>{
    const m = mailsImZeitraum(von, bis, id);
    const k = kohorteJe.get(id) || { termine: 0, gefuehrt: 0, angebote: 0, auftraege: 0, wert: 0 };
    // name zuletzt: die Kohorte bringt ein eigenes Feld "name" (die ID) mit
    return { ...m, ...k, id, name: name || id, antworten: m.replies - m.auto };
  }).filter(z=>z.sent || z.termine || z.auftraege)
    .sort((a,b)=>b.termine - a.termine || b.sent - a.sent);
}

/* Erreichbarkeit kalter Anrufe nach Wochentag (Mo–Fr) und Stunde (8–18 Uhr):
   wann gehen Bueros ans Telefon? */
export function anrufzeiten(von, bis){
  const raster = {};
  state.salesCalls.forEach(c=>{
    const tag = localDateStr(c.started_at);
    if(tag < von || tag > bis || anrufArt(c) !== "kalt") return;
    const d = new Date(c.started_at);
    const wt = d.getDay(), h = d.getHours();
    if(wt < 1 || wt > 5 || h < 8 || h > 18) return;
    const k = wt + "-" + h;
    raster[k] = raster[k] || { n: 0, erreicht: 0 };
    raster[k].n++;
    if(c.reached) raster[k].erreicht++;
  });
  return raster;
}

/* Bis zum Auftrag, je im Zeitraum gewonnenem Lead: wie viele Gespraeche
   (erreichte Anrufe plus gefuehrte Termine davor) und wie viele Tage seit dem
   ersten Termin. Anrufe gibt es erst ab 13.07.2026 — bei frueheren
   Auftraegen fehlen die Anrufe davor. */
export function wegZumAuftrag(von, bis){
  const gewonnen = Object.values(state.salesLeads).filter(l=>l.won_at && l.won_at >= von && l.won_at <= bis);
  if(!gewonnen.length) return null;
  const termine = termineMitArt();
  let gespraeche = 0, tage = 0, mitTagen = 0;
  gewonnen.forEach(l=>{
    const ende = new Date(l.won_at + "T23:59:59").getTime();
    const anrufe = state.salesCalls.filter(c=>c.lead_id === l.lead_id && c.reached &&
      new Date(c.started_at).getTime() <= ende).length;
    const eigene = termine.filter(t=>t.lead_id === l.lead_id && new Date(t.starts_at).getTime() <= ende);
    gespraeche += anrufe + eigene.filter(t=>FAND_STATT.has(t.ergebnis)).length;
    if(eigene.length){
      tage += (ende - new Date(eigene[0].starts_at).getTime()) / 86400000;
      mitTagen++;
    }
  });
  return {
    auftraege: gewonnen.length,
    gespraeche: gespraeche / gewonnen.length,
    tage: mitTagen ? tage / mitTagen : null
  };
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


/* Der auf "Heute" gewaehlte Tag. null steht fuer den aktuellen Tag — damit die
   Ansicht nach Mitternacht von selbst mitgeht, statt auf gestern stehenzubleiben. */
export function gewaehlterTag(){
  return state.heuteTag || localDateStr(new Date());
}


/* ---------- Finanzen (sql/014) ----------

   Einnahmen aus den Auftraegen im Kunden-Reiter (revenue_months, netto),
   Ausgaben aus den Rechnungs-Mails (expenses) — das Geschaeftskonto ist
   bewusst nicht angebunden (Tim, 01.10.2026). Es zaehlen nur Rechnungen, die
   da sind — keine Schaetzung fuer noch nicht abgerechnete Tools (Tim,
   02.10.2026: „Es geht darum, was wir jetzt schon fuer Rechnungen bekommen
   haben. Alle weiteren werden eingefuegt, wenn die kommen."). Die Tabelle
   fixed_costs aus sql/014 bleibt stehen, wird aber nicht mehr gelesen.

   Gerechnet wird je Monat, in Euro, netto:
     Gewinn          = Einnahmen - Ausgaben
     USt-Zahllast    = Einnahmen x USt-Satz - Vorsteuer aus den Rechnungen
                       (Reverse Charge hebt sich auf und zaehlt nicht)
     Steuerruecklage = Ruecklage-Satz auf den Jahresgewinn ueber dem Freibetrag
                       (24.500 EUR: Gewerbesteuer-Freibetrag der GbR; die beiden
                       Grundfreibetraege von je 12.348 EUR liegen knapp darueber —
                       gilt, weil Tim und Simon sonst kein Einkommen haben,
                       Tim 02.10.2026). Kumuliert je Kalenderjahr.
     Puffer          = wird aus den Gewinnen nach Steuerruecklage aufgebaut, bis
                       er 3 durchschnittliche Monatsausgaben deckt (Tim, 02.10.2026:
                       „ein Puffer von 3 Monatsausgaben sollte definitiv bestehen")
     Auszahlbar      = Gewinn - Steuerruecklage - Puffer-Zufuehrung, nach Anteil

   Den Kontostand kennt das Dashboard nicht (keine Bankanbindung). Der Puffer gilt
   darum als aufgebaut, wenn die Gewinne dafuer gereicht haben — vorausgesetzt,
   ausgezahlt wurde nur, was hier als auszahlbar stand. */

export function finanzEinstellungen(){
  const zahl = (k, vorgabe)=>{ const w = Number(state.settings[k]); return Number.isFinite(w) ? w : vorgabe; };
  return {
    ruecklage: zahl("steuer_ruecklage_prozent", 30) / 100,
    anteilTim: zahl("auszahlung_anteil_tim", 50) / 100,
    ust: zahl("ust_satz_prozent", 19) / 100,
    pufferMonate: zahl("puffer_monatsausgaben", 3),
    freibetrag: zahl("steuerfrei_gewinn_jahr", 24500)
  };
}

function ausgabeTag(e){
  return e.rechnungsdatum || (e.eingang_at ? localDateStr(e.eingang_at) : null);
}

/* Netto in Euro. Fehlt netto, aber brutto und USt sind da, wird gerechnet. */
function ausgabeNetto(e){
  if(e.netto_eur != null) return Number(e.netto_eur);
  if(e.brutto_eur != null) return Number(e.brutto_eur) - (Number(e.ust_eur) || 0);
  return 0;
}

export function zaehlendeAusgaben(von, bis){
  return state.expenses.filter(e=>{
    if(e.status !== "ok" && e.status !== "pruefen") return false;
    const tag = ausgabeTag(e);
    return tag && tag >= von && tag <= bis;
  });
}

/* Tag im Monat, an dem der Anbieter zuletzt abgerechnet hat — oder null. */
function monateZwischen(von, bis){
  const raus = [];
  let m = monatsStart(von);
  while(m <= bis){
    raus.push(m);
    const [j, mo] = m.split("-").map(Number);
    m = mo === 12 ? (j + 1) + "-01-01" : j + "-" + String(mo + 1).padStart(2, "0") + "-01";
  }
  return raus;
}

/* Kennzahlen je Monat und fuer den ganzen Zeitraum. */
export function finanzen(von, bis){
  const e = finanzEinstellungen();
  // Puffer und Jahres-Ruecklage bauen sich ueber alle Monate seit dem ersten
  // Umsatz oder der ersten Rechnung auf — darum ab dort rechnen, auch wenn nur
  // ein Monat angezeigt wird.
  const erster = [
    ...state.revenueMonths.map(r=>r.month_start),
    ...state.expenses.filter(x=>x.status === "ok" || x.status === "pruefen").map(ausgabeTag)
  ].filter(Boolean).map(monatsStart).sort()[0];
  const alle = monateZwischen(erster && erster < von ? erster : von, bis).map(m=>{
    const ende = letzterTagDesMonats(m);
    const einnahmen = state.revenueMonths.filter(r=>r.month_start === m)
      .reduce((s, r)=>s + (Number(r.amount) || 0), 0);
    const rechnungen = zaehlendeAusgaben(m, ende);
    const ausgaben = rechnungen.reduce((s, x)=>s + ausgabeNetto(x), 0);
    const vorsteuer = rechnungen.filter(x=>!x.reverse_charge).reduce((s, x)=>s + (Number(x.ust_eur) || 0), 0);
    const gewinn = einnahmen - ausgaben;
    const ustZahllast = einnahmen * e.ust - vorsteuer;
    // Steuerruecklage, Puffer und Auszahlbares haengen an den Vormonaten — siehe unten.
    return { monat: m, einnahmen, ausgaben, vorsteuer, gewinn, ustZahllast, steuer: 0, auszahlbar: 0,
             rechnungen: rechnungen.length, pruefen: rechnungen.filter(x=>x.status === "pruefen").length };
  });
  // Puffer: Ziel = 3 x Durchschnitt der Ausgaben der (bis zu) 3 Monate davor —
  // der laufende Monat hat erst einen Teil seiner Rechnungen und wuerde das
  // Ziel druecken. Im ersten Monat zaehlt er selbst.
  // Aufgefuellt wird aus dem Gewinn nach Steuerruecklage, nie aus einem Verlust.
  let bestand = 0, jahr = null, gewinnJahr = 0;
  alle.forEach((m, i)=>{
    // Steuerruecklage auf den Jahresgewinn ueber dem Freibetrag: Ein Verlustmonat
    // gibt Ruecklage wieder frei, weil am Ende nur der Jahresgewinn zaehlt.
    if(m.monat.slice(0, 4) !== jahr){ jahr = m.monat.slice(0, 4); gewinnJahr = 0; }
    const vorher = Math.max(0, gewinnJahr - e.freibetrag) * e.ruecklage;
    gewinnJahr += m.gewinn;
    m.gewinnJahr = gewinnJahr;
    m.steuer = Math.max(0, gewinnJahr - e.freibetrag) * e.ruecklage - vorher;
    m.auszahlbar = m.gewinn - m.steuer;
    const letzte = i ? alle.slice(Math.max(0, i - 3), i) : [m];
    m.pufferZiel = e.pufferMonate * letzte.reduce((s, x)=>s + x.ausgaben, 0) / letzte.length;
    m.puffer = Math.min(Math.max(0, m.pufferZiel - bestand), Math.max(0, m.auszahlbar));
    bestand += m.puffer;
    m.pufferBestand = bestand;
    m.auszahlbar -= m.puffer;
  });
  const monate = alle.filter(m=>m.monat >= monatsStart(von));
  const summe = feld => monate.reduce((s, m)=>s + m[feld], 0);
  const gesamt = {};
  ["einnahmen", "ausgaben", "vorsteuer", "gewinn", "ustZahllast", "steuer", "puffer", "auszahlbar", "rechnungen", "pruefen"].forEach(f=>{ gesamt[f] = summe(f); });
  const letzter = monate[monate.length - 1];
  gesamt.pufferZiel = letzter ? letzter.pufferZiel : 0;
  gesamt.pufferBestand = letzter ? letzter.pufferBestand : 0;
  gesamt.gewinnJahr = letzter ? letzter.gewinnJahr : 0;
  gesamt.tim = gesamt.auszahlbar * e.anteilTim;
  gesamt.simon = gesamt.auszahlbar - gesamt.tim;
  gesamt.zuruecklegen = Math.max(0, gesamt.ustZahllast) + gesamt.steuer + gesamt.puffer;
  return { monate, gesamt, einstellungen: e };
}

/* Ausgaben je Lieferant im Zeitraum. */
export function ausgabenNachLieferant(von, bis){
  const gruppen = new Map();
  const gruppe = (name, kategorie)=>{
    const k = String(name || "Unbekannt").trim();
    if(!gruppen.has(k)) gruppen.set(k, { name: k, kategorie, netto: 0, rechnungen: 0, pruefen: 0 });
    return gruppen.get(k);
  };
  zaehlendeAusgaben(von, bis).forEach(x=>{
    const g = gruppe(x.lieferant, x.kategorie);
    g.netto += ausgabeNetto(x);
    g.rechnungen++;
    if(x.status === "pruefen") g.pruefen++;
  });
  return [...gruppen.values()].sort((a, b)=>b.netto - a.netto);
}
