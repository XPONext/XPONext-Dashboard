/* ============================================================
   Das Kanban-Board — Darstellung und Aufgabendialog.

   Wird von zwei Ansichten benutzt: dem alten Wochen-Board
   (views/aufgaben.js) und den Boards je Projekt und Kunde
   (views/boards.js). Beide zeichnen dieselben Karten und oeffnen denselben
   Dialog; Beschreibung, Frist und Zuordnung gibt es deshalb genau hier —
   sonst laufen die beiden Boards frueher oder spaeter auseinander.

   Dieses Modul kennt state, config, data.js und ui/* — aber keine der beiden
   Ansichten. Die Abhaengigkeit zeigt immer nur in diese Richtung.
   ============================================================ */

import { STATUS_COLUMNS, PRIORITY_ORDER, WEEKS } from "../config.js";
import { escapeHtml, weekLabel } from "../utils/format.js";
import { state, normStatus, kundeNach, projektNach, kundeIdVonAufgabe } from "../state.js";
import { openModal, confirmDialog } from "./modal.js";
import { aufgabeSpeichern, aufgabeLoeschen, aufgabeVerschieben } from "../data.js";
import { personBadge, fristBadge, kundenOptionen, emptyState,
         PERSON_OPTIONS, PRIO_OPTIONS, PRIO_LABEL } from "./components.js";

/* ---------- Sortierung ----------
   Prioritaet zuerst, dann die naechste Frist, dann das Anlegedatum.
   Fristlose Aufgaben ans Ende ihrer Prioritaetsgruppe: sie sind nicht
   dringend, sondern nur unbestimmt. */
function sortiere(aufgaben){
  return aufgaben.slice().sort((a,b)=>{
    const pa = PRIORITY_ORDER[a.priority] ?? 1, pb = PRIORITY_ORDER[b.priority] ?? 1;
    if(pa !== pb) return pa - pb;
    if(a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if(a.due_date && !b.due_date) return -1;
    if(b.due_date && !a.due_date) return 1;
    return String(a.created_at||"").localeCompare(String(b.created_at||""));
  });
}

/* Woher kommt die Aufgabe? "ProTours · Website-Relaunch" oder
   "ProTours · Allgemein". Ohne Kunde gar nichts. */
export function herkunftText(t){
  const kunde = kundeNach(kundeIdVonAufgabe(t));
  if(!kunde) return "";
  const projekt = t.project_id != null ? projektNach(t.project_id) : null;
  return kunde.name + " · " + (projekt ? projekt.title : "Allgemein");
}

function wochenBadge(t){
  if(!t.week_start) return "";
  const idx = WEEKS.findIndex(w => w[0] === t.week_start);
  return idx < 0 ? "" : `<span class="task-badge">${escapeHtml(weekLabel(idx))}</span>`;
}

/* Eine Karte. Die Beschreibung steht bewusst NICHT darauf — eine Spalte muss
   sich mit einem Blick lesen lassen. Stattdessen nur ein Zeichen, dass es
   etwas zu lesen gibt. */
function karte(t, opts){
  const erledigt = normStatus(t) === "done";
  const herkunft = opts.zeigeHerkunft ? herkunftText(t) : "";
  return `<div class="kanban-card ${erledigt?"is-done":""}" data-task-id="${escapeHtml(t.id)}">
    <div class="kanban-card-text">${escapeHtml(t.text)}${
      t.description ? ` <span class="card-note" title="Diese Aufgabe hat eine Beschreibung">✎</span>` : ""}</div>
    <div class="kanban-card-badges">
      ${fristBadge(t.due_date, { erledigt })}
      ${personBadge(t.assignee)}
      <span class="task-badge prio-${escapeHtml(t.priority||"mittel")}">${escapeHtml(PRIO_LABEL[t.priority]||t.priority||"Mittel")}</span>
      ${herkunft ? `<span class="task-badge kunde" title="${escapeHtml(herkunft)}">${escapeHtml(herkunft)}</span>` : ""}
      ${opts.zeigeWoche ? wochenBadge(t) : ""}
    </div>
  </div>`;
}

/* Zeichnet die fuenf Spalten aus STATUS_COLUMNS in `el`.

   Karten tragen data-task-id; Klicks delegiert der Aufrufer selbst. Dieses
   Modul haengt bewusst keine Listener an — sonst sammelten sich bei jedem
   Neuzeichnen weitere an. */
export function renderBoard(el, aufgaben, opts = {}){
  const leer = opts.leer || "–";
  el.innerHTML = STATUS_COLUMNS.map(([key,label])=>{
    const spalte = sortiere(aufgaben.filter(t => normStatus(t) === key));
    const karten = spalte.length
      ? spalte.map(t => karte(t, opts)).join("")
      : `<div class="kanban-empty">${escapeHtml(leer)}</div>`;
    return `<div class="kanban-col">
      <div class="kanban-col-head">
        <span class="kanban-col-title">${escapeHtml(label)}</span>
        <span class="kanban-count">${spalte.length}</span>
      </div>
      <div class="kanban-cards">${karten}</div>
    </div>`;
  }).join("");
}

/* ---------- Dialog ---------- */

/* Ein flacher Select "Kunde · Projekt" statt zweier gekoppelter Auswahlen:
   openModal baut die Felder einmalig, ein Select kann nicht auf ein anderes
   reagieren. Die flache Liste ist ehrlicher als eine Filterung, die nicht
   funktioniert. */
function projektOptionen(){
  const offen = state.projects.filter(p => p.status !== "fertig");
  const namen = offen.map(p=>{
    const kunde = p.customer_id ? kundeNach(p.customer_id) : null;
    return [p.id, (kunde ? kunde.name + " · " : "") + p.title];
  }).sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
  return [["", "— kein Projekt (Allgemein) —"]].concat(namen);
}

/* Oeffnet den Dialog fuer eine neue oder bestehende Aufgabe.

     aufgabe   Zeile aus state.tasks, oder null = neu
     vorgaben  Vorbelegung fuer eine neue Aufgabe und zugleich der Kontext,
               der beim Speichern mitgeht, wenn der Dialog ihn nicht zeigt
               (customer_id, project_id, week_start)
     kontext.zeigeZuordnung  Kunde/Projekt zur Auswahl stellen. Im Wochen-Board
               true — genau dafuer ist es noch da. Im Projekt-Board false, dort
               steht der Kontext fest.
     kontext.naechsteWoche   gesetzt -> Knopf "-> Naechste Woche"

   Rueckgabe: { aktion: "gespeichert"|"geloescht"|"verschoben" } oder null. */
export async function openTaskDialog({ aufgabe = null, vorgaben = {}, kontext = {} } = {}){
  const neu = !aufgabe;
  const zeigeZuordnung = !!kontext.zeigeZuordnung;

  const felder = [
    { name:"text", label:"Was ist zu tun?", type:"text", required:true, width:"full",
      placeholder:"z.B. Struktur der Startseite festlegen" }
  ];
  if(!neu){
    felder.push({ name:"status", label:"Status", type:"select", options:STATUS_COLUMNS });
  }
  felder.push(
    { name:"assignee", label:"Zugewiesen an", type:"select", options:PERSON_OPTIONS },
    { name:"priority", label:"Priorität",     type:"select", options:PRIO_OPTIONS },
    // Pflicht: eine Aufgabe ohne Frist taucht in der Dashboard-Karte nie auf
    // und versandet damit unbemerkt.
    { name:"due_date", label:"Bis wann?", type:"date", required:true,
      hint:"Spätester Termin. Überfällige Aufgaben stehen auf dem Dashboard ganz oben." }
  );
  if(zeigeZuordnung){
    felder.push(
      { name:"project_id", label:"Projekt", type:"select", options:projektOptionen(), width:"full" },
      { name:"customer_id", label:"Kunde", type:"select",
        options:kundenOptionen({ leerLabel:"— kein Kunde —" }), width:"full",
        hint:"Wird nur gebraucht, wenn kein Projekt gewählt ist — sonst zählt der Kunde des Projekts." }
    );
  }
  felder.push(
    { name:"description", label:"Beschreibung", type:"textarea", rows:6, width:"full",
      placeholder:"Worum geht es genau? Was ist zu beachten? (optional)" }
  );

  const anfang = neu
    ? { assignee:"tim", priority:"mittel",
        project_id: vorgaben.project_id ?? "", customer_id: vorgaben.customer_id ?? "" }
    : { text: aufgabe.text, status: normStatus(aufgabe), assignee: aufgabe.assignee,
        priority: aufgabe.priority, due_date: aufgabe.due_date || "",
        description: aufgabe.description || "",
        project_id: aufgabe.project_id ?? "", customer_id: aufgabe.customer_id ?? "" };

  const ergebnis = await openModal({
    title: neu ? "Neue Aufgabe" : "Aufgabe bearbeiten",
    submitLabel: neu ? "Aufgabe hinzufügen" : "Änderungen speichern",
    fields: felder,
    initial: anfang,
    extraActions: kontext.naechsteWoche
      ? [{ label:"→ Nächste Woche", value:"push" }] : [],
    onSubmit: async werte=>{
      // Was der Dialog nicht gezeigt hat, kommt aus dem Kontext des Boards.
      // Reihenfolge: der Dialog gewinnt, wo er gefragt hat.
      const nutzlast = { ...vorgaben, ...werte };
      if(neu && !nutzlast.status) nutzlast.status = vorgaben.status || "backlog";
      await aufgabeSpeichern(nutzlast, aufgabe ? aufgabe.id : null);
    },
    onDelete: neu ? null : async ()=>{
      if(!await confirmDialog(`Aufgabe „${aufgabe.text}" löschen?`)) return false;
      await aufgabeLoeschen(aufgabe.id);
    }
  });

  if(!ergebnis) return null;
  if(ergebnis.action === "deleted") return { aktion:"geloescht" };
  if(ergebnis.action === "push"){
    await aufgabeVerschieben(aufgabe.id, kontext.naechsteWoche);
    return { aktion:"verschoben" };
  }
  return { aktion:"gespeichert" };
}

/* Leerzustand eines ganzen Boards — gleicher Wortlaut ueberall. */
export function boardLeer(){
  return emptyState("Noch keine Aufgaben",
    "Zerleg das Vorhaben in einzelne Handgriffe. Jede Aufgabe bekommt eine Frist, dann siehst du auf dem Dashboard rechtzeitig, was ansteht.");
}
