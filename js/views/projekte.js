/* Ansicht: Projekte — Langzeitprojekte mit Schritten. */

import { fmtDate, escapeHtml, todayIso } from "../utils/format.js";
import { db } from "../supabase.js";
import { state } from "../state.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, showErrorBanner } from "../ui/bus.js";
import { personBadge, pruefe, PERSON_OPTIONS } from "../ui/components.js";

/* ---------- Projekte ----------
   Langzeitprojekte hängen bewusst an keiner Woche — sie laufen quer über den
   ganzen Zeitraum. Jedes Projekt hat beliebig viele Schritte zum Abhaken. */
const PROJECT_STATUS_LABEL = { aktiv:"Aktiv", pausiert:"Pausiert", fertig:"Abgeschlossen" };

function stepsOf(projectId){
  return state.projectSteps.filter(s=>String(s.project_id)===String(projectId));
}

function renderProjects(){
  const showDone = document.getElementById("showDoneProjects").checked;

  // Kennzahlen immer über alle Projekte rechnen, unabhängig vom Anzeigefilter.
  const activeProjects = state.projects.filter(p=>p.status==="aktiv");
  const openSteps = state.projectSteps.filter(s=>!s.done && state.projects.some(p=>String(p.id)===String(s.project_id) && p.status!=="fertig"));
  document.getElementById("projStatActive").textContent = activeProjects.length;
  document.getElementById("projStatOpen").textContent = openSteps.length;
  document.getElementById("projStatDone").textContent = state.projectSteps.filter(s=>s.done).length;

  const todayStr = todayIso();
  const upcoming = state.projects
    .filter(p=>p.status!=="fertig" && p.due_date)
    .sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
  document.getElementById("projStatDeadline").textContent = upcoming ? (fmtDate(upcoming.due_date)+" · "+upcoming.title) : "—";

  const visible = state.projects.filter(p=>showDone || p.status!=="fertig");
  // Offene zuerst, innerhalb dessen die mit der nächsten Deadline oben.
  visible.sort((a,b)=>{
    const rank = s => s==="aktiv" ? 0 : (s==="pausiert" ? 1 : 2);
    if(rank(a.status)!==rank(b.status)) return rank(a.status)-rank(b.status);
    if(a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if(a.due_date) return -1;
    if(b.due_date) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const list = document.getElementById("projectsList");
  if(!visible.length){
    list.innerHTML = `<div class="projects-empty">${state.projects.length ? "Keine offenen Projekte — setz den Haken oben, um die abgeschlossenen zu sehen." : "Noch keine Projekte angelegt."}</div>`;
    return;
  }

  list.innerHTML = visible.map(p=>{
    const steps = stepsOf(p.id);
    const doneCount = steps.filter(s=>s.done).length;
    const pct = steps.length ? (doneCount/steps.length)*100 : 0;
    const isLate = p.due_date && p.due_date < todayStr && p.status!=="fertig";

    const stepRows = steps.length ? steps.map(s=>`
      <div class="step-row ${s.done?"is-done":""}">
        <input type="checkbox" ${s.done?"checked":""} data-pact="step-toggle" data-id="${s.id}">
        <span class="step-text">${escapeHtml(s.text)}</span>
        ${personBadge(s.assignee)}
        <button type="button" class="step-del" data-pact="step-del" data-id="${s.id}" title="Schritt löschen">✕</button>
      </div>`).join("") : `<div class="step-empty">Noch keine Schritte — leg unten den ersten an.</div>`;

    return `<div class="project-card ${p.status==="fertig"?"is-done":""}">
      <div class="project-top">
        <div class="project-title">${escapeHtml(p.title)}</div>
        <button type="button" class="project-edit" data-pact="proj-edit" data-id="${p.id}" title="Projekt bearbeiten">Bearbeiten</button>
      </div>
      ${p.description ? `<div class="project-desc">${escapeHtml(p.description)}</div>` : ""}
      <div class="project-badges">
        <span class="status-badge st-${p.status}">${PROJECT_STATUS_LABEL[p.status]||p.status}</span>
        ${personBadge(p.owner)}
        ${p.due_date ? `<span class="due-badge ${isLate?"is-late":""}">${isLate?"überfällig seit ":"bis "}${fmtDate(p.due_date)}</span>` : ""}
      </div>
      <div class="project-progress">
        <div class="bar-track"><div class="bar-fill ${pct>=100?"ok":(pct>=50?"warn":"low")}" style="width:${pct}%"></div></div>
        <span class="ratio">${doneCount}/${steps.length}</span>
      </div>
      <div class="step-list">${stepRows}</div>
      <button type="button" class="btn-outline step-add" data-pact="step-add" data-id="${p.id}">+ Schritt</button>
    </div>`;
  }).join("");
}
async function openProjectModal(id){
  const p = id != null ? state.projects.find(x=>String(x.id)===String(id)) : null;

  await openModal({
    title: p ? "Projekt bearbeiten" : "Neues Projekt",
    submitLabel: p ? "Änderungen speichern" : "Projekt anlegen",
    fields: [
      {name:"title",       label:"Projektname",  type:"text",     required:true, width:"full", placeholder:"z.B. Website-Relaunch"},
      {name:"description", label:"Beschreibung", type:"textarea", width:"full", placeholder:"Worum geht es? (optional)"},
      {name:"owner",       label:"Verantwortlich", type:"select", options:PERSON_OPTIONS, value:"beide"},
      {name:"status",      label:"Status",       type:"select",   options:[["aktiv","Aktiv"],["pausiert","Pausiert"],["fertig","Fertig"]], value:"aktiv"},
      {name:"due_date",    label:"Deadline",     type:"date"}
    ],
    initial: p,
    onSubmit: async werte=>{
      const payload = {
        title: werte.title,
        description: werte.description || null,
        owner: werte.owner,
        status: werte.status,
        due_date: werte.due_date || null
      };
      if(p){
        const { data, error } = await db.from("projects").update(payload).eq("id", p.id).select();
        pruefe(error, "Projekt konnte nicht gespeichert werden");
        const idx = state.projects.findIndex(x=>String(x.id)===String(p.id));
        if(idx>=0) state.projects[idx] = data[0];
      } else {
        const { data, error } = await db.from("projects").insert(payload).select();
        pruefe(error, "Projekt konnte nicht angelegt werden");
        state.projects.push(data[0]);
      }
      renderProjects();
    },
    onDelete: p ? async ()=>{
      const n = stepsOf(p.id).length;
      const ok = await confirmDialog(
        `Projekt „${p.title}" löschen?`,
        { detail: n ? `Die ${n} zugehörigen Schritte werden mitgelöscht.` : "" }
      );
      if(!ok) return false;   // Dialog bleibt offen
      const { error } = await db.from("projects").delete().eq("id", p.id);
      pruefe(error, "Projekt konnte nicht gelöscht werden");
      state.projects = state.projects.filter(x=>String(x.id)!==String(p.id));
      state.projectSteps = state.projectSteps.filter(s=>String(s.project_id)!==String(p.id));
      renderProjects();
    } : null
  });
}

async function openStepModal(projectId){
  await openModal({
    title: "Neuer Schritt",
    submitLabel: "Schritt hinzufügen",
    fields: [
      {name:"text",     label:"Was ist zu tun?", type:"text", required:true, width:"full", placeholder:"z.B. Struktur der Startseite festlegen"},
      {name:"assignee", label:"Zugewiesen an",   type:"select", options:PERSON_OPTIONS, value:"tim"}
    ],
    onSubmit: async werte=>{
      const { data, error } = await db.from("project_steps")
        .insert({ project_id: projectId, text: werte.text, assignee: werte.assignee, done: false }).select();
      pruefe(error, "Schritt konnte nicht gespeichert werden");
      state.projectSteps.push(data[0]);
      renderProjects();
    }
  });
}

document.getElementById("openAddProjectBtn").addEventListener("click", ()=>openProjectModal(null));
document.getElementById("showDoneProjects").addEventListener("change", renderProjects);

document.getElementById("projectsList").addEventListener("click", async (ev)=>{
  const el = ev.target.closest("[data-pact]");
  if(!el) return;
  const act = el.dataset.pact, id = el.dataset.id;

  if(act === "proj-edit"){ openProjectModal(id); return; }
  if(act === "step-add"){ openStepModal(id); return; }

  const s = state.projectSteps.find(x=>String(x.id)===String(id));
  if(!s) return;

  if(act === "step-toggle"){
    const done = el.checked;
    const { error } = await db.from("project_steps").update({ done }).eq("id", s.id);
    if(error){ console.error(error); showErrorBanner("Konnte nicht gespeichert werden: "+error.message); el.checked = !done; return; }
    s.done = done;
    renderProjects();
  } else if(act === "step-del"){
    if(!await confirmDialog(`Schritt „${s.text}" löschen?`)) return;
    const { error } = await db.from("project_steps").delete().eq("id", s.id);
    if(error){ console.error(error); showErrorBanner("Konnte nicht gelöscht werden: "+error.message); return; }
    state.projectSteps = state.projectSteps.filter(x=>String(x.id)!==String(id));
    renderProjects();
  }
});
onRender(renderProjects);
