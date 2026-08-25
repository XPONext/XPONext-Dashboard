/* Ansicht: das alte Wochen-Board.

   Uebergangsloesung. Seit es Boards je Kunde und Projekt gibt, ist dieser
   Reiter nur noch dafuer da, die Altbestaende zuzuordnen: sein Dialog zeigt
   als einziger die Auswahl von Kunde und Projekt. Der Zaehler oben sagt, wie
   viel noch offen ist — steht dort 0, kann der ganze Reiter weg (Phase 5 im
   Plan).

   Aufgaben ohne Woche (alles, was in einem Projekt-Board entsteht) tauchen
   hier bewusst nie auf. */

import { WEEKS, N_WEEKS } from "../config.js";
import { weekLabel } from "../utils/format.js";
import { state, aufgabenOhneKunde } from "../state.js";
import { neuLaden } from "../data.js";
import { onRender } from "../ui/bus.js";
import { renderBoard, openTaskDialog } from "../ui/kanban.js";

function wocheJetzt(){ return WEEKS[state.boardWeekIdx][0]; }

function renderTasks(){
  document.getElementById("tasksWeekLabel").textContent = weekLabel(state.boardWeekIdx);
  document.getElementById("taskPrevWeek").disabled = state.boardWeekIdx <= 0;
  document.getElementById("taskNextWeek").disabled = state.boardWeekIdx >= N_WEEKS - 1;

  const offen = aufgabenOhneKunde().length;
  const hinweis = document.getElementById("tasksUnassigned");
  hinweis.textContent = offen
    ? offen + (offen === 1 ? " Aufgabe wartet" : " Aufgaben warten") + " noch auf einen Kunden oder ein Projekt. Karte anklicken, um sie zuzuordnen."
    : "Alles zugeordnet — dieser Reiter wird nicht mehr gebraucht.";
  hinweis.className = "board-note" + (offen ? " is-open" : " is-done");

  renderBoard(
    document.getElementById("kanbanBoard"),
    state.tasks.filter(t => t.week_start === wocheJetzt()),
    { zeigeHerkunft: true }
  );
}

document.getElementById("openAddTaskBtn").addEventListener("click", async ()=>{
  const ergebnis = await openTaskDialog({
    vorgaben: { week_start: wocheJetzt() },
    kontext:  { zeigeZuordnung: true }
  });
  if(ergebnis) await neuLaden();
});

document.getElementById("kanbanBoard").addEventListener("click", async (ev)=>{
  const karte = ev.target.closest(".kanban-card");
  if(!karte) return;
  const aufgabe = state.tasks.find(t => String(t.id) === String(karte.dataset.taskId));
  if(!aufgabe) return;

  const ergebnis = await openTaskDialog({
    aufgabe,
    kontext: {
      zeigeZuordnung: true,
      naechsteWoche: state.boardWeekIdx < N_WEEKS - 1 ? WEEKS[state.boardWeekIdx + 1][0] : null
    }
  });
  if(ergebnis) await neuLaden();
});

document.getElementById("taskPrevWeek").addEventListener("click", ()=>{
  if(state.boardWeekIdx > 0){ state.boardWeekIdx--; renderTasks(); }
});
document.getElementById("taskNextWeek").addEventListener("click", ()=>{
  if(state.boardWeekIdx < N_WEEKS - 1){ state.boardWeekIdx++; renderTasks(); }
});

onRender("aufgaben", renderTasks);
