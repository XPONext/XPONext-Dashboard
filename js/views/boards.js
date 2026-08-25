/* Ansicht: Board-Navigator — Kunde → Projekte → Board.

   Drei Ebenen in einem Reiter. Frueher lag hier eine flache Liste aller
   Projekte mit Haekchenlisten darin; sobald mehr als eine Handvoll Kunden
   dazukamen, war nicht mehr zu sehen, was zu wem gehoert.

   Die Ebene lebt im state, nicht in der Adresszeile — es gibt kein
   URL-Routing in diesem Dashboard. Und die Klicks laufen bewusst NICHT ueber
   router.js: jeder Reiterklick zieht dort alle Tabellen neu, ein Breadcrumb
   wuerde das bei jedem Schritt tun. */

import { escapeHtml, fmtDate, tageBis, fristText } from "../utils/format.js";
import { state, normStatus, kundeNach, projektNach,
         aufgabenVonProjekt, aufgabenVonKunde, allgemeineAufgaben,
         aufgabenOhneKunde } from "../state.js";
import { neuLaden } from "../data.js";
import { onRender } from "../ui/bus.js";
import { personBadge, emptyState } from "../ui/components.js";
import { renderBoard, openTaskDialog, boardLeer } from "../ui/kanban.js";
import { openProjectModal, istOffen, projektFortschritt, balkenKlasse,
         renderKopf, PROJECT_STATUS_LABEL } from "./projekte.js";

/* "ohne" und "allgemein" sind Platzhalter, keine Datenbankwerte —
   data.js/idOderNull() faengt sie ab, bevor etwas gespeichert wird. */
const OHNE_KUNDE = "ohne";
const ALLGEMEIN  = "allgemein";

/* ---------- Bausteine ---------- */

function fortschrittsBalken(fertig, gesamt){
  const pct = gesamt ? (fertig/gesamt)*100 : 0;
  return `<div class="project-progress">
    <div class="bar-track"><div class="bar-fill ${balkenKlasse(pct)}" style="width:${pct}%"></div></div>
    <span class="ratio">${fertig}/${gesamt}</span>
  </div>`;
}

function offeneZahl(aufgaben){
  return aufgaben.filter(t => normStatus(t) !== "done").length;
}

function spaeteZahl(aufgaben){
  return aufgaben.filter(t =>
    normStatus(t) !== "done" && t.due_date && tageBis(t.due_date) < 0).length;
}

function kachel({ id, art, titel, untertitel, aufgaben, extraBadges = "" }){
  const fertig = aufgaben.filter(t => normStatus(t) === "done").length;
  const spaet = spaeteZahl(aufgaben);
  return `<div class="project-card board-tile" data-bact="${art}" data-id="${escapeHtml(id)}" role="button" tabindex="0">
    <div class="project-top"><div class="project-title">${escapeHtml(titel)}</div></div>
    ${untertitel ? `<div class="project-desc">${escapeHtml(untertitel)}</div>` : ""}
    <div class="project-badges">
      ${extraBadges}
      ${spaet ? `<span class="task-badge prio-hoch">${spaet} überfällig</span>` : ""}
    </div>
    ${fortschrittsBalken(fertig, aufgaben.length)}
  </div>`;
}

function breadcrumb(){
  const el = document.getElementById("boardCrumbs");
  if(state.boardEbene === "kunden"){ el.hidden = true; el.innerHTML = ""; return; }

  const teile = [`<button type="button" class="crumb" data-bact="zu-kunden">Kunden</button>`];
  const kunde = state.boardKundeId === OHNE_KUNDE
    ? { name: "Ohne Kunde" } : kundeNach(state.boardKundeId);
  const kundenName = kunde ? kunde.name : "Unbekannt";

  if(state.boardEbene === "board" && state.boardKundeId === OHNE_KUNDE){
    // Ohne Kunde gibt es keine Projektebene dazwischen — ein Knopf dorthin
    // wuerde nur auf dieselbe Ansicht zurueckfuehren.
    teile.push(`<span class="crumb is-current">${escapeHtml(kundenName)}</span>`);
  } else if(state.boardEbene === "board"){
    teile.push(`<button type="button" class="crumb" data-bact="zu-projekte">${escapeHtml(kundenName)}</button>`);
    const projekt = state.boardProjektId === ALLGEMEIN
      ? null : projektNach(state.boardProjektId);
    teile.push(`<span class="crumb is-current">${escapeHtml(projekt ? projekt.title : "Allgemein")}</span>`);
  } else {
    teile.push(`<span class="crumb is-current">${escapeHtml(kundenName)}</span>`);
  }

  el.hidden = false;
  el.innerHTML = teile.join(`<span class="crumb-sep">›</span>`);
}

/* ---------- Ebene 0: Kunden ---------- */

function renderKunden(){
  const nav = document.getElementById("boardNav");
  const gruppen = [
    ["Kunden", state.customers.filter(c => c.kind === "kunde"  && c.status !== "beendet")],
    ["Intern", state.customers.filter(c => c.kind === "intern" && c.status !== "beendet")]
  ];

  let html = gruppen.map(([titel, kunden])=>{
    if(!kunden.length) return "";
    const kacheln = kunden.map(c=>{
      const aufgaben = aufgabenVonKunde(c.id);
      const projekte = state.projects.filter(p => String(p.customer_id) === String(c.id));
      const laufend = projekte.filter(istOffen).length;
      return kachel({
        id: c.id, art: "kunde", titel: c.name,
        untertitel: laufend
          ? laufend + (laufend === 1 ? " laufendes Projekt" : " laufende Projekte")
          : "noch kein Projekt",
        aufgaben,
        extraBadges: `<span class="task-badge">${offeneZahl(aufgaben)} offen</span>`
      });
    }).join("");
    return `<div class="board-group"><div class="board-group-title">${titel}</div>
      <div class="kunde-grid">${kacheln}</div></div>`;
  }).join("");

  // Waehrend der Uebergangsphase haengen die Altaufgaben aus dem Wochen-Board
  // an keinem Kunden. Ohne diese Kachel waeren sie hier unerreichbar. Sie
  // verschwindet von selbst, sobald die letzte zugeordnet ist.
  const heimatlos = aufgabenOhneKunde();
  if(heimatlos.length){
    html += `<div class="board-group"><div class="board-group-title">Noch nicht zugeordnet</div>
      <div class="kunde-grid">${kachel({
        id: OHNE_KUNDE, art: "kunde", titel: "Ohne Kunde",
        untertitel: "Altbestand aus dem Wochen-Board — Aufgabe anklicken und einem Kunden zuordnen.",
        aufgaben: heimatlos,
        extraBadges: `<span class="task-badge">${offeneZahl(heimatlos)} offen</span>`
      })}</div></div>`;
  }

  if(!html){
    html = emptyState("Noch keine Kunden angelegt",
      "Leg im Reiter „Kunden“ einen Kunden an — auch interne wie „XPO intern“. Danach bekommt jeder hier seine eigene Projektliste und seine eigenen Boards.");
  }
  nav.innerHTML = html;
}

/* ---------- Ebene 1: Projekte eines Kunden ---------- */

function renderProjektliste(){
  const nav = document.getElementById("boardNav");
  const kundeId = state.boardKundeId;

  if(kundeId === OHNE_KUNDE){
    // Ohne Kunde gibt es keine Projekte — direkt ins Board.
    state.boardEbene = "board";
    state.boardProjektId = ALLGEMEIN;
    render();
    return;
  }

  const filter = document.getElementById("prFilter").value;
  let projekte = state.projects.filter(p => String(p.customer_id) === String(kundeId));
  if(filter === "offen") projekte = projekte.filter(istOffen);
  else if(filter.startsWith("meine-")){
    const wer = filter.slice(6);
    projekte = projekte.filter(p => istOffen(p) && (p.owner === wer || p.owner === "beide"));
  }

  projekte = projekte.slice().sort((a,b)=>{
    if(a.status === "fertig" && b.status !== "fertig") return 1;
    if(b.status === "fertig" && a.status !== "fertig") return -1;
    if(a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if(a.due_date) return -1;
    if(b.due_date) return 1;
    return String(a.title).localeCompare(String(b.title));
  });

  const allgemein = allgemeineAufgaben(kundeId);
  const allgemeinKachel = kachel({
    id: ALLGEMEIN, art: "projekt", titel: "Allgemein",
    untertitel: "Alles, wofür sich kein eigenes Projekt lohnt — Anrufe, Rechnungen, Kleinkram.",
    aufgaben: allgemein,
    extraBadges: `<span class="task-badge">${offeneZahl(allgemein)} offen</span>`
  });

  const projektKacheln = projekte.map(p=>{
    const aufgaben = aufgabenVonProjekt(p.id);
    const tage = tageBis(p.due_date);
    const frist = p.due_date
      ? `<span class="due-badge ${tage!==null&&tage<0&&p.status!=="fertig"?"is-late":""}">bis ${escapeHtml(fmtDate(p.due_date))}${
          p.status!=="fertig" && fristText(tage) ? " · " + escapeHtml(fristText(tage)) : ""}</span>`
      : "";
    return kachel({
      id: p.id, art: "projekt", titel: p.title,
      untertitel: p.description || "",
      aufgaben,
      extraBadges: `<span class="status-badge st-${escapeHtml(p.status)}">${escapeHtml(PROJECT_STATUS_LABEL[p.status]||p.status)}</span>`
        + personBadge(p.owner) + frist
    });
  }).join("");

  nav.innerHTML = `<div class="kunde-grid">${allgemeinKachel}${projektKacheln}</div>` +
    (projekte.length ? "" :
      emptyState(null, "Für diesen Kunden gibt es in dieser Auswahl kein Projekt. Stell die Auswahl oben um oder leg eins an.", {inline:true}));
}

/* ---------- Ebene 2: das Board ---------- */

function aktuelleAufgaben(){
  return state.boardProjektId === ALLGEMEIN
    ? (state.boardKundeId === OHNE_KUNDE ? aufgabenOhneKunde() : allgemeineAufgaben(state.boardKundeId))
    : aufgabenVonProjekt(state.boardProjektId);
}

function renderBoardEbene(){
  const aufgaben = aktuelleAufgaben();
  const projekt = state.boardProjektId === ALLGEMEIN ? null : projektNach(state.boardProjektId);
  const kunde = state.boardKundeId === OHNE_KUNDE ? null : kundeNach(state.boardKundeId);

  document.getElementById("boardTitle").firstChild.textContent =
    projekt ? projekt.title
            : (state.boardKundeId === OHNE_KUNDE ? "Ohne Kunde" : "Allgemein");
  const sub = document.getElementById("boardSub");
  const teile = [];
  if(kunde) teile.push(kunde.name);
  else if(state.boardKundeId === OHNE_KUNDE)
    teile.push("Altbestand — Karte anklicken und einem Kunden zuordnen");
  const { fertig, gesamt } = projektFortschritt(state.boardProjektId);
  if(projekt) teile.push(fertig + " von " + gesamt + " erledigt");
  sub.textContent = teile.join(" · ");

  const kopf = document.getElementById("boardMeta");
  if(projekt){
    const tage = tageBis(projekt.due_date);
    kopf.innerHTML = `
      ${projekt.description ? `<div class="project-desc">${escapeHtml(projekt.description)}</div>` : ""}
      <div class="project-badges">
        <span class="status-badge st-${escapeHtml(projekt.status)}">${escapeHtml(PROJECT_STATUS_LABEL[projekt.status]||projekt.status)}</span>
        ${personBadge(projekt.owner)}
        ${projekt.due_date ? `<span class="due-badge ${tage!==null&&tage<0&&projekt.status!=="fertig"?"is-late":""}">bis ${escapeHtml(fmtDate(projekt.due_date))}${
            projekt.status!=="fertig" && fristText(tage) ? " · " + escapeHtml(fristText(tage)) : ""}</span>` : ""}
        <button type="button" class="project-edit is-labeled" data-bact="proj-edit">✎ Projekt bearbeiten</button>
      </div>`;
  } else {
    kopf.innerHTML = "";
  }

  const el = document.getElementById("projKanban");
  if(!aufgaben.length){
    el.innerHTML = "";
    document.getElementById("boardEmpty").innerHTML = boardLeer();
    document.getElementById("boardEmpty").hidden = false;
  } else {
    document.getElementById("boardEmpty").hidden = true;
    renderBoard(el, aufgaben, { zeigeWoche: true, zeigeHerkunft: !projekt && !kunde });
  }
}

/* ---------- Umschalten ---------- */

function render(){
  renderKopf();

  const uebersicht = document.getElementById("projOverview");
  const nav  = document.getElementById("boardNav");
  const host = document.getElementById("boardHost");

  breadcrumb();
  uebersicht.hidden = state.boardEbene !== "kunden";
  document.getElementById("projFilterZeile").hidden = state.boardEbene !== "projekte";

  if(state.boardEbene === "board"){
    nav.hidden = true; host.hidden = false;
    renderBoardEbene();
    return;
  }
  nav.hidden = false; host.hidden = true;
  // Das verlassene Board leeren, nicht nur verstecken: sonst stehen seine
  // Karten weiter im Dokument und zaehlen bei jeder Auswertung mit.
  document.getElementById("projKanban").innerHTML = "";
  document.getElementById("boardMeta").innerHTML = "";
  document.getElementById("boardEmpty").hidden = true;
  if(state.boardEbene === "kunden") renderKunden();
  else renderProjektliste();
}

/* ---------- Ereignisse ---------- */

function zuKunden(){
  state.boardEbene = "kunden";
  state.boardKundeId = null;
  state.boardProjektId = null;
  render();
}

document.getElementById("boardCrumbs").addEventListener("click", (ev)=>{
  const el = ev.target.closest("[data-bact]");
  if(!el) return;
  if(el.dataset.bact === "zu-kunden") zuKunden();
  if(el.dataset.bact === "zu-projekte"){
    state.boardEbene = "projekte";
    state.boardProjektId = null;
    render();
  }
});

document.getElementById("boardNav").addEventListener("click", (ev)=>{
  const el = ev.target.closest("[data-bact]");
  if(!el) return;
  if(el.dataset.bact === "kunde"){
    state.boardKundeId = el.dataset.id;
    state.boardEbene = "projekte";
    render();
  } else if(el.dataset.bact === "projekt"){
    state.boardProjektId = el.dataset.id;
    state.boardEbene = "board";
    render();
  }
});

// Kacheln sind Knoepfe: mit der Tastatur muessen sie sich genauso bedienen
// lassen wie mit der Maus.
document.getElementById("boardNav").addEventListener("keydown", (ev)=>{
  if(ev.key !== "Enter" && ev.key !== " ") return;
  const el = ev.target.closest(".board-tile");
  if(!el) return;
  ev.preventDefault();
  el.click();
});

document.getElementById("prFilter").addEventListener("change", render);

document.getElementById("openAddProjectBtn").addEventListener("click", async ()=>{
  const kundeId = state.boardEbene !== "kunden" && state.boardKundeId !== OHNE_KUNDE
    ? state.boardKundeId : "";
  await openProjectModal(null, { customer_id: kundeId });
});

document.getElementById("boardHost").addEventListener("click", async (ev)=>{
  const knopf = ev.target.closest("[data-bact]");
  if(knopf && knopf.dataset.bact === "proj-edit"){
    const ergebnis = await openProjectModal(state.boardProjektId);
    // Wurde das Projekt geloescht, gibt es dieses Board nicht mehr.
    if(ergebnis && ergebnis.action === "deleted"){
      state.boardEbene = "projekte";
      state.boardProjektId = null;
      render();
    }
    return;
  }

  const karte = ev.target.closest(".kanban-card");
  if(!karte) return;
  const aufgabe = state.tasks.find(t => String(t.id) === String(karte.dataset.taskId));
  if(!aufgabe) return;
  // Im Board ohne Kunden muss die Zuordnung waehlbar sein — sonst kaeme man
  // aus diesem Eimer nie wieder heraus.
  const ergebnis = await openTaskDialog({
    aufgabe,
    kontext: { zeigeZuordnung: state.boardKundeId === OHNE_KUNDE }
  });
  if(ergebnis) await neuLaden();
});

document.getElementById("openAddBoardTaskBtn").addEventListener("click", async ()=>{
  const projektId = state.boardProjektId === ALLGEMEIN ? null : state.boardProjektId;
  const kundeId = state.boardKundeId === OHNE_KUNDE ? null : state.boardKundeId;
  const ergebnis = await openTaskDialog({
    vorgaben: { project_id: projektId, customer_id: kundeId },
    // Ohne Kunde und ohne Projekt waere die neue Aufgabe sofort wieder
    // heimatlos — dort also die Zuordnung anbieten.
    kontext: { zeigeZuordnung: !projektId && !kundeId }
  });
  if(ergebnis) await neuLaden();
});

/* Sicherheitsnetz: zeigt der Speicher die gemerkte Ebene nicht mehr her —
   Projekt geloescht, Kunde beendet —, faellt die Ansicht auf die
   Kundenuebersicht zurueck statt leer dazustehen. */
function ebeneGueltig(){
  if(state.boardEbene === "kunden") return true;
  if(state.boardKundeId === OHNE_KUNDE) return aufgabenOhneKunde().length > 0;
  if(!kundeNach(state.boardKundeId)) return false;
  if(state.boardEbene === "board" && state.boardProjektId !== ALLGEMEIN){
    return !!projektNach(state.boardProjektId);
  }
  return true;
}

onRender("projekte", ()=>{
  if(!ebeneGueltig()){
    state.boardEbene = "kunden";
    state.boardKundeId = null;
    state.boardProjektId = null;
  }
  render();
});
