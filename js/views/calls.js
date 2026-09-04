/* Ansicht: Calls — wie viele Gespräche laufen, und was es kostet, sie nicht
   zu führen.

   Zwei Dinge, die hier bewusst so sind:

   1. Gemessen wird gegen die HEUTE fälligen Tasks aus Close, nicht gegen die
      gesamte Inbox. Die Inbox enthält auch den Rückstand — wer sie als
      Tagesziel nimmt, wird für Rückstand doppelt bestraft: Das Ziel wächst
      genau dann, wenn man ohnehin hinterherhängt.

   2. Der Wert je Call ist eine feste Einstellung (Startwert 3,35 € aus
      5.200 € bei 1.550 Calls) und keine mitlaufende Rechnung. Eine Zahl, die
      bei jedem neuen Auftrag springt, taugt nicht als Maßstab — die
      Opportunitätskosten würden mitspringen. */

import { euro, euroCent, num, escapeHtml, fmtDate, todayIso } from "../utils/format.js";
import { PERSONS } from "../config.js";
import { state, wertJeCall, callsAmTag, vorgabeAmTag, rueckstandAmTag, callTage,
         callsNachArt } from "../state.js";
import { callsSpeichern, einstellungSpeichern, fetchAllData } from "../data.js";
import { openModal } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner, flashSaved } from "../ui/bus.js";
import { balkenChart, linienChart } from "../ui/chart.js";
import { emptyState } from "../ui/components.js";

const TAGE_IM_VERLAUF = 30;

async function neuLaden(){
  try{
    await fetchAllData();
  }catch(e){
    showErrorBanner("Gespeichert, aber die Ansicht konnte nicht aktualisiert werden: " +
                    ((e && e.message) || e) + " — bitte die Seite neu laden.");
  }
  renderAll();
}

/* Die letzten N Tage, unabhängig davon ob erfasst — Lücken sollen sichtbar
   sein, gerade darum geht es hier. */
function letzteTage(n){
  const raus = [];
  const d = new Date(todayIso() + "T12:00:00");
  for(let i = n - 1; i >= 0; i--){
    const t = new Date(d);
    t.setDate(t.getDate() - i);
    raus.push(t.getFullYear() + "-" +
              String(t.getMonth()+1).padStart(2,"0") + "-" +
              String(t.getDate()).padStart(2,"0"));
  }
  return raus;
}

/* Ein Tag ohne Vorgabe kann keinen Rückstand haben — an einem Wochenende
   oder vor Beginn der Erfassung ist "nicht gemacht" keine Aussage. */
function verpasstAmTag(datum){
  const soll = vorgabeAmTag(datum);
  if(soll == null) return 0;
  return Math.max(0, soll - callsAmTag(datum));
}

/* ---------- Dialoge ---------- */

async function nachtragenDialog(){
  const ergebnis = await openModal({
    title: "Calls nachtragen",
    submitLabel: "Speichern",
    fields: [
      { name:"date", label:"Tag", type:"date", value: todayIso(), required:true },
      { name:"person", label:"Wer?", type:"select",
        options: PERSONS.map(([k,l])=>[k,l]), value: PERSONS[0][0] },
      { name:"calls", label:"Wie viele Calls?", type:"number", min:"0", step:"1",
        required:true, hint:"Ersetzt den Wert für diesen Tag, addiert nicht dazu." }
    ],
    validate: w=> Number(w.calls) >= 0 ? null : "Bitte eine Zahl ab 0 eintragen.",
    onSubmit: async w=>{
      await callsSpeichern(w.date, w.person, w.calls, null);
    }
  });
  if(ergebnis){ await neuLaden(); flashSaved("clMsg"); }
}

async function wertDialog(){
  const ergebnis = await openModal({
    title: "Wert je Call",
    submitLabel: "Übernehmen",
    fields: [
      { name:"wert", label:"Euro je Call", type:"number", min:"0", step:"0.01",
        value: String(wertJeCall()), required:true, width:"full",
        hint:"Startwert 3,35 € — aus 5.200 € Umsatz bei 1.550 Cold Calls." }
    ],
    validate: w=> Number(w.wert) > 0 ? null : "Bitte einen Betrag über 0 € eintragen.",
    onSubmit: async w=>{ await einstellungSpeichern("call_value_eur", w.wert); }
  });
  if(ergebnis){ await neuLaden(); flashSaved("clMsg"); }
}

/* ---------- Rendern ---------- */

function renderCockpit(){
  const heute = todayIso();
  const gemacht = callsAmTag(heute);
  const soll    = vorgabeAmTag(heute);
  const wert    = wertJeCall();

  document.getElementById("clHeute").textContent = gemacht;
  document.getElementById("clZiel").textContent = soll == null ? " / —" : " / " + soll;

  const pct = soll ? Math.min(100, (gemacht / soll) * 100) : 0;
  document.getElementById("clBar").style.width = pct + "%";

  const offen = soll == null ? null : Math.max(0, soll - gemacht);
  const art = callsNachArt(heute);
  const artText = art ? art.warm + " warm · " + art.kalt + " kalt" : "";
  document.getElementById("clHeuteSub").textContent = [
    soll == null
      ? "Für heute steht noch keine Vorgabe aus Close bereit."
      : offen === 0
        ? "Tagesvorgabe erreicht."
        : offen + (offen === 1 ? " Call offen" : " Calls offen"),
    artText,
    rueckstandAmTag(heute) ? rueckstandAmTag(heute) + " überfällig in Close" : ""
  ].filter(Boolean).join(" · ");

  const kosten = (offen || 0) * wert;
  const kEl = document.getElementById("clKosten");
  kEl.textContent = offen == null ? "—" : (kosten > 0 ? "−" + euroCent(kosten) : euro(0));
  document.getElementById("clKostenKarte").classList.toggle("is-warnung", kosten > 0);
  document.getElementById("clKostenSub").textContent =
    offen == null ? "keine Vorgabe" :
    kosten > 0 ? "entgehen dir heute" : "nichts liegen gelassen";

  document.getElementById("clWert").textContent = wert ? euroCent(wert) : "—";
  document.getElementById("clBasis").textContent = wert ? euroCent(wert) : "—";
}

function renderKennzahlen(){
  const wert = wertJeCall();
  const erfasst = state.calls.reduce((s,c)=>s + (Number(c.calls) || 0), 0);
  const historie = Number(state.settings.call_history_calls) || 0;

  document.getElementById("clGesamt").textContent = num(erfasst, 0);
  document.getElementById("clGesamtSub").textContent =
    historie ? "plus " + num(historie,0) + " vor der Erfassung" : "seit Beginn der Erfassung";

  document.getElementById("clWertGesamt").textContent = wert ? euro(erfasst * wert) : "—";

  const verpasst = callTage().reduce((s,t)=>s + verpasstAmTag(t), 0);
  document.getElementById("clVerpasst").textContent = verpasst ? num(verpasst,0) : "0";
  document.getElementById("clVerpasstSub").textContent =
    verpasst && wert ? "entspricht " + euro(verpasst * wert) : "Rückstand auf die Vorgaben";

  const heute = todayIso();
  const offenInClose = rueckstandAmTag(heute) ||
        rueckstandAmTag(callTage().filter(t=>t <= heute).pop() || heute);
  document.getElementById("clRueckstand").textContent = offenInClose ? num(offenInClose,0) : "—";
}

function renderVerlauf(){
  const el = document.getElementById("clChart");
  if(!state.calls.length){
    el.innerHTML = emptyState(
      "Noch keine Calls erfasst",
      "Ab 18 Uhr fragt der Zeittracker einmal täglich, wie viele Calls du gemacht hast. " +
      "Frühere Tage trägst du über „Calls nachtragen“ ein."
    );
    return;
  }

  const tage = letzteTage(TAGE_IM_VERLAUF);
  const labels = tage.map(t=>fmtDate(t).replace(/\.$/, ""));
  const gemacht = tage.map(t=>callsAmTag(t));
  const soll    = tage.map(t=>vorgabeAmTag(t));

  // Warm und kalt getrennt, wo die Aufteilung vorliegt. Tage ohne Aufteilung
  // (vor der automatischen Zaehlung) laufen als eine Saeule weiter.
  const hatArt = tage.some(t=>callsNachArt(t));
  const reihen = hatArt
    ? [
        { name: "Warm",    werte: tage.map(t=>(callsNachArt(t) || {}).warm ?? 0) },
        { name: "Kalt",    werte: tage.map(t=>(callsNachArt(t) || {}).kalt ?? 0) },
        { name: "Vorgabe", werte: soll.map(v=>v == null ? 0 : v) }
      ]
    : [
        { name: "Calls gemacht", werte: gemacht },
        { name: "Vorgabe",       werte: soll.map(v=>v == null ? 0 : v) }
      ];

  el.innerHTML = balkenChart({
    reihen,
    labels, hoehe: 220,
    beschreibung: "Gemachte Calls je Tag gegen die Tagesvorgabe aus Close, letzte " +
                  TAGE_IM_VERLAUF + " Tage"
  });
  document.getElementById("clChartSub").textContent =
    "gemachte Calls gegen die Tagesvorgabe — letzte " + TAGE_IM_VERLAUF + " Tage";
}

/* Was der Rückstand in Geld bedeutet — pro Tag, aufsteigend nach Datum. */
function renderKostenTabelle(){
  const el = document.getElementById("clKostenTabelle");
  const wert = wertJeCall();
  const tage = callTage().filter(t=>vorgabeAmTag(t) != null);

  if(!tage.length || !wert){
    el.innerHTML = emptyState("", "Sobald Vorgaben aus Close vorliegen, steht hier, was der Rückstand kostet.", { inline:true });
    return;
  }

  const zeilen = tage.slice(-14).reverse().map(t=>{
    const soll = vorgabeAmTag(t), ist = callsAmTag(t);
    const fehlt = Math.max(0, soll - ist);
    return { t, soll, ist, fehlt, kosten: fehlt * wert };
  });
  const summe = zeilen.reduce((s,z)=>s + z.kosten, 0);

  el.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Tag</th><th>Vorgabe</th><th>Gemacht</th><th>Fehlt</th><th>Entgangen</th></tr></thead>
    <tbody>${zeilen.map(z=>`
      <tr>
        <td>${escapeHtml(fmtDate(z.t))}</td>
        <td>${z.soll}</td>
        <td>${z.ist}</td>
        <td>${z.fehlt ? z.fehlt : "–"}</td>
        <td>${z.fehlt
              ? `<span class="kosten">−${escapeHtml(euroCent(z.kosten))}</span>`
              : `<span class="t-muted">–</span>`}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>
  <p class="tabellen-hinweis">In diesen ${zeilen.length} Tagen sind <strong>${escapeHtml(euro(summe))}</strong> liegen geblieben — gerechnet mit ${escapeHtml(euroCent(wert))} je Call.</p>`;
}

function renderCalls(){
  renderCockpit();
  renderKennzahlen();
  renderVerlauf();
  renderKostenTabelle();
}

document.getElementById("clNachtragen").addEventListener("click", nachtragenDialog);
document.getElementById("clWertEdit").addEventListener("click", wertDialog);

onRender("calls", renderCalls);
