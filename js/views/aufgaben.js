/* Ansicht: Aufgaben-Board (Kanban) fuer die gewaehlte Woche. */

import { WEEKS, N_WEEKS, STATUS_COLUMNS, PRIORITY_ORDER } from "../config.js";
import { weekLabel, escapeHtml } from "../utils/format.js";
import { db } from "../supabase.js";
import { state, normStatus } from "../state.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, showErrorBanner } from "../ui/bus.js";
import { personBadge, pruefe, PERSON_OPTIONS, PRIO_OPTIONS, PRIO_LABEL } from "../ui/components.js";

/* ---------- Aufgaben-Board ---------- */


function renderTasks(){
  const weekStart = WEEKS[state.boardWeekIdx][0];
  document.getElementById("tasksWeekLabel").textContent = weekLabel(state.boardWeekIdx);
  document.getElementById("taskPrevWeek").disabled = state.boardWeekIdx <= 0;
  document.getElementById("taskNextWeek").disabled = state.boardWeekIdx >= N_WEEKS - 1;

  const weekTasks = state.tasks.filter(t=>t.week_start===weekStart);
  const board = document.getElementById("kanbanBoard");
  board.innerHTML = STATUS_COLUMNS.map(([key,label])=>{
    const colTasks = weekTasks.filter(t=>normStatus(t)===key).slice().sort((a,b)=>{
      const pa = PRIORITY_ORDER[a.priority] ?? 1, pb = PRIORITY_ORDER[b.priority] ?? 1;
      if(pa !== pb) return pa - pb;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    const cards = colTasks.length
      ? colTasks.map(t=>`
        <div class="kanban-card ${key==="done"?"is-done":""}" data-id="${t.id}">
          <div class="kanban-card-text">${escapeHtml(t.text)}</div>
          <div class="kanban-card-badges">
            ${personBadge(t.assignee)}
            <span class="task-badge prio-${escapeHtml(t.priority)}">${escapeHtml(PRIO_LABEL[t.priority]||t.priority)}</span>
          </div>
        </div>`).join("")
      : `<div class="kanban-empty">–</div>`;
    return `
      <div class="kanban-col">
        <div class="kanban-col-head">
          <span class="kanban-col-title">${label}</span>
          <span class="kanban-count">${colTasks.length}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>`;
  }).join("");
}
/* ---------- Neue Aufgabe ---------- */
document.getElementById("openAddTaskBtn").addEventListener("click", async ()=>{
  await openModal({
    title: "Neue Aufgabe",
    submitLabel: "Aufgabe hinzufügen",
    fields: [
      {name:"text",     label:"Was ist zu tun?", type:"text", required:true, width:"full", placeholder:"z.B. Angebot für Kunde X schreiben"},
      {name:"assignee", label:"Zugewiesen an",   type:"select", options:PERSON_OPTIONS, value:"tim"},
      {name:"priority", label:"Priorität",       type:"select", options:PRIO_OPTIONS, value:"mittel"}
    ],
    onSubmit: async werte=>{
      const { data, error } = await db.from("tasks").insert({
        week_start: WEEKS[state.boardWeekIdx][0],
        text: werte.text, assignee: werte.assignee, priority: werte.priority, done: false
      }).select();
      pruefe(error, "Aufgabe konnte nicht gespeichert werden");
      state.tasks.push(data[0]);
      renderTasks();
    }
  });
});

/* ---------- Board: Wochen-Navigation ---------- */
document.getElementById("taskPrevWeek").addEventListener("click", ()=>{
  if(state.boardWeekIdx > 0){ state.boardWeekIdx--; renderTasks(); }
});
document.getElementById("taskNextWeek").addEventListener("click", ()=>{
  if(state.boardWeekIdx < N_WEEKS - 1){ state.boardWeekIdx++; renderTasks(); }
});
/* ---------- Aufgabe bearbeiten ---------- */
document.getElementById("kanbanBoard").addEventListener("click", (ev)=>{
  const card = ev.target.closest(".kanban-card");
  if(card) openTaskModal(card.dataset.id);
});

async function openTaskModal(id){
  const t = state.tasks.find(x=>String(x.id)===String(id));
  if(!t) return;
  const gibtNaechsteWoche = state.boardWeekIdx < N_WEEKS - 1;

  const ergebnis = await openModal({
    title: "Aufgabe bearbeiten",
    submitLabel: "Speichern",
    fields: [
      {name:"text",     label:"Aufgabe",       type:"text", required:true, width:"full"},
      {name:"status",   label:"Status",        type:"select", options:STATUS_COLUMNS},
      {name:"assignee", label:"Zugewiesen an", type:"select", options:PERSON_OPTIONS},
      {name:"priority", label:"Priorität",     type:"select", options:PRIO_OPTIONS}
    ],
    initial: { text: t.text, status: normStatus(t), assignee: t.assignee, priority: t.priority },
    extraActions: [{ label: "→ Nächste Woche", value: "push", hidden: !gibtNaechsteWoche }],
    onSubmit: async werte=>{
      const done = werte.status === "done";
      const { error } = await db.from("tasks")
        .update({ text: werte.text, status: werte.status, assignee: werte.assignee, priority: werte.priority, done })
        .eq("id", t.id);
      pruefe(error, "Speichern fehlgeschlagen");
      Object.assign(t, { text: werte.text, status: werte.status, assignee: werte.assignee, priority: werte.priority, done });
      renderTasks();
    },
    onDelete: async ()=>{
      if(!await confirmDialog(`Aufgabe „${t.text}" löschen?`)) return false;
      const { error } = await db.from("tasks").delete().eq("id", t.id);
      pruefe(error, "Löschen fehlgeschlagen");
      state.tasks = state.tasks.filter(x=>String(x.id)!==String(t.id));
      renderTasks();
    }
  });

  if(ergebnis && ergebnis.action === "push"){
    const nextWeekStart = WEEKS[state.boardWeekIdx + 1][0];
    const { error } = await db.from("tasks").update({ week_start: nextWeekStart }).eq("id", t.id);
    if(error){ console.error(error); showErrorBanner("Verschieben fehlgeschlagen: "+error.message); return; }
    t.week_start = nextWeekStart;
    renderTasks();
  }
}
onRender("aufgaben", renderTasks);
