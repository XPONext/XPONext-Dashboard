/* Projekte — Kennzahlen und der Dialog zum Anlegen und Bearbeiten.

   Diese Datei zeichnet nichts mehr selbst: der Reiter gehoert seit dem
   Board-Umbau views/boards.js, das hier die Kennzahlenzeile und den Dialog
   holt. Die Frage, die die Kennzahlen beantworten, ist unveraendert: Woran
   arbeiten wir, wie weit sind wir, und was ist liegengeblieben?

   Die Schritte gibt es nicht mehr — sie sind in den Aufgaben aufgegangen.
   Gezaehlt werden deshalb ueberall Aufgaben. */

import { fmtDate, escapeHtml, num, tageBis, fristText } from "../utils/format.js";
import { state, normStatus, aufgabenVonProjekt } from "../state.js";
import { projektSpeichern, neuLaden } from "../data.js";
import { db } from "../supabase.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { pruefe, kundenOptionen, PERSON_OPTIONS, PERSON_LABEL } from "../ui/components.js";

export const PROJECT_STATUS_LABEL = { aktiv:"Aktiv", pausiert:"Pausiert", fertig:"Abgeschlossen" };
const STATUS_OPTIONS = [["aktiv","Aktiv"],["pausiert","Pausiert"],["fertig","Abgeschlossen"]];

export function istOffen(p){ return p.status !== "fertig"; }

/* Fortschritt eines Projekts: erledigte von allen Aufgaben. */
export function projektFortschritt(projectId){
  const aufgaben = aufgabenVonProjekt(projectId);
  const fertig = aufgaben.filter(t => normStatus(t) === "done").length;
  return { fertig, gesamt: aufgaben.length,
           pct: aufgaben.length ? (fertig/aufgaben.length)*100 : 0 };
}

export function balkenKlasse(pct){ return pct >= 80 ? "ok" : pct >= 40 ? "warn" : "low"; }

/* ---------- Dialog ---------- */

export async function openProjectModal(id, vorgaben = {}){
  const p = id != null ? state.projects.find(x=>String(x.id)===String(id)) : null;

  const felder = [
    { name:"title", label:"Projektname", type:"text", required:true, width:"full",
      placeholder:"z.B. Website-Relaunch" },
    { name:"description", label:"Beschreibung", type:"textarea", width:"full",
      placeholder:"Worum geht es? (optional)" },
    { name:"owner",  label:"Verantwortlich", type:"select", options:PERSON_OPTIONS, value:"beide" },
    { name:"status", label:"Status", type:"select", options:STATUS_OPTIONS, value:"aktiv" },
    { name:"due_date", label:"Deadline", type:"date" }
  ];
  // Der Kundenbezug ist optional und erscheint nur, wenn es Kunden gibt.
  if(state.customers.length){
    felder.push({ name:"customer_id", label:"Für welchen Kunden?", type:"select",
                  options:kundenOptionen({ leerLabel:"— kein Kunde —" }),
                  value: vorgaben.customer_id || "", width:"full",
                  hint:"Bestimmt, unter welchem Kunden das Projekt im Navigator steht." });
  }

  const ergebnis = await openModal({
    title: p ? "Projekt bearbeiten" : "Neues Projekt",
    submitLabel: p ? "Änderungen speichern" : "Projekt anlegen",
    fields: felder,
    initial: p,
    onSubmit: async werte=>{
      const nutzlast = {
        title: werte.title,
        description: werte.description || null,
        owner: werte.owner,
        status: werte.status,
        due_date: werte.due_date || null
      };
      if(state.customers.length) nutzlast.customer_id = werte.customer_id || null;
      await projektSpeichern(nutzlast, p ? p.id : null);
    },
    onDelete: p ? async ()=>{
      const a = aufgabenVonProjekt(p.id).length;
      const ok = await confirmDialog(`Projekt „${p.title}" löschen?`, {
        detail: a
          ? `${a} Aufgabe${a>1?"n":""} bleiben erhalten und verlieren nur die Zuordnung — sie liegen danach im Board „Allgemein" des Kunden.`
          : ""
      });
      if(!ok) return false;
      const { error } = await db.from("projects").delete().eq("id", p.id);
      pruefe(error, "Projekt konnte nicht gelöscht werden");
    } : null
  });
  if(ergebnis) await neuLaden();
  return ergebnis;
}

/* ---------- Kennzahlen ueber alle Projekte ---------- */

export function renderKopf(){
  const offene = state.projects.filter(istOffen);
  const alleAufgaben = state.tasks.filter(t =>
    t.project_id != null && offene.some(p => String(p.id) === String(t.project_id)));
  const erledigt = alleAufgaben.filter(t => normStatus(t) === "done").length;
  const pct = alleAufgaben.length ? (erledigt/alleAufgaben.length)*100 : 0;

  document.getElementById("projStatActive").textContent = offene.length;
  const pausiert = offene.filter(p=>p.status === "pausiert").length;
  document.getElementById("projStatActiveSub").textContent =
    pausiert ? pausiert + " davon pausiert" : (offene.length ? "alle aktiv" : "keins offen");

  document.getElementById("projStatProgress").textContent =
    alleAufgaben.length ? num(pct,0) + "%" : "—";
  const bar = document.getElementById("projStatProgressBar");
  bar.style.width = pct + "%";
  bar.className = "bar-fill " + balkenKlasse(pct);
  document.getElementById("projStatProgressSub").textContent =
    alleAufgaben.length ? erledigt + " von " + alleAufgaben.length + " Aufgaben" : "noch keine Aufgaben";

  // Ueberfaellig zaehlt Aufgaben UND Projekte, deren eigene Frist verstrichen
  // ist. Ein Projekt kann seine Deadline reissen, ohne dass eine einzelne
  // Aufgabe ueberfaellig waere.
  const spaeteAufgaben = alleAufgaben.filter(t=>
    normStatus(t) !== "done" && t.due_date && tageBis(t.due_date) < 0);
  const spaeteProjekte = offene.filter(p=>p.due_date && tageBis(p.due_date) < 0);
  const ueberfaellig = spaeteAufgaben.length + spaeteProjekte.length;
  const aeltestes = spaeteAufgaben.map(t=>t.due_date)
    .concat(spaeteProjekte.map(p=>p.due_date))
    .sort((a,b)=>a.localeCompare(b))[0];

  document.getElementById("projStatLate").textContent = ueberfaellig;
  document.getElementById("projStatLateSub").textContent = ueberfaellig
    ? "Aufgaben und Fristen · längster Rückstand " + fristText(tageBis(aeltestes))
    : "Aufgaben und Fristen im Plan";

  const fristen = offene.filter(p=>p.due_date).map(p=>({ datum:p.due_date, was:p.title }))
    .concat(alleAufgaben.filter(t=>normStatus(t) !== "done" && t.due_date)
                        .map(t=>({ datum:t.due_date, was:t.text })))
    .sort((a,b)=>a.datum.localeCompare(b.datum));
  const naechste = fristen[0];
  document.getElementById("projStatDeadline").textContent =
    naechste ? fmtDate(naechste.datum) + " " + naechste.was : "—";
  document.getElementById("projStatDeadlineSub").textContent =
    naechste ? (fristText(tageBis(naechste.datum)) || "später") : "keine Frist gesetzt";

  renderAuslastung(offene);
}

/* Wer hat wie viel offen? Beantwortet die Frage, ob sich etwas bei einer
   Person staut. */
function renderAuslastung(offene){
  const el = document.getElementById("projWorkload");
  const offeneAufgaben = state.tasks.filter(t=>
    normStatus(t) !== "done" && t.project_id != null &&
    offene.some(p => String(p.id) === String(t.project_id)));

  if(!offeneAufgaben.length){ el.innerHTML = ""; return; }

  const proPerson = {};
  offeneAufgaben.forEach(t=>{
    const wer = t.assignee || "offen";
    proPerson[wer] = proPerson[wer] || { gesamt:0, spaet:0 };
    proPerson[wer].gesamt++;
    if(t.due_date && tageBis(t.due_date) < 0) proPerson[wer].spaet++;
  });

  el.innerHTML = `<div class="workload-title">Offene Aufgaben</div>
    <div class="workload-list">${Object.entries(proPerson)
      .sort((a,b)=>b[1].gesamt-a[1].gesamt)
      .map(([wer, z])=>`
        <span class="workload-chip${z.spaet ? " is-late" : ""}">
          ${escapeHtml(wer === "offen" ? "ohne Zuweisung" : (PERSON_LABEL[wer] || wer))}
          <b>${z.gesamt}</b>${z.spaet ? `<span class="wl-late">${z.spaet} überfällig</span>` : ""}
        </span>`).join("")}</div>`;
}
