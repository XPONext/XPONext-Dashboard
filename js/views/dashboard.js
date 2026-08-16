/* Ansicht: Dashboard — Gesamtfortschritt und laufende Woche. */

import { N_WEEKS, TOTAL, TOTAL_HEBEL, WEEKLY_TARGET, PERSONS, LEAD_GEN_PER_PERSON } from "../config.js";
import { num, euro, weekLabel, barClass } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { personEntry, hebelHours, combinedEntry, cumulative } from "../state.js";
import { onRender } from "../ui/bus.js";

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
onRender("dashboard", renderDashboard);
