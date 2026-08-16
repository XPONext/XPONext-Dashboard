/* Ansicht: Wochen-Eingabe — Tageswerte, Closes, Wochenfokus, Commitments. */

import { WEEKS, N_WEEKS, WEEKLY_TARGET, PERSON_STORAGE_KEY } from "../config.js";
import { num, euro, weekLabel, barClass, escapeHtml, todayIso } from "../utils/format.js";
import { weekIndexForDate, findCurrentWeekIndex } from "../utils/weeks.js";
import { db } from "../supabase.js";
import { state, combinedEntry, buildWeeklyAggregates } from "../state.js";
import { upsertDailyPersonal, upsertDailyTeam, fetchAllData } from "../data.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner, speichern } from "../ui/bus.js";
import { personBadge, pruefe, PERSON_OPTIONS } from "../ui/components.js";
import { loadDayIntoHebelForm } from "./hebel.js";

function clampDate(d){
  if(d < WEEKS[0][0]) return WEEKS[0][0];
  if(d > WEEKS[N_WEEKS-1][1]) return WEEKS[N_WEEKS-1][1];
  return d;
}

function populateEntryControls(){
  const minD = WEEKS[0][0], maxD = WEEKS[N_WEEKS-1][1];
  ["entryDate","entryDateHebel"].forEach(id=>{
    const el = document.getElementById(id);
    el.min = minD; el.max = maxD;
  });
  const initial = clampDate(todayIso());
  document.getElementById("entryDate").value = initial;
  document.getElementById("entryDateHebel").value = initial;

  const savedPerson = localStorage.getItem(PERSON_STORAGE_KEY) || "tim";
  document.getElementById("personSelect").value = savedPerson;
  document.getElementById("personSelectHebel").value = savedPerson;
}

let currentClosesDraft = [];

function renderClosesList(){
  const container = document.getElementById("closesList");
  if(currentClosesDraft.length===0){
    container.innerHTML = `<div class="pct">Noch keine Closes für diesen Tag.</div>`;
    return;
  }
  container.innerHTML = currentClosesDraft.map((val, idx)=>`
    <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;">
      <input type="number" min="0" step="10" class="close-amount" data-idx="${idx}" value="${val}" style="flex:1;" placeholder="Auftragswert €">
      <button type="button" class="btn-outline remove-close" data-idx="${idx}" style="padding:0.5rem 0.8rem;">✕</button>
    </div>
  `).join("");
}

document.getElementById("addCloseBtn").addEventListener("click", ()=>{
  currentClosesDraft.push(0);
  renderClosesList();
});
document.getElementById("closesList").addEventListener("click", (ev)=>{
  if(ev.target.classList.contains("remove-close")){
    currentClosesDraft.splice(Number(ev.target.dataset.idx), 1);
    renderClosesList();
  }
});
document.getElementById("closesList").addEventListener("input", (ev)=>{
  if(ev.target.classList.contains("close-amount")){
    currentClosesDraft[Number(ev.target.dataset.idx)] = Number(ev.target.value)||0;
  }
});

function loadDayIntoForm(){
  const date = document.getElementById("entryDate").value;
  const person = document.getElementById("personSelect").value;
  const dp = (state.dailyPersonal[date] && state.dailyPersonal[date][person]) || {leadGenHours:0};
  document.getElementById("inLeadGen").value = dp.leadGenHours || 0;

  const dt = state.dailyTeam[date] || {termineGebucht:0, termineShowup:0, closes:[]};
  document.getElementById("inTermineGebucht").value = dt.termineGebucht || 0;
  document.getElementById("inTermineShowup").value = dt.termineShowup || 0;
  currentClosesDraft = [...(dt.closes || [])];
  renderClosesList();

  const wi = weekIndexForDate(date);
  document.getElementById("entryWeekInfo").textContent = wi>=0 ? ("gehört zu "+weekLabel(wi)) : "";
  renderPreview(wi);
  // Fokus und Commitments hängen an der Woche des gewählten Tages und müssen mitziehen.
  renderGoal();
  renderCommitments();
}

function renderPreview(i){
  if(i<0) { document.getElementById("previewBody").innerHTML = ""; document.getElementById("previewWeekLabel").textContent = ""; return; }
  const e = combinedEntry(i);
  document.getElementById("previewWeekLabel").textContent = weekLabel(i);
  const rows = [
    ["Lead-Gen (Std.)", e.leadGenHours, WEEKLY_TARGET.leadGen, v=>num(v,1)],
    ["Termine gebucht", e.termineGebucht, WEEKLY_TARGET.termineGebucht, v=>num(v,0)],
    ["Termine (Show-up)", e.termineShowup, WEEKLY_TARGET.termineShowup, v=>num(v,0)],
    ["Closes", e.closes, WEEKLY_TARGET.closes, v=>num(v,0)],
    ["Umsatz", e.umsatz, WEEKLY_TARGET.umsatz, v=>euro(v)],
  ];
  document.getElementById("previewBody").innerHTML = rows.map(([label,ist,soll,f])=>{
    const pct = soll>0 ? (ist/soll)*100 : 0;
    return `<div class="row-metric">
      <div class="top"><span class="name">${label}</span><span class="vals">${f(ist)} / ${f(soll)} (${num(pct,0)}%)</span></div>
      <div class="bar-track"><div class="bar-fill ${barClass(pct)}" style="width:${Math.min(100,pct)}%"></div></div>
    </div>`;
  }).join("");
}
/* ---------- Wochenfokus & Commitments ----------
   Beides hängt an der Woche des im Eingabe-Tab gewählten Tages — wer dort einen
   anderen Tag wählt, sieht Fokus und Commitments der zugehörigen Woche. */
function entryWeekIdx(){
  const wi = weekIndexForDate(document.getElementById("entryDate").value);
  return wi >= 0 ? wi : findCurrentWeekIndex();
}

function renderGoal(){
  const wi = entryWeekIdx();
  const weekStart = WEEKS[wi][0];
  document.getElementById("goalWeekLabel").textContent = weekLabel(wi);
  const goal = state.goals.find(g=>g.week_start===weekStart);
  const disp = document.getElementById("goalDisplay");
  if(goal && goal.goal && goal.goal.trim()){
    disp.textContent = goal.goal;
    disp.classList.remove("empty");
  } else {
    disp.textContent = "Noch kein Fokus für diese Woche gesetzt";
    disp.classList.add("empty");
  }
}

function renderCommitments(){
  const wi = entryWeekIdx();
  const weekStart = WEEKS[wi][0];
  document.getElementById("commitmentsWeekLabel").textContent = "worauf ihr euch in "+weekLabel(wi)+" festlegt";

  const rows = state.commitments.filter(c=>c.week_start===weekStart);
  const list = document.getElementById("commitmentsList");
  if(!rows.length){
    list.innerHTML = `<div class="commit-empty">Noch keine Commitments für diese Woche.</div>`;
    return;
  }
  list.innerHTML = rows.map(c=>`
    <div class="commit-row ${c.done?"is-done":""}" data-id="${c.id}">
      <input type="checkbox" ${c.done?"checked":""} data-act="toggle" data-id="${c.id}">
      <span class="commit-text">${escapeHtml(c.text)}</span>
      ${personBadge(c.assignee)}
      <button type="button" class="commit-del" data-act="del" data-id="${c.id}" title="Commitment löschen">✕</button>
    </div>`).join("");
}
document.getElementById("entryDate").addEventListener("change", ()=>{
  document.getElementById("entryDateHebel").value = document.getElementById("entryDate").value;
  loadDayIntoForm();
});
document.getElementById("entryDateHebel").addEventListener("change", ()=>{
  document.getElementById("entryDate").value = document.getElementById("entryDateHebel").value;
  loadDayIntoHebelForm();
});
document.getElementById("personSelect").addEventListener("change", ()=>{
  localStorage.setItem(PERSON_STORAGE_KEY, document.getElementById("personSelect").value);
  document.getElementById("personSelectHebel").value = document.getElementById("personSelect").value;
  loadDayIntoForm();
});
document.getElementById("personSelectHebel").addEventListener("change", ()=>{
  localStorage.setItem(PERSON_STORAGE_KEY, document.getElementById("personSelectHebel").value);
  document.getElementById("personSelect").value = document.getElementById("personSelectHebel").value;
  loadDayIntoHebelForm();
});

document.getElementById("saveWeekBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDate").value;
  const person = document.getElementById("personSelect").value;
  const existingHebel = (state.dailyPersonal[date] && state.dailyPersonal[date][person] && state.dailyPersonal[date][person].hebel) || {};
  if(!state.dailyPersonal[date]) state.dailyPersonal[date] = {};
  state.dailyPersonal[date][person] = {
    leadGenHours: Number(document.getElementById("inLeadGen").value)||0,
    hebel: existingHebel
  };
  await speichern(async ()=>{
    await upsertDailyPersonal(date, person);
    buildWeeklyAggregates();
  }, "saveMsg", fetchAllData);
});

document.getElementById("saveTeamBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDate").value;
  state.dailyTeam[date] = {
    termineGebucht: Number(document.getElementById("inTermineGebucht").value)||0,
    termineShowup: Number(document.getElementById("inTermineShowup").value)||0,
    closes: currentClosesDraft.filter(v=>v>0)
  };
  await speichern(async ()=>{
    await upsertDailyTeam(date);
    buildWeeklyAggregates();
  }, "saveTeamMsg", fetchAllData);
});
/* ---------- Wochenfokus ---------- */
document.getElementById("editGoalBtn").addEventListener("click", async ()=>{
  const weekStart = WEEKS[entryWeekIdx()][0];
  const vorhanden = state.goals.find(g=>g.week_start===weekStart);
  await openModal({
    title: "Wochenfokus",
    submitLabel: "Fokus speichern",
    fields: [{
      name:"goal", label:"Worauf liegt der Fokus in "+weekLabel(entryWeekIdx())+"?",
      type:"text", width:"full", placeholder:"z.B. 20 Erstgespräche führen"
    }],
    initial: vorhanden ? { goal: vorhanden.goal } : null,
    onSubmit: async werte=>{
      const { data, error } = await db.from("weekly_goals")
        .upsert({ week_start: weekStart, goal: werte.goal }, { onConflict: "week_start" }).select();
      pruefe(error, "Wochenfokus konnte nicht gespeichert werden");
      const idx = state.goals.findIndex(g=>g.week_start===weekStart);
      if(idx>=0) state.goals[idx] = data[0]; else state.goals.push(data[0]);
      renderGoal();
    }
  });
});
/* ---------- Commitments ---------- */
document.getElementById("openAddCommitmentBtn").addEventListener("click", async ()=>{
  await openModal({
    title: "Neues Commitment",
    submitLabel: "Commitment hinzufügen",
    fields: [
      {name:"text",     label:"Worauf legst du dich diese Woche fest?", type:"text", required:true, width:"full", placeholder:"z.B. 12 Std. Lead-Gen"},
      {name:"assignee", label:"Zugewiesen an", type:"select", options:PERSON_OPTIONS, value:"tim"}
    ],
    onSubmit: async werte=>{
      const { data, error } = await db.from("weekly_commitments")
        .insert({ week_start: WEEKS[entryWeekIdx()][0], text: werte.text, assignee: werte.assignee, done: false }).select();
      pruefe(error, "Commitment konnte nicht gespeichert werden");
      state.commitments.push(data[0]);
      renderCommitments();
    }
  });
});

document.getElementById("commitmentsList").addEventListener("click", async (ev)=>{
  const el = ev.target.closest("[data-act]");
  if(!el) return;
  const c = state.commitments.find(x=>String(x.id)===String(el.dataset.id));
  if(!c) return;

  if(el.dataset.act === "toggle"){
    const done = el.checked;
    const { error } = await db.from("weekly_commitments").update({ done }).eq("id", c.id);
    if(error){ console.error(error); showErrorBanner("Konnte nicht gespeichert werden: "+error.message); el.checked = !done; return; }
    c.done = done;
    renderCommitments();
  } else if(el.dataset.act === "del"){
    if(!await confirmDialog(`Commitment „${c.text}" löschen?`)) return;
    const { error } = await db.from("weekly_commitments").delete().eq("id", c.id);
    if(error){ console.error(error); showErrorBanner("Konnte nicht gelöscht werden: "+error.message); return; }
    state.commitments = state.commitments.filter(x=>String(x.id)!==String(c.id));
    renderCommitments();
  }
});
onRender("eingabe", ()=>{
  renderGoal();
  renderCommitments();
  renderPreview(weekIndexForDate(document.getElementById("entryDate").value));
});

export { populateEntryControls, loadDayIntoForm, entryWeekIdx };
