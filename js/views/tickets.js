/* Ansicht: Reiter "Projekte" — Scrum-Board je Entwicklungsprojekt.

   Zwei Ebenen: erst die Projektauswahl (eine Karte je Board), ein Klick
   oeffnet das Board. Dort beantwortet die Seite eine Frage: Wo steht der
   Sprint? Deshalb oben Erledigt-Quote und Resttage, darunter fuenf Spalten.

   Getrennt vom Wochen-Board in aufgaben.js: Tickets haben User Story,
   Akzeptanzkriterien, Umsetzung und Branch und haengen an einem Sprint statt
   an einer Kalenderwoche. Claude liest und schreibt dieselben Zeilen ueber
   tools/tickets/ im Repo des Projekts — Feldnamen nur gemeinsam aendern. */

import { TICKET_BOARDS, TICKET_STATUS, PRIORITY_ORDER, SPRINT_TAGE } from "../config.js";
import { escapeHtml, fmtDate, localDateStr, todayIso } from "../utils/format.js";
import { state, aktuellerSprint, naechsterTicketKey, ticketBranch } from "../state.js";
import { ticketSpeichern, ticketLoeschen, sprintSpeichern } from "../data.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, showErrorBanner } from "../ui/bus.js";
import { personBadge, emptyState, PERSON_OPTIONS, PRIO_OPTIONS, PRIO_LABEL } from "../ui/components.js";

/* ---------- Kleine Helfer ---------- */

/* Gewaehltes Board. state.ticketBoard null heisst: Projektauswahl zeigen. */
function board(){
  return TICKET_BOARDS.find(b=>b.key === state.ticketBoard) || TICKET_BOARDS[0];
}

function plusTage(iso, n){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

/* Tage zwischen zwei Daten, in lokalen Tagen. Ueber Mittag gerechnet, damit
   eine Zeitumstellung im Zeitraum nicht einen Tag verschluckt. */
function tageZwischen(vonIso, bisIso){
  const a = new Date(vonIso + "T12:00:00"), b = new Date(bisIso + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

function sprintLabel(s){
  return `Sprint ${s.nummer} (${fmtDate(s.start_date)}–${fmtDate(s.end_date)})`;
}

function ticketsDesBoards(){
  return state.tickets.filter(t=>t.board === board().key);
}

function sprintsDesBoards(){
  return state.sprints.filter(s=>s.board === board().key);
}

/* "sprint" nur, wenn es einen Sprint gibt — sonst waere das Board leer und
   man saehe die Tickets erst nach einem Klick auf "Alle". */
function ansicht(sprint){
  if(state.ticketAnsicht) return sprint ? state.ticketAnsicht : "alle";
  return sprint ? "sprint" : "alle";
}

function punkte(liste){
  return liste.reduce((s,t)=>s + (Number(t.aufwand) || 0), 0);
}

/* ---------- Zeichnen ---------- */

function renderKopf(sprint, sprintTickets){
  const titel = document.getElementById("tkSprintTitel");
  const b = board();
  titel.innerHTML = sprint
    ? `${escapeHtml(b.label)} <small id="tkSprintSub">Sprint ${escapeHtml(sprint.nummer)} · ${escapeHtml(sprint.ziel || "Kein Sprintziel eingetragen")}</small>`
    : `${escapeHtml(b.label)} <small id="tkSprintSub">Kein Sprint geplant — „Sprint planen" legt den ersten an.</small>`;

  const fertig = sprintTickets.filter(t=>t.status === "fertig");
  const pct = sprintTickets.length ? (fertig.length / sprintTickets.length) * 100 : 0;
  document.getElementById("tkStatFertig").innerHTML = sprint
    ? `${fertig.length} <small>/ ${sprintTickets.length}</small>` : "—";
  // Immer Akzentfarbe, keine Ampel: 50 % in der Sprintmitte ist kein Warnsignal.
  const balken = document.getElementById("tkStatFertigBar");
  balken.className = "bar-fill ok";
  balken.style.width = pct + "%";
  document.getElementById("tkStatFertigSub").textContent = sprint
    ? `${Math.round(pct)} % der Tickets im Sprint` : "Tickets";

  const geplant = punkte(sprintTickets);
  const ohne = sprintTickets.filter(t=>t.aufwand == null).length;
  document.getElementById("tkStatPunkte").innerHTML = sprint
    ? `${punkte(fertig)} <small>/ ${geplant}</small>` : "—";
  // Ohne Schaetzung ist die Summe zu niedrig — das muss dastehen, sonst
  // liest man eine Sicherheit hinein, die es nicht gibt.
  const punkteSub = document.getElementById("tkStatPunkteSub");
  punkteSub.textContent = ohne ? `${ohne} Ticket${ohne === 1 ? "" : "s"} noch ohne Schätzung` : "erledigt / geplant";
  punkteSub.classList.toggle("is-warn", ohne > 0);

  document.getElementById("tkStatReview").textContent =
    ticketsDesBoards().filter(t=>t.status === "review").length;

  const heute = todayIso();
  const tageEl = document.getElementById("tkStatTage");
  const tageSub = document.getElementById("tkStatTageSub");
  if(!sprint){
    tageEl.textContent = "—";
    tageSub.textContent = "kein Sprint geplant";
  } else if(sprint.start_date > heute){
    tageEl.textContent = "—";
    tageSub.textContent = `startet am ${fmtDate(sprint.start_date)}`;
  } else {
    const rest = tageZwischen(heute, sprint.end_date) + 1;  // heute zaehlt mit
    tageEl.textContent = rest;
    tageSub.textContent = `inkl. heute, bis ${fmtDate(sprint.end_date)}`;
  }
}

function karte(t, zeigeSprint){
  const badges = [
    `<span class="task-badge prio-${escapeHtml(t.prioritaet)}">${escapeHtml(PRIO_LABEL[t.prioritaet] || t.prioritaet)}</span>`,
    personBadge(t.assignee),
    t.aufwand != null ? `<span class="task-badge kunde">${escapeHtml(t.aufwand)} SP</span>` : "",
    (t.blockiert_durch || []).length ? `<span class="task-badge prio-hoch" title="${escapeHtml(t.blockiert_durch.join(", "))}">blockiert</span>` : "",
    zeigeSprint && t.sprint != null ? `<span class="task-badge kunde">Sprint ${escapeHtml(t.sprint)}</span>` : ""
  ].join("");
  return `
    <button type="button" class="kanban-card ticket-card${t.status === "fertig" ? " is-done" : ""}" data-ticket="${escapeHtml(t.id)}">
      <span class="ticket-key">${escapeHtml(t.key)}</span>
      <span class="kanban-card-text">${escapeHtml(t.titel)}</span>
      <span class="kanban-card-badges">${badges}</span>
    </button>`;
}

/* Projektauswahl: eine Karte je Board mit dem Stand seines Sprints. */
function renderUebersicht(){
  const liste = document.getElementById("tkProjektListe");
  // Die Projekte stehen in config.js und sind deshalb auch ohne Datenbank
  // bekannt — die Auswahl bleibt sichtbar, nur der Hinweis erklaert, was fehlt.
  if(!state.ticketTabelleDa){
    liste.innerHTML = TICKET_BOARDS.map(b=>`
      <div class="card tk-projekt is-gesperrt">
        <span class="tk-projekt-titel">${escapeHtml(b.label)}</span>
        <span class="tk-projekt-repo">${escapeHtml(b.repo || "")}</span>
        <span class="tk-projekt-zahlen">Board noch nicht eingerichtet</span>
      </div>`).join("") +
      emptyState("Noch ein Schritt in der Datenbank",
        "Einmal sql/014_tickets.sql im Supabase-SQL-Editor ausführen, dann die Seite neu laden.");
    return;
  }
  const heute = todayIso();
  liste.innerHTML = TICKET_BOARDS.map(b=>{
    const tickets = state.tickets.filter(t=>t.board === b.key);
    const sprint = aktuellerSprint(b.key, heute);
    const imSprint = sprint ? tickets.filter(t=>t.sprint === sprint.nummer) : [];
    const fertig = imSprint.filter(t=>t.status === "fertig").length;
    const pct = imSprint.length ? (fertig / imSprint.length) * 100 : 0;
    const offen = tickets.filter(t=>t.status !== "fertig").length;
    const review = tickets.filter(t=>t.status === "review").length;
    const sprintZeile = sprint
      ? `Sprint ${escapeHtml(sprint.nummer)}${sprint.ziel ? " · " + escapeHtml(sprint.ziel) : ""}`
      : "Kein Sprint geplant";
    return `
      <button type="button" class="card tk-projekt" data-projekt="${escapeHtml(b.key)}">
        <span class="tk-projekt-titel">${escapeHtml(b.label)}</span>
        <span class="tk-projekt-repo">${escapeHtml(b.repo || "")}</span>
        <span class="tk-projekt-sprint">${sprintZeile}</span>
        ${sprint ? `<span class="bar-track"><span class="bar-fill ok" style="width:${pct}%"></span></span>
        <span class="tk-projekt-zahlen">${fertig} von ${imSprint.length} im Sprint erledigt</span>` : ""}
        <span class="tk-projekt-zahlen">${offen} offen${review ? ` · ${review} in Review` : ""}</span>
      </button>`;
  }).join("");
}

function renderTickets(){
  const gewaehlt = !!state.ticketBoard;
  document.getElementById("tkUebersicht").hidden = gewaehlt;
  document.getElementById("tkBoardAnsicht").hidden = !gewaehlt;
  if(!gewaehlt){ renderUebersicht(); return; }
  renderBoard();
}

function renderBoard(){
  const heute = todayIso();
  const sprint = aktuellerSprint(board().key, heute);
  const modus = ansicht(sprint);

  document.querySelectorAll("[data-tk-ansicht]").forEach(btn=>{
    const aktiv = btn.dataset.tkAnsicht === modus;
    btn.classList.toggle("active", aktiv);
    btn.setAttribute("aria-selected", aktiv ? "true" : "false");
    btn.disabled = btn.dataset.tkAnsicht === "sprint" && !sprint;
  });

  const spalten = document.getElementById("tkBoardSpalten");
  const neuBtn = document.getElementById("tkNeuBtn");
  const sprintBtn = document.getElementById("tkSprintBtn");
  neuBtn.disabled = sprintBtn.disabled = !state.ticketTabelleDa;

  if(!state.ticketTabelleDa){
    renderKopf(null, []);
    spalten.classList.remove("kanban");
    spalten.innerHTML = emptyState("Tickets sind noch nicht eingerichtet",
      "Einmal sql/014_tickets.sql im Supabase-SQL-Editor ausführen, dann die Seite neu laden.");
    return;
  }
  spalten.classList.add("kanban");

  const alle = ticketsDesBoards();
  const sprintTickets = sprint ? alle.filter(t=>t.sprint === sprint.nummer) : [];
  renderKopf(sprint, sprintTickets);
  sprintBtn.textContent = sprint ? "Sprint bearbeiten" : "Sprint planen";

  const sichtbar = modus === "sprint" ? sprintTickets : alle;
  spalten.innerHTML = TICKET_STATUS.map(([key, label])=>{
    const inSpalte = sichtbar.filter(t=>t.status === key).sort((a,b)=>{
      const pa = PRIORITY_ORDER[a.prioritaet] ?? 1, pb = PRIORITY_ORDER[b.prioritaet] ?? 1;
      if(pa !== pb) return pa - pb;
      return String(a.key).localeCompare(String(b.key), "de", { numeric: true });
    });
    const karten = inSpalte.length
      ? inSpalte.map(t=>karte(t, modus === "alle")).join("")
      : `<div class="kanban-empty">–</div>`;
    return `
      <div class="kanban-col">
        <div class="kanban-col-head">
          <span class="kanban-col-title">${label}</span>
          <span class="kanban-count">${inSpalte.length}</span>
        </div>
        <div class="kanban-cards">${karten}</div>
      </div>`;
  }).join("");
}

/* ---------- Ticket anlegen und bearbeiten ---------- */

function ticketFelder(){
  const sprintOptionen = [["", "Kein Sprint"]].concat(
    sprintsDesBoards().map(s=>[String(s.nummer), sprintLabel(s)]));
  return [
    {name:"titel",      label:"Titel", type:"text", required:true, width:"full", placeholder:"z.B. Close-Sync (rein lesend)"},
    {name:"status",     label:"Status", type:"select", options:TICKET_STATUS},
    {name:"prioritaet", label:"Priorität", type:"select", options:PRIO_OPTIONS},
    {name:"assignee",   label:"Zugewiesen an", type:"select", options:[["","Noch offen"]].concat(PERSON_OPTIONS)},
    {name:"sprint",     label:"Sprint", type:"select", options:sprintOptionen},
    {name:"aufwand",    label:"Aufwand (Story Points)", type:"number", min:0, step:1},
    {name:"blockiert",  label:"Blockiert durch", type:"text", placeholder:"z.B. MA-001, offener Punkt 2"},
    {name:"user_story", label:"User Story", type:"textarea", rows:3, width:"full", placeholder:"Als … möchte ich …, damit …"},
    {name:"akzeptanz",  label:"Akzeptanzkriterien", type:"textarea", rows:5, width:"full", placeholder:"- [ ] prüfbar formuliert"},
    {name:"umsetzung",  label:"Umsetzung", type:"textarea", rows:6, width:"full", placeholder:"Schritte, betroffene Dateien, Tools, Tests"},
    {name:"notizen",    label:"Notizen", type:"textarea", rows:2, width:"full"},
    {name:"branch",     label:"Branch", type:"text", width:"full", hint:"Leer lassen — wird aus Nummer und Titel gebildet."}
  ];
}

function nutzlastAus(werte){
  return {
    titel: werte.titel,
    status: werte.status,
    prioritaet: werte.prioritaet,
    assignee: werte.assignee || null,
    sprint: werte.sprint ? Number(werte.sprint) : null,
    aufwand: werte.aufwand,
    blockiert_durch: (werte.blockiert || "").split(",").map(s=>s.trim()).filter(Boolean),
    user_story: werte.user_story || null,
    akzeptanz: werte.akzeptanz || null,
    umsetzung: werte.umsetzung || null,
    notizen: werte.notizen || null
  };
}

async function neuesTicket(){
  const b = board();
  const sprint = aktuellerSprint(b.key, todayIso());
  const vorgabe = {
    status: "backlog", prioritaet: "mittel", assignee: "",
    sprint: sprint && ansicht(sprint) === "sprint" ? String(sprint.nummer) : ""
  };
  await openModal({
    title: `Neues Ticket (${naechsterTicketKey(b.prefix)})`,
    submitLabel: "Ticket anlegen",
    fields: ticketFelder(),
    initial: vorgabe,
    onSubmit: async werte=>{
      // Erst beim Speichern vergeben: Dazwischen kann Claude oder die andere
      // Person ein Ticket angelegt haben. Die Datenbank faengt den Rest ab.
      const key = naechsterTicketKey(b.prefix);
      const zeile = await ticketSpeichern({
        ...nutzlastAus(werte),
        board: b.key,
        key,
        branch: werte.branch || ticketBranch(key, werte.titel)
      });
      state.tickets.push(zeile);
      renderTickets();
    }
  });
}

async function ticketOeffnen(id){
  const t = state.tickets.find(x=>String(x.id) === String(id));
  if(!t) return;
  await openModal({
    title: `${t.key} bearbeiten`,
    submitLabel: "Speichern",
    fields: ticketFelder(),
    initial: {
      ...t,
      assignee: t.assignee || "",
      sprint: t.sprint != null ? String(t.sprint) : "",
      blockiert: (t.blockiert_durch || []).join(", ")
    },
    onSubmit: async werte=>{
      const zeile = await ticketSpeichern({
        ...nutzlastAus(werte),
        branch: werte.branch || ticketBranch(t.key, werte.titel)
      }, t.id);
      Object.assign(t, zeile);
      renderTickets();
    },
    onDelete: async ()=>{
      if(!await confirmDialog(`Ticket ${t.key} „${t.titel}" löschen?`,
        { detail: "Die Nummer wird danach nicht neu vergeben." })) return false;
      await ticketLoeschen(t.id);
      state.tickets = state.tickets.filter(x=>String(x.id) !== String(t.id));
      renderTickets();
    }
  });
}

/* ---------- Sprint planen ----------
   Ein Dialog fuer das Sprint Planning: Ziel, Zeitraum und welche Tickets
   hineinkommen. Gibt es einen laufenden Sprint, wird er bearbeitet; sonst
   wird der naechste angelegt, direkt im Anschluss an den letzten. */

function planungsKandidaten(nummer){
  // Fertige Tickets anderer Sprints gehoeren nicht zur Auswahl — sie sind
  // abgeschlossen. Offene aus frueheren Sprints dagegen schon, mit Hinweis.
  return ticketsDesBoards().filter(t=>
    t.sprint === nummer || t.status !== "fertig"
  ).sort((a,b)=>String(a.key).localeCompare(String(b.key), "de", { numeric: true }));
}

async function sprintPlanen(){
  const b = board();
  const heute = todayIso();
  const laufend = aktuellerSprint(b.key, heute);
  const eigene = sprintsDesBoards();
  const letzter = eigene[eigene.length - 1];

  const nummer = laufend ? laufend.nummer : (letzter ? letzter.nummer + 1 : 1);
  const start = laufend ? laufend.start_date
    : (letzter && letzter.end_date >= heute ? plusTage(letzter.end_date, 1) : heute);
  const kandidaten = planungsKandidaten(nummer);

  const initial = {
    ziel: laufend ? laufend.ziel || "" : "",
    start_date: start,
    end_date: laufend ? laufend.end_date : plusTage(start, SPRINT_TAGE - 1)
  };
  kandidaten.forEach(t=>{ initial["t_" + t.id] = t.sprint === nummer; });

  await openModal({
    title: laufend ? `Sprint ${nummer} bearbeiten` : `Sprint ${nummer} planen`,
    submitLabel: laufend ? "Speichern" : "Sprint anlegen",
    fields: [
      {name:"ziel",       label:"Sprintziel", type:"text", required:true, width:"full", placeholder:"Was steht am Ende dieses Sprints?"},
      {name:"start_date", label:"Beginn", type:"date", required:true},
      {name:"end_date",   label:"Ende", type:"date", required:true, hint:`Standard: ${SPRINT_TAGE} Tage`}
    ].concat(kandidaten.map(t=>({
      name: "t_" + t.id,
      type: "checkbox",
      width: "full",
      label: `${t.key} · ${t.titel}` +
        (t.sprint != null && t.sprint !== nummer ? ` (offen aus Sprint ${t.sprint})` : "")
    }))),
    initial,
    validate: werte=> werte.end_date < werte.start_date ? "Das Ende liegt vor dem Beginn." : null,
    onSubmit: async werte=>{
      await sprintSpeichern({
        board: b.key, nummer, ziel: werte.ziel,
        start_date: werte.start_date, end_date: werte.end_date
      });
      // Nur geaenderte Tickets schreiben — jedes Update ist ein Aufruf.
      for(const t of kandidaten){
        const drin = !!werte["t_" + t.id];
        const war = t.sprint === nummer;
        if(drin === war) continue;
        const zeile = await ticketSpeichern({ sprint: drin ? nummer : null }, t.id);
        Object.assign(t, zeile);
      }
      const vorhanden = state.sprints.find(s=>s.board === b.key && s.nummer === nummer);
      const neu = { board: b.key, nummer, ziel: werte.ziel, start_date: werte.start_date, end_date: werte.end_date };
      if(vorhanden) Object.assign(vorhanden, neu); else state.sprints.push(neu);
      state.ticketAnsicht = null;
      renderTickets();
    }
  });
}

/* ---------- Ereignisse ---------- */

document.getElementById("tkNeuBtn").addEventListener("click", ()=>{
  neuesTicket().catch(e=>showErrorBanner(e.message || String(e)));
});
document.getElementById("tkSprintBtn").addEventListener("click", ()=>{
  sprintPlanen().catch(e=>showErrorBanner(e.message || String(e)));
});
document.getElementById("tkBoardSpalten").addEventListener("click", ev=>{
  const karte = ev.target.closest("[data-ticket]");
  if(karte) ticketOeffnen(karte.dataset.ticket);
});
document.getElementById("tkProjektListe").addEventListener("click", ev=>{
  const karte = ev.target.closest("[data-projekt]");
  if(!karte) return;
  state.ticketBoard = karte.dataset.projekt;
  state.ticketAnsicht = null;
  renderTickets();
});
document.getElementById("tkZurueck").addEventListener("click", ()=>{
  state.ticketBoard = null;
  renderTickets();
});
document.querySelectorAll("[data-tk-ansicht]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    state.ticketAnsicht = btn.dataset.tkAnsicht;
    renderTickets();
  });
});

onRender("tickets", renderTickets);
