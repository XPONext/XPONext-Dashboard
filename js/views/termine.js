/* Ansicht: Termine aus dem Close-Kalender — Korrektur und Bestaetigung.

   Die Zahlen selbst rechnet state.js (termineMitArt, erstgespraeche), die
   Kennzahlen zeigt der Vertrieb-Reiter (views/vertrieb.js). Hier steht nur,
   was man anklickt:

   1. Der Dialog "ohne Spur – bestaetigen" fuer Erstgespraeche, zu denen Close
      weder Aufnahme noch Telefonat hat (aufgerufen aus dem Vertrieb-Reiter).
   2. Im Nachtragen-Dialog die Termine der gewaehlten Woche, je Termin Art und
      Ergebnis umstellbar. Eine Korrektur schreibt der Abgleich nie zurueck.

   Keine Liste auf dem Hauptbildschirm: Arbeitslisten gehoeren nach Close.
   Die Termine stehen nur im Nachtragen-Dialog, zum Pruefen. */

import { escapeHtml, todayIso, localDateStr, weekLabel, fmtDate } from "../utils/format.js";
import { weekIndexForDate } from "../utils/weeks.js";
import { db } from "../supabase.js";
import { state, termineMitArt, buildWeeklyAggregates } from "../state.js";
import { fetchAllData } from "../data.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner, speichern } from "../ui/bus.js";
import { pruefe } from "../ui/components.js";

const ERGEBNIS_LABEL = {
  geplant: "geplant",
  stattgefunden: "hat stattgefunden",
  no_show: "No-Show",
  abgesagt: "abgesagt / verschoben",
  unklar: "ohne Spur – bitte wählen"
};
const ART_LABEL = { erst: "Erstgespräch", folge: "Folge- oder Kundentermin" };

const WOCHENTAG = ["So","Mo","Di","Mi","Do","Fr","Sa"];

function terminZeit(iso){
  const d = new Date(iso);
  return WOCHENTAG[d.getDay()] + " " +
    d.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit" }) + " · " +
    d.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
}

/* Erstgespraeche, zu denen Close keine Spur hat: einmal durchklicken. Ein
   Feld je Termin statt eines eigenen Fensters je Termin. */
export async function unklarDialog(){
  const offen = termineMitArt().filter(t=>t.art === "erst" && t.ergebnis === "unklar");
  if(!offen.length) return;
  await openModal({
    title: "Haben diese Erstgespräche stattgefunden?",
    submitLabel: "Übernehmen",
    fields: offen.map((t, i)=>({
      name: "t" + i,
      label: terminZeit(t.starts_at) + " · " + (t.title || "ohne Titel"),
      type: "select",
      options: [["", "– offen lassen –"], ["stattgefunden", "Hat stattgefunden"],
                ["no_show", "No-Show"], ["abgesagt", "Abgesagt oder verschoben"]],
      hint: i === 0 ? "Close führt diese Termine als erledigt, hat aber weder eine Zusammenfassung noch ein Telefonat dazu. Bis du etwas wählst, zählen sie als stattgefunden." : ""
    })),
    // Nach jedem gespeicherten Termin den Speicher nachziehen und neu zeichnen,
    // statt nach dem Dialog alles neu zu laden: Bricht das dritte Speichern ab,
    // stimmt die Anzeige trotzdem fuer die ersten beiden.
    onSubmit: async werte=>{
      const aenderungen = offen
        .map((t, i)=>({ id: t.id, wert: werte["t" + i] }))
        .filter(a=>a.wert);
      for(const a of aenderungen){
        const { error } = await db.from("sales_meetings").update({ outcome_override: a.wert }).eq("id", a.id);
        pruefe(error, "Termin speichern");
        const t = state.salesMeetings.find(x=>x.id === a.id);
        if(t) t.outcome_override = a.wert;
      }
      buildWeeklyAggregates();
      renderAll();
    }
  });
}

/* ---------- Korrektur im Nachtragen-Dialog ---------- */

function gewaehlteWoche(){
  const el = document.getElementById("entryDate");
  return weekIndexForDate((el && el.value) || todayIso());
}

function ergebnisOptionen(t){
  // "geplant" und "unklar" sind keine Korrekturen, sondern der Vorschlag des
  // Abgleichs — sie stehen nur zur Wahl, solange sie der Vorschlag sind.
  const werte = ["stattgefunden","no_show","abgesagt"];
  if(t.outcome === "geplant" || t.outcome === "unklar") werte.unshift(t.outcome);
  return werte.map(w=>
    `<option value="${w}"${w === t.ergebnis ? " selected" : ""}>${escapeHtml(ERGEBNIS_LABEL[w])}</option>`
  ).join("");
}

function zeile(t){
  const korrigiert = !!(t.kind_override || t.outcome_override);
  const grund = t.source === "hand"
    ? "von Hand nachgetragen"
    : (korrigiert ? "von Hand korrigiert · Close: " : "") + (t.outcome_reason || ERGEBNIS_LABEL[t.outcome] || "");
  return `<div class="termin-zeile${t.art === "erst" ? " is-erst" : ""}">
    <div class="termin-kopf">
      <span class="termin-zeit">${escapeHtml(terminZeit(t.starts_at))}</span>
      <span class="termin-titel">${escapeHtml(t.title || "ohne Titel")}</span>
    </div>
    <div class="termin-wahl">
      <select data-termin-art="${escapeHtml(t.id)}" aria-label="Art des Termins">
        ${["erst","folge"].map(a=>`<option value="${a}"${a === t.art ? " selected" : ""}>${ART_LABEL[a]}</option>`).join("")}
      </select>
      <select data-termin-ergebnis="${escapeHtml(t.id)}" aria-label="Ergebnis des Termins">${ergebnisOptionen(t)}</select>
      ${t.source === "hand" ? `<button type="button" class="dlg-del" data-termin-weg="${escapeHtml(t.id)}">Löschen</button>` : ""}
    </div>
    <div class="termin-grund">${escapeHtml(grund)} · gebucht ${escapeHtml(fmtDate(localDateStr(t.booked_at)))}</div>
  </div>`;
}

function renderListe(){
  const ziel = document.getElementById("termineListe");
  const label = document.getElementById("termineWoche");
  if(!ziel) return;
  if(!state.salesMeetingsOk){
    ziel.innerHTML = `<p class="dlg-hint">Die Termine kommen aus dem Close-Kalender, sobald sql/010 in Supabase ausgeführt ist und der Abgleich auf Railway läuft.</p>`;
    if(label) label.textContent = "";
    return;
  }
  const wi = gewaehlteWoche();
  if(label) label.textContent = wi >= 0 ? weekLabel(wi) : "";
  const woche = termineMitArt().filter(t=>weekIndexForDate(t.tag) === wi);
  ziel.innerHTML = woche.length
    ? woche.map(zeile).join("")
    : `<p class="dlg-hint">In dieser Woche steht kein Termin im Close-Kalender.</p>`;
}

/* Eine Korrektur speichert nur, was vom Vorschlag abweicht. Wer den Vorschlag
   zurueckwaehlt, nimmt die Korrektur zurueck — dann gilt wieder, was Close
   meint, auch wenn sich dort spaeter etwas aendert. */
async function korrigieren(id, spalte, wert, vorschlag){
  const t = state.salesMeetings.find(x=>x.id === id);
  if(!t) return;
  const neu = wert === vorschlag ? null : wert;
  await speichern(async ()=>{
    const { error } = await db.from("sales_meetings").update({ [spalte]: neu }).eq("id", id);
    pruefe(error, "Korrektur speichern");
    t[spalte] = neu;
    buildWeeklyAggregates();
  }, "termineMsg", fetchAllData);
}

document.getElementById("termineListe").addEventListener("change", ev=>{
  const art = ev.target.closest("[data-termin-art]");
  if(art){
    const t = termineMitArt().find(x=>x.id === art.dataset.terminArt);
    if(t) korrigieren(t.id, "kind_override", art.value, t.artAuto);
    return;
  }
  const erg = ev.target.closest("[data-termin-ergebnis]");
  if(erg){
    const t = state.salesMeetings.find(x=>x.id === erg.dataset.terminErgebnis);
    if(t) korrigieren(t.id, "outcome_override", erg.value, t.outcome);
  }
});

document.getElementById("termineListe").addEventListener("click", async ev=>{
  const btn = ev.target.closest("[data-termin-weg]");
  if(!btn) return;
  const ja = await confirmDialog("Diesen nachgetragenen Termin löschen?");
  if(!ja) return;
  await speichern(async ()=>{
    const { error } = await db.from("sales_meetings").delete().eq("id", btn.dataset.terminWeg);
    pruefe(error, "Termin löschen");
    state.salesMeetings = state.salesMeetings.filter(x=>x.id !== btn.dataset.terminWeg);
    buildWeeklyAggregates();
  }, "termineMsg", fetchAllData);
});

/* Termine ohne Kalendereinladung — etwa ein Telefontermin, den ein externer
   Terminsetzer ausgemacht hat — kennt Close nicht. Die Regel ist: Einladung
   schicken. Wo das nicht ging, hier nachtragen. */
async function ohneEinladungDialog(){
  await openModal({
    title: "Termin ohne Kalendereinladung",
    submitLabel: "Nachtragen",
    fields: [
      { name:"title", label:"Mit wem?", type:"text", required:true, width:"full",
        placeholder:"Büro, z. B. „Müller Architekten“",
        hint:"Nur für Termine, die nicht im Close-Kalender stehen. Alles mit Einladung kommt von selbst." },
      { name:"booked", label:"Gebucht am", type:"date", value: todayIso(), required:true },
      { name:"date", label:"Termin am", type:"date", value: document.getElementById("entryDate").value || todayIso(), required:true },
      { name:"time", label:"Uhrzeit", type:"time", value:"10:00" },
      { name:"art", label:"Art", type:"select", options:[["erst", ART_LABEL.erst], ["folge", ART_LABEL.folge]], value:"erst" },
      { name:"outcome", label:"Ergebnis", type:"select",
        options:[["geplant","steht noch an"],["stattgefunden","hat stattgefunden"],["no_show","No-Show"],["abgesagt","abgesagt / verschoben"]],
        value:"geplant" }
    ],
    validate: w=> w.booked > w.date ? "Gebucht nach dem Termin? Bitte die Daten prüfen." : null,
    onSubmit: async w=>{
      const start = new Date(w.date + "T" + (w.time || "10:00") + ":00");
      const zeile = {
        id: "hand_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)),
        lead_id: null,
        title: w.title,
        booked_at: new Date(w.booked + "T12:00:00").toISOString(),
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 45 * 60000).toISOString(),
        outcome: w.outcome,
        // Ausdruecklich, nicht nur bei "folge": Sonst ueberstimmte ein Titel wie
        // "Check-in" die Wahl "Erstgespraech".
        kind_override: w.art,
        source: "hand"
      };
      const { error } = await db.from("sales_meetings").insert(zeile);
      pruefe(error, "Termin nachtragen");
      state.salesMeetings.push({ ...zeile, outcome_override: null, client_since: null });
      buildWeeklyAggregates();
      renderAll();
    }
  });
}

document.getElementById("terminNeuBtn").addEventListener("click", ()=>{
  if(!state.salesTabelleDa){
    showErrorBanner("Termine lassen sich erst nachtragen, wenn sql/010 in Supabase ausgeführt ist.");
    return;
  }
  ohneEinladungDialog();
});

document.getElementById("entryDate").addEventListener("change", renderListe);

onRender("termine", renderListe);
