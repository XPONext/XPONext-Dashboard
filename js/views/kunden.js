/* Ansicht: Kunden — Umsatz, getrackte Zeit und der daraus folgende Stundenlohn.

   Zwei Dinge, die hier bewusst so sind:

   1. Gerechnet wird kalendarisch in Monaten, nicht über WEEKS. Retainer laufen
      monatlich, und weekIndexForDate() liefert außerhalb des Zeitraums -1 —
      Einträge würden still aus allen Summen fallen.

   2. Der Stundenlohn steht nie ohne Abdeckungsgrad da. Getrackt wird nur, was
      im Popup beantwortet wird; verpasste Fenster sind ungetrackte Zeit. Der
      Wert ist damit systematisch zu hoch. Ohne den Zusatz führt er zu falschen
      Entscheidungen darüber, welcher Kunde sich lohnt. */

import { euro, num, escapeHtml, fmtDate, todayIso } from "../utils/format.js";
import {
  state, kundeNach, monatsStart, letzterTagDesMonats,
  umsatzImZeitraum, stundenImZeitraum, stundenGesamt
} from "../state.js";
import {
  kundeSpeichern, kundeLoeschen,
  umsatzSpeichern, umsatzLoeschen,
  fetchAllData
} from "../data.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner } from "../ui/bus.js";
import { emptyState } from "../ui/components.js";

/* Ampel für den Stundenlohn. Absichtlich Status- und keine Serienfarben —
   hier wird bewertet, nicht kategorisiert. */
const AMPEL_ROT   = 50;
const AMPEL_GRUEN = 100;

function lohnKlasse(lohn){
  if(lohn == null) return "";
  if(lohn >= AMPEL_GRUEN) return "ok";
  if(lohn >= AMPEL_ROT) return "warn";
  return "low";
}

/* ---------- Zeitraum ---------- */

function gewaehlterZeitraum(){
  const wahl = document.getElementById("kdZeitraum").value;
  const bis = monatsStart(todayIso());

  if(wahl === "all"){
    // Frühester Monat, in dem irgendetwas passiert ist
    const monate = state.revenueMonths.map(r=>r.month_start)
      .concat(state.timeEntries.map(e=>monatsStart(e.ts.slice(0,10))));
    const von = monate.length ? monate.reduce((a,b)=> a < b ? a : b) : bis;
    return { von, bis, name: "gesamt" };
  }

  const monate = Number(wahl);
  let [j, m] = bis.split("-").map(Number);
  m -= (monate - 1);
  while(m < 1){ m += 12; j--; }
  const von = j + "-" + String(m).padStart(2,"0") + "-01";
  return { von, bis, name: monate === 1 ? "dieser Monat" : "letzte " + monate + " Monate" };
}

/* ---------- Dialoge ---------- */

const KUNDENART = [["kunde","Kunde (abrechenbar)"],["intern","Intern (nicht abrechenbar)"]];
const KUNDENSTATUS = [["aktiv","Aktiv"],["pausiert","Pausiert"],["beendet","Beendet"]];

async function kundeDialog(id){
  const k = id ? kundeNach(id) : null;

  await openModal({
    title: k ? "Kunde bearbeiten" : "Neuer Kunde",
    submitLabel: k ? "Änderungen speichern" : "Kunde anlegen",
    fields: [
      { name:"name", label:"Name", type:"text", required:true, width:"full",
        placeholder:"z.B. Protours",
        hint:"Genau so, wie es im Zeittracker-Popup zur Auswahl stehen soll." },
      { name:"kind",   label:"Art",    type:"select", options:KUNDENART,    value:"kunde" },
      { name:"status", label:"Status", type:"select", options:KUNDENSTATUS, value:"aktiv" },
      { name:"note", label:"Notiz", type:"textarea", width:"full",
        placeholder:"optional" }
    ],
    initial: k,
    onSubmit: async werte=>{
      await kundeSpeichern(werte, k ? k.id : null);
      await fetchAllData();
      renderAll();
    },
    onDelete: k ? async ()=>{
      const ok = await confirmDialog(
        `Kunde „${k.name}" löschen?`,
        { detail: "Die getrackten Zeiten bleiben erhalten, verlieren aber ihre Zuordnung. " +
                  "Wenn der Kunde nur nicht mehr aktiv ist, setz ihn stattdessen auf „Beendet“." }
      );
      if(!ok) return false;
      await kundeLoeschen(k.id);
      await fetchAllData();
      renderAll();
    } : null
  });
}

function kundenOptionen(){
  return state.customers
    .filter(c=>c.kind === "kunde" && c.status !== "beendet")
    .map(c=>[c.id, c.name]);
}

async function umsatzDialog(customerId, vorhandener){
  const optionen = kundenOptionen();
  if(!optionen.length){
    showErrorBanner("Erst einen Kunden anlegen — Umsatz braucht jemanden, dem er zugeordnet wird.");
    return;
  }

  const heute = todayIso();
  await openModal({
    title: vorhandener ? "Umsatz bearbeiten" : "Umsatz erfassen",
    submitLabel: vorhandener ? "Änderungen speichern" : "Umsatz eintragen",
    fields: [
      { name:"customer_id", label:"Kunde", type:"select", options:optionen,
        value: customerId || optionen[0][0], width:"full" },
      { name:"kind", label:"Art", type:"select",
        options:[["retainer","Retainer (monatlich)"],["einmalig","Einmaliger Auftrag"]],
        value:"retainer" },
      { name:"amount", label:"Betrag in €", type:"number", min:"0", step:"0.01",
        required:true,
        hint:"Bei Retainer der Betrag pro Monat, bei Einzelauftrag der Gesamtbetrag." },
      { name:"period_start", label:"Von", type:"date", value: heute.slice(0,8) + "01", required:true },
      { name:"period_end", label:"Bis", type:"date",
        hint:"Beim laufenden Retainer leer lassen." },
      { name:"title", label:"Bezeichnung", type:"text", width:"full",
        placeholder:"z.B. Betreuung Q3 (optional)" }
    ],
    initial: vorhandener,
    validate: werte=>{
      if(!(Number(werte.amount) > 0)) return "Bitte einen Betrag über 0 € eintragen.";
      if(werte.kind === "einmalig" && !werte.period_end){
        return "Ein einmaliger Auftrag braucht ein Enddatum — sonst lässt sich der Betrag keinem Zeitraum zuordnen.";
      }
      if(werte.period_end && werte.period_end < werte.period_start){
        return "Das Enddatum liegt vor dem Startdatum.";
      }
      return null;
    },
    onSubmit: async werte=>{
      await umsatzSpeichern(werte, vorhandener ? vorhandener.id : null);
      await fetchAllData();
      renderAll();
    },
    onDelete: vorhandener ? async ()=>{
      if(!await confirmDialog("Diesen Umsatzeintrag löschen?")) return false;
      await umsatzLoeschen(vorhandener.id);
      await fetchAllData();
      renderAll();
    } : null
  });
}

/* ---------- Rendern ---------- */

function renderKunden(){
  const { von, bis, name } = gewaehlterZeitraum();
  const bisAnzeige = letzterTagDesMonats(bis);

  // fmtDate liefert "01.06." mit Punkt am Ende — das Jahr wird deshalb ohne
  // weiteren Punkt angehaengt.
  document.getElementById("kdZeitraumLabel").textContent =
    fmtDate(von) + von.slice(0,4) + " – " + fmtDate(bisAnzeige) + bis.slice(0,4);
  document.getElementById("kdTableSub").textContent =
    "Umsatz und getrackte Zeit — " + name;

  const kunden = state.customers.filter(c=>c.kind === "kunde");
  const intern = state.customers.filter(c=>c.kind === "intern");

  const zeilen = kunden.map(c=>{
    const umsatz = umsatzImZeitraum(c.id, von, bis);
    const stunden = stundenImZeitraum(c.id, von, bis);
    const lohn = stunden > 0 ? umsatz / stunden : null;
    return { c, umsatz, stunden, lohn };
  });

  const umsatzGesamt = zeilen.reduce((s,z)=>s+z.umsatz, 0);
  const stundenKunden = zeilen.reduce((s,z)=>s+z.stunden, 0);
  const stundenIntern = intern.reduce((s,c)=>s+stundenImZeitraum(c.id, von, bis), 0);
  const stundenAlle = stundenGesamt(von, bis);
  const schnitt = stundenKunden > 0 ? umsatzGesamt / stundenKunden : null;

  document.getElementById("kdUmsatz").textContent = umsatzGesamt > 0 ? euro(umsatzGesamt) : "—";
  document.getElementById("kdStunden").textContent = stundenKunden > 0 ? num(stundenKunden,1) + " Std." : "—";

  const schnittEl = document.getElementById("kdSchnitt");
  schnittEl.textContent = schnitt == null ? "—" : euro(schnitt) + " / Std.";
  schnittEl.className = "num lohn-" + (lohnKlasse(schnitt) || "none");
  document.getElementById("kdSchnittSub").textContent =
    schnitt == null
      ? "Braucht Umsatz und getrackte Zeit im Zeitraum"
      : "Umsatz ÷ abrechenbare Stunden";

  document.getElementById("kdIntern").textContent = stundenIntern > 0 ? num(stundenIntern,1) + " Std." : "—";
  document.getElementById("kdInternSub").textContent =
    stundenAlle > 0
      ? num((stundenIntern / stundenAlle) * 100, 0) + "% der getrackten Zeit"
      : "nicht auf Kunden abrechenbar";

  // Abdeckungsgrad — ohne ihn ist der Stundenlohn irreführend
  const zugeordnet = stundenKunden + stundenIntern;
  const cov = document.getElementById("kdCoverage");
  if(stundenAlle > 0){
    const pct = (zugeordnet / stundenAlle) * 100;
    cov.textContent =
      "Grundlage: " + num(zugeordnet,1) + " von " + num(stundenAlle,1) + " getrackten Stunden sind einem Kunden zugeordnet (" +
      num(pct,0) + "%). Der Tracker erfasst nur, was im Popup beantwortet wird — die tatsächliche Arbeitszeit ist höher, der Stundenlohn also eher zu hoch als zu niedrig.";
    cov.style.display = "block";
  } else {
    cov.style.display = "none";
  }

  // Tabelle
  const list = document.getElementById("kdList");
  if(!state.customers.length){
    list.innerHTML = emptyState(
      "Noch keine Kunden angelegt",
      "Sobald Kunden angelegt sind, tauchen sie hier mit Umsatz, getrackter Zeit und Stundenlohn auf — und im Zeittracker-Popup zur Auswahl."
    );
    return;
  }
  if(!zeilen.length){
    list.innerHTML = emptyState(
      "Nur interne Zuordnungen vorhanden",
      "Leg einen Kunden mit der Art „Kunde (abrechenbar)“ an, um Umsatz und Stundenlohn zu sehen."
    );
    return;
  }

  const sortiert = zeilen.slice().sort((a,b)=>{
    if(a.lohn == null && b.lohn == null) return b.umsatz - a.umsatz;
    if(a.lohn == null) return 1;
    if(b.lohn == null) return -1;
    return b.lohn - a.lohn;
  });

  list.innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Kunde</th><th>Umsatz</th><th>Getrackt</th><th>Stundenlohn</th><th>Status</th><th></th>
    </tr></thead>
    <tbody>${sortiert.map(z=>`
      <tr>
        <td><span class="kd-name">${escapeHtml(z.c.name)}</span></td>
        <td>${z.umsatz > 0 ? escapeHtml(euro(z.umsatz)) : "–"}</td>
        <td>${z.stunden > 0 ? escapeHtml(num(z.stunden,1)) + " Std." : "–"}</td>
        <td>${z.lohn == null
              ? `<span class="t-muted">${z.umsatz > 0 ? "keine Zeit erfasst" : "–"}</span>`
              : `<span class="lohn-badge lohn-${lohnKlasse(z.lohn)}">${escapeHtml(euro(z.lohn))} / Std.</span>`}</td>
        <td>${z.c.status === "aktiv" ? "" : `<span class="status-badge st-${escapeHtml(z.c.status)}">${escapeHtml(z.c.status)}</span>`}</td>
        <td class="kd-actions">
          <button type="button" class="kd-btn" data-kd="umsatz" data-id="${escapeHtml(z.c.id)}">+ Umsatz</button>
          <button type="button" class="kd-btn" data-kd="edit" data-id="${escapeHtml(z.c.id)}">Bearbeiten</button>
        </td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

/* ---------- Ereignisse ---------- */

document.getElementById("kdZeitraum").addEventListener("change", renderKunden);
document.getElementById("kdAddCustomer").addEventListener("click", ()=>kundeDialog(null));
document.getElementById("kdAddRevenue").addEventListener("click", ()=>umsatzDialog(null, null));

document.getElementById("kdList").addEventListener("click", ev=>{
  const btn = ev.target.closest("[data-kd]");
  if(!btn) return;
  if(btn.dataset.kd === "edit") kundeDialog(btn.dataset.id);
  if(btn.dataset.kd === "umsatz") umsatzDialog(btn.dataset.id, null);
});

onRender("kunden", renderKunden);
