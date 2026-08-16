/* Ansicht: Zeittracking — Auswertung der Eintraege aus dem Popup. */

import { WEEKS, N_WEEKS } from "../config.js";
import { num, fmtDate, weekLabel, localDateStr } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { state } from "../state.js";
import { onRender } from "../ui/bus.js";

/* ---------- Zeittracking ---------- */

function filterTimeEntries({dateFrom, dateTo, person}){
  return state.timeEntries.filter(e=>{
    const d = localDateStr(e.ts);
    if(dateFrom && d<dateFrom) return false;
    if(dateTo && d>dateTo) return false;
    if(person && e.person!==person) return false;
    return true;
  });
}

function sumMinutes(entries, excludePause){
  return entries.filter(e=>!excludePause || e.state!=="Pause").reduce((s,e)=>s+(Number(e.duration_minutes)||0),0);
}

function renderTimeBreakdown(entries, field, containerId){
  const workEntries = entries.filter(e=>e.state!=="Pause" && e[field]);
  const totals = {};
  let grandTotal = 0;
  workEntries.forEach(e=>{
    totals[e[field]] = (totals[e[field]]||0) + (Number(e.duration_minutes)||0);
    grandTotal += Number(e.duration_minutes)||0;
  });
  const rows = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  document.getElementById(containerId).innerHTML = rows.length ? rows.map(([key,minutes])=>{
    const pct = grandTotal>0 ? (minutes/grandTotal)*100 : 0;
    return `<div class="row-metric">
      <div class="top"><span class="name">${key}</span><span class="vals">${num(minutes/60,1)} Std. (${num(pct,0)}%)</span></div>
      <div class="bar-track"><div class="bar-fill ok" style="width:${pct}%"></div></div>
    </div>`;
  }).join("") : `<div class="pct">Keine Daten in dieser Woche.</div>`;
}

function renderZeittracking(){
  const todayStr = localDateStr(new Date().toISOString());
  const curIdx = findCurrentWeekIndex();
  if(state.ztWeekIdx === null) state.ztWeekIdx = curIdx;
  const isCurrentWeek = state.ztWeekIdx === curIdx;
  const weekFrom = WEEKS[state.ztWeekIdx][0], weekTo = WEEKS[state.ztWeekIdx][1];

  // Die "Heute"-Karte ergibt nur Sinn, solange man auf der laufenden Woche steht.
  document.getElementById("ztTodayCard").style.display = isCurrentWeek ? "" : "none";
  document.getElementById("ztWeekHeading").textContent = isCurrentWeek ? "Diese Woche" : "Ausgewählte Woche";
  document.getElementById("ztWeekLabel").textContent = weekLabel(state.ztWeekIdx);
  document.getElementById("ztPrevWeek").disabled = state.ztWeekIdx <= 0;
  document.getElementById("ztNextWeek").disabled = state.ztWeekIdx >= N_WEEKS - 1;
  document.querySelectorAll(".zt-week-sub").forEach(el=>{
    el.textContent = isCurrentWeek ? "diese Woche" : weekLabel(state.ztWeekIdx);
  });

  const todayAll = filterTimeEntries({dateFrom: todayStr, dateTo: todayStr});
  document.getElementById("ztTodayHours").textContent = num(sumMinutes(todayAll, true)/60, 1);
  document.getElementById("ztTodayTim").textContent = num(sumMinutes(todayAll.filter(e=>e.person==="tim"), true)/60, 1);
  document.getElementById("ztTodaySimon").textContent = num(sumMinutes(todayAll.filter(e=>e.person==="simon"), true)/60, 1);
  document.getElementById("ztTodayPause").textContent = num(sumMinutes(todayAll.filter(e=>e.state==="Pause"), false)/60, 1);

  const weekAll = filterTimeEntries({dateFrom: weekFrom, dateTo: weekTo});
  document.getElementById("ztWeekHours").textContent = num(sumMinutes(weekAll, true)/60, 1);
  document.getElementById("ztWeekTim").textContent = num(sumMinutes(weekAll.filter(e=>e.person==="tim"), true)/60, 1);
  document.getElementById("ztWeekSimon").textContent = num(sumMinutes(weekAll.filter(e=>e.person==="simon"), true)/60, 1);

  const byDay = {};
  state.timeEntries.filter(e=>e.state!=="Pause").forEach(e=>{
    const d = localDateStr(e.ts);
    byDay[d] = (byDay[d]||0) + (Number(e.duration_minutes)||0);
  });
  let bestDay = null, bestDayMinutes = -1;
  Object.entries(byDay).forEach(([d,m])=>{ if(m>bestDayMinutes){ bestDayMinutes=m; bestDay=d; } });
  document.getElementById("ztHighscoreDay").textContent = bestDay ? (fmtDate(bestDay)+" · "+num(bestDayMinutes/60,1)+" Std.") : "—";

  renderTimeBreakdown(weekAll, "state", "ztByState");
  renderTimeBreakdown(weekAll, "zuordnung", "ztByZuordnung");
  renderTimeBreakdown(weekAll, "aktivitaet", "ztByAktivitaet");
}
/* ---------- Zeittracking: Wochen-Navigation ---------- */
document.getElementById("ztPrevWeek").addEventListener("click", ()=>{
  if(state.ztWeekIdx > 0){ state.ztWeekIdx--; renderZeittracking(); }
});
document.getElementById("ztNextWeek").addEventListener("click", ()=>{
  if(state.ztWeekIdx < N_WEEKS - 1){ state.ztWeekIdx++; renderZeittracking(); }
});
onRender(renderZeittracking);
