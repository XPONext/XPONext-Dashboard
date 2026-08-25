/* Ansicht: Dashboard — Gesamtfortschritt und laufende Woche. */

import { N_WEEKS, TOTAL, TOTAL_HEBEL, WEEKLY_TARGET, PERSONS, LEAD_GEN_PER_PERSON,
         PRIORITY_ORDER } from "../config.js";
import { num, euro, weekLabel, barClass, escapeHtml, tageBis } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { state, normStatus, personEntry, hebelHours, combinedEntry, cumulative } from "../state.js";
import { neuLaden } from "../data.js";
import { onRender } from "../ui/bus.js";
import { personBadge, fristBadge, emptyState } from "../ui/components.js";
import { openTaskDialog, herkunftText } from "../ui/kanban.js";

function renderDashboard(){
  const {c, weeksLogged, onTarget, bestWeek, bestUmsatz} = cumulative();

  document.getElementById("dashUmsatzIst").textContent = euro(c.umsatz);
  const umsatzPct = Math.min(100, (c.umsatz/TOTAL.umsatz)*100);
  document.getElementById("dashUmsatzBar").style.width = umsatzPct+"%";
  document.getElementById("dashUmsatzMeta").textContent = num(umsatzPct,1)+"% des Jahresziels erreicht · noch "+euro(Math.max(0,TOTAL.umsatz-c.umsatz))+" bis €20.000";

  const metrics = [
    ["Lead-Gen (Std.)","statCalls","barCalls","pctCalls",c.leadGenHours,TOTAL.leadGen,1],
    ["Termine gebucht","statTermineGebucht","barTermineGebucht","pctTermineGebucht",c.termineGebucht,TOTAL.termineGebucht,0],
    ["Termine (Show-up)","statTermineShowup","barTermineShowup","pctTermineShowup",c.termineShowup,TOTAL.termineShowup,0],
    ["Closes","statCloses","barCloses","pctCloses",c.closes,TOTAL.closes,0],
  ];
  metrics.forEach(([label, numId, barId, pctId, ist, soll, digits])=>{
    const pct = soll>0 ? (ist/soll)*100 : 0;
    document.getElementById(numId).innerHTML = num(ist,digits)+" <small>/ "+num(soll,digits)+"</small>";
    const bar = document.getElementById(barId);
    bar.style.width = Math.min(100,pct)+"%";
    bar.className = "bar-fill "+barClass(pct);
    document.getElementById(pctId).textContent = num(pct,1)+"% vom Gesamtziel";
  });

  const hebelPct = (c.hebel/TOTAL_HEBEL)*100;
  const hb = document.getElementById("barHebelTotal");
  hb.style.width = Math.min(100,hebelPct)+"%";
  hb.className = "bar-fill "+barClass(hebelPct);
  document.getElementById("pctHebelTotal").textContent = num(c.hebel,1)+" / "+TOTAL_HEBEL+" Std. ("+num(hebelPct,1)+"%)";

  document.getElementById("streakWeeksLogged").textContent = weeksLogged;
  document.getElementById("streakOnTarget").textContent = onTarget;

  const curIdx = findCurrentWeekIndex();
  document.getElementById("dashWeekLabel").textContent = weekLabel(curIdx);
  const e = combinedEntry(curIdx);
  const rows = [
    ["Lead-Gen (Std.)", e.leadGenHours, WEEKLY_TARGET.leadGen],
    ["Termine gebucht", e.termineGebucht, WEEKLY_TARGET.termineGebucht],
    ["Termine (Show-up)", e.termineShowup, WEEKLY_TARGET.termineShowup],
    ["Closes", e.closes, WEEKLY_TARGET.closes],
    ["Umsatz", e.umsatz, WEEKLY_TARGET.umsatz],
  ];
  document.getElementById("dashCurrentWeekBody").innerHTML = rows.map(([label,ist,soll])=>{
    const pct = soll>0 ? (ist/soll)*100 : 0;
    const displayIst = label==="Umsatz" ? euro(ist) : num(ist,label==="Lead-Gen (Std.)"?1:0);
    const displaySoll = label==="Umsatz" ? euro(soll) : num(soll,1);
    return `<div class="row-metric">
      <div class="top"><span class="name">${label}</span><span class="vals">${displayIst} / ${displaySoll}</span></div>
      <div class="bar-track"><div class="bar-fill ${barClass(pct)}" style="width:${Math.min(100,pct)}%"></div></div>
    </div>`;
  }).join("");

  document.getElementById("dashPersonSplit").innerHTML = PERSONS.map(([key,label])=>{
    const pe = personEntry(curIdx, key);
    const ph = hebelHours(pe);
    return `<div class="row-metric">
      <div class="top"><span class="name">${label}</span><span class="vals">${num(pe.leadGenHours,1)} Std. Lead-Gen (Ziel ${LEAD_GEN_PER_PERSON}) · ${num(ph,1)}/${WEEKLY_TARGET.hebel} Std. Hebel</span></div>
    </div>`;
  }).join("");

  renderLeaderboard();
  renderFaellig();
}

function bestWeekByMetric(getValue){
  let bestIdx = null, bestVal = -Infinity;
  for(let i=0;i<N_WEEKS;i++){
    const v = getValue(i);
    if(v>bestVal){ bestVal = v; bestIdx = i; }
  }
  return { idx: bestIdx, val: bestVal };
}

function renderLeaderboard(){
  const metrics = [
    ["Lead-Gen (Std.)", i=>combinedEntry(i).leadGenHours, v=>num(v,1)+" Std."],
    ["Termine gebucht", i=>combinedEntry(i).termineGebucht, v=>num(v,0)],
    ["Termine Show-up", i=>combinedEntry(i).termineShowup, v=>num(v,0)],
    ["Closes", i=>combinedEntry(i).closes, v=>num(v,0)],
    ["Umsatz", i=>combinedEntry(i).umsatz, v=>euro(v)],
    ["Hebel-Stunden", i=>combinedEntry(i).hebelHours, v=>num(v,1)+" Std."],
  ];
  document.getElementById("dashLeaderboard").innerHTML = metrics.map(([label,getVal,fmt])=>{
    const {idx,val} = bestWeekByMetric(getVal);
    const display = (idx===null || val<=0) ? "—" : (weekLabel(idx)+" · "+fmt(val));
    return `<div class="row-metric">
      <div class="top"><span class="name">${label}</span><span class="vals">${display}</span></div>
    </div>`;
  }).join("");
}
/* ---------- Fällig in den nächsten 2 Tagen ----------

   Seit die Aufgaben auf viele kleine Boards verteilt sind, sieht man beim
   Öffnen des Dashboards nicht mehr, was ansteht. Diese Karte ist der eine
   Ort, an dem alles zusammenläuft.

   Überfälliges gehört ausdrücklich dazu: Was gestern fällig war, ist
   dringender als was übermorgen fällig ist — es darf nicht durchrutschen,
   nur weil sein Datum hinter dem Fenster liegt. */

const VORLAUF_TAGE = 2;

function renderFaellig(){
  const liste = document.getElementById("dashDueList");
  const sub = document.getElementById("dashDueSub");

  const faellig = state.tasks
    .filter(t => normStatus(t) !== "done" && t.due_date && tageBis(t.due_date) <= VORLAUF_TAGE)
    .sort((a,b)=>{
      if(a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    });

  const spaet = faellig.filter(t => tageBis(t.due_date) < 0).length;
  sub.textContent = faellig.length
    ? faellig.length + (faellig.length === 1 ? " Aufgabe" : " Aufgaben")
      + (spaet ? " · " + spaet + " überfällig" : "")
    : "nichts offen";

  if(!faellig.length){
    // Die Karte bleibt auch leer stehen. Verschwände sie, wüsste man nicht,
    // ob nichts fällig ist oder ob sie nur nicht geladen hat.
    liste.innerHTML = emptyState(null, "Nichts fällig in den nächsten zwei Tagen.", {inline:true});
    return;
  }

  liste.innerHTML = `<div class="due-list">${faellig.map(t=>{
    const herkunft = herkunftText(t);
    return `<div class="task-row" data-task-id="${escapeHtml(t.id)}" role="button" tabindex="0">
      ${fristBadge(t.due_date)}
      <span class="task-row-text">${escapeHtml(t.text)}</span>
      ${herkunft ? `<span class="task-badge kunde">${escapeHtml(herkunft)}</span>` : ""}
      ${personBadge(t.assignee)}
    </div>`;
  }).join("")}</div>`;
}

document.getElementById("dashDueList").addEventListener("click", async (ev)=>{
  const zeile = ev.target.closest(".task-row");
  if(!zeile) return;
  const aufgabe = state.tasks.find(t => String(t.id) === String(zeile.dataset.taskId));
  if(!aufgabe) return;
  // Ohne Kunde oder Projekt muss man das von hier aus nachtragen können —
  // sonst schickt die Karte einen auf die Suche nach dem richtigen Board.
  const ergebnis = await openTaskDialog({
    aufgabe,
    kontext: { zeigeZuordnung: !aufgabe.project_id && !aufgabe.customer_id }
  });
  if(ergebnis) await neuLaden();
});

document.getElementById("dashDueList").addEventListener("keydown", (ev)=>{
  if(ev.key !== "Enter" && ev.key !== " ") return;
  const zeile = ev.target.closest(".task-row");
  if(!zeile) return;
  ev.preventDefault();
  zeile.click();
});

onRender("dashboard", renderDashboard);
