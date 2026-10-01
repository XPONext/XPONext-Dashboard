/* Ansicht: Calls auf "Heute" — wie viel heute telefoniert wurde, und von wem.

   Die Zahlen kommen alle 30 Minuten aus Close — seit 01.10.2026 vom Abgleich
   auf Railway, jeder Anruf einzeln mit der Person aus der Leitung (sql/011).

   Bis 01.10.2026 war die Hauptzahl hier, was liegengebliebene Calls kosten:
   Tagesvorgabe aus Close-Tasks minus gemachte Calls, mal 3,35 € je Call. Die
   Vorgabe kennt aber nur Follow-up-Tasks, keine Kaltakquise — an einem
   Cold-Call-Tag standen 153 Calls gegen eine Vorgabe von 120, und an Tagen
   ohne Tasks fehlte jede Aussage. Tim: "komplett rausnehmen, lieber auf die
   richtigen KPIs fokussieren". Die Kennzahlen je Person stehen im
   Vertrieb-Reiter (views/vertrieb.js). */

import { num, fmtDate, todayIso } from "../utils/format.js";
import { PERSONS, WEEKS } from "../config.js";
import { state, callsAmTag, rueckstandAmTag, gewaehlterTag, callsNachArt,
         anrufKennzahlen, termineMitArt } from "../state.js";
import { callsSpeichern, fetchAllData } from "../data.js";
import { openModal } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner, flashSaved } from "../ui/bus.js";
import { weekIndexForDate, findCurrentWeekIndex } from "../utils/weeks.js";
import { sparkline } from "../ui/chart.js";

const VERLAUF_TAGE = 14;

async function neuLaden(){
  try{
    await fetchAllData();
  }catch(e){
    showErrorBanner("Gespeichert, aber die Ansicht konnte nicht aktualisiert werden: " +
                    ((e && e.message) || e) + " — bitte die Seite neu laden.");
  }
  renderAll();
}

/* ---------- Dialog ---------- */

async function nachtragenDialog(){
  // Seit die Anrufe einzeln aus Close kommen, ist der Nachtrag nur noch fuer
  // Anrufe, die nicht ueber Close liefen — er kommt dazu, statt zu ersetzen.
  const ausClose = state.salesCallsOk;
  const ergebnis = await openModal({
    title: ausClose ? "Anrufe außerhalb von Close nachtragen" : "Calls nachtragen",
    submitLabel: "Speichern",
    fields: [
      { name:"date", label:"Tag", type:"date", value: todayIso(), required:true },
      { name:"person", label:"Wer?", type:"select",
        options: PERSONS.map(([k,l])=>[k,l]), value: PERSONS[0][0] },
      { name:"calls", label:"Wie viele Anrufe?", type:"number", min:"0", step:"1",
        required:true, hint: ausClose
          ? "Nur Anrufe, die nicht über Close liefen (z. B. vom Handy). Sie kommen zu den Close-Anrufen dazu; ein zweiter Nachtrag für denselben Tag ersetzt den ersten."
          : "Ersetzt den Wert für diesen Tag, addiert nicht dazu." }
    ],
    validate: w=> Number(w.calls) >= 0 ? null : "Bitte eine Zahl ab 0 eintragen.",
    onSubmit: async w=>{
      await callsSpeichern(w.date, w.person, w.calls, null);
    }
  });
  if(ergebnis) await neuLaden();
  if(ergebnis) flashSaved("clMsg");
}

/* ---------- Tages-Navigation ----------
   Das Cockpit zeigt einen Tag. Wer zurueckblaettert, sieht, was an dem Tag
   gemacht wurde; der Wochenteil darunter geht in die Woche dieses Tages mit.
   Nach vorn geht es nur bis heute — fuer morgen gibt es noch nichts zu zeigen. */
const WOCHENTAG = ["So","Mo","Di","Mi","Do","Fr","Sa"];

function tagPlus(tag, n){
  const d = new Date(tag + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function tagText(tag){
  return WOCHENTAG[new Date(tag + "T12:00:00").getDay()] + " " + fmtDate(tag);
}

function renderTagNav(){
  const tag = gewaehlterTag(), heute = todayIso();
  const istHeute = tag === heute, gestern = tagPlus(heute, -1);
  document.getElementById("tagHeading").textContent =
    istHeute ? "Heute" : tag === gestern ? "Gestern" : tagText(tag);
  document.getElementById("tagLabel").textContent = tagText(tag);
  document.getElementById("tagNext").disabled = tag >= heute;
  document.getElementById("tagPrev").disabled = tag <= WEEKS[0][0];
  document.getElementById("tagHeuteBtn").hidden = istHeute;
}

function tagWechsel(neu){
  const heute = todayIso();
  if(neu > heute) neu = heute;
  if(neu < WEEKS[0][0]) neu = WEEKS[0][0];
  // Heute bleibt "null", damit die Ansicht um Mitternacht von selbst mitgeht.
  state.heuteTag = neu === heute ? null : neu;
  // Der Wochenteil folgt dem Tag. Die laufende Woche bleibt ebenfalls null.
  const wi = weekIndexForDate(neu);
  if(wi >= 0) state.fokusWeekIdx = wi === findCurrentWeekIndex() ? null : wi;
  renderAll();
}

/* ---------- Cockpit ---------- */

function renderTermineAmTag(tag, istHeute){
  const amTag = termineMitArt().filter(t=>t.tag === tag && t.ergebnis !== "abgesagt");
  const erst = amTag.filter(t=>t.art === "erst").length;
  document.getElementById("clTermineHeute").textContent = num(amTag.length, 0);
  const jetzt = Date.now();
  const naechster = istHeute ? amTag.find(t=>new Date(t.starts_at).getTime() > jetzt) : null;
  document.getElementById("clTermineHeuteSub").textContent = [
    (istHeute ? "Termine heute" : "Termine"),
    amTag.length ? (erst === 1 ? "1 Erstgespräch" : erst + " Erstgespräche") : "",
    naechster ? "nächster " + new Date(naechster.starts_at).toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" }) : ""
  ].filter(Boolean).join(" · ");
}

function renderCockpit(){
  renderTagNav();
  const tag = gewaehlterTag();
  const istHeute = tag === todayIso();

  document.getElementById("clCallsLbl").textContent = istHeute ? "Calls heute" : "Calls am " + fmtDate(tag);
  document.getElementById("clHeute").textContent = num(callsAmTag(tag), 0);

  const teile = [];
  if(state.salesCallsOk){
    teile.push(PERSONS.map(([k, l])=>l + " " + callsAmTag(tag, k)).join(" · "));
    const k = anrufKennzahlen(tag, tag);
    if(k.anwahlen) teile.push(num(k.erreicht, 0) + " erreicht");
  }
  document.getElementById("clHeuteSub").textContent = teile.join(" · ") || "noch nichts erfasst";

  const art = callsNachArt(tag);
  document.getElementById("clHeuteArt").textContent = art ? art.warm + " warm · " + art.kalt + " kalt" : "";

  const rueckstand = rueckstandAmTag(tag);
  document.getElementById("clRueckstand").textContent = rueckstand ? num(rueckstand, 0) : "—";

  renderTermineAmTag(tag, istHeute);
  renderVerlauf(tag);
}

/* Die letzten 14 Tage bis zum gewaehlten als Linie unter der Hauptzahl —
   ob heute ein guter Tag ist, sieht man erst im Vergleich. */
function renderVerlauf(tag){
  const tage = [];
  for(let i = VERLAUF_TAGE - 1; i >= 0; i--) tage.push(tagPlus(tag, -i));
  const werte = tage.map(t=>callsAmTag(t));
  const el = document.getElementById("clVerlauf");
  el.innerHTML = werte.some(v=>v > 0) ? sparkline(werte, { hoehe: 44, farbe: "rgba(255,255,255,0.75)" }) : "";
  const schnitt = werte.slice(0, -1).filter(v=>v > 0);
  document.getElementById("clVerlaufLbl").textContent = werte.some(v=>v > 0)
    ? "letzte " + VERLAUF_TAGE + " Tage" + (schnitt.length ? " · Ø " + num(schnitt.reduce((a,b)=>a + b, 0) / schnitt.length, 0) + " an Tagen mit Calls" : "")
    : "";
}

document.getElementById("clNachtragen").addEventListener("click", nachtragenDialog);
document.getElementById("tagPrev").addEventListener("click", ()=>tagWechsel(tagPlus(gewaehlterTag(), -1)));
document.getElementById("tagNext").addEventListener("click", ()=>tagWechsel(tagPlus(gewaehlterTag(), +1)));
document.getElementById("tagHeuteBtn").addEventListener("click", ()=>tagWechsel(todayIso()));

onRender("calls", renderCockpit);
