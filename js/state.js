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

  return {
    anwahlen: imZeitraum.length,
    erreicht: erreicht.length,
    kaltLeads: leads.kalt.size,
    warmLeads: leads.warm.size,
    leads: alleLeads.size,
    terminKalt: mitTermin("kalt"),
    terminWarm: mitTermin("warm"),
    closes
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
