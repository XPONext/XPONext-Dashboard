/* Ansicht: Zeittracking — was das Popup alle 30 Minuten erfasst hat.

   Die Frage, die dieser Reiter beantwortet, ist "für wen ist die Zeit
   draufgegangen". Deshalb steht die Kundenaufteilung oben und die Art der
   Arbeit darunter zugeklappt — nicht umgekehrt wie vorher.

   Der "Highscore-Tag" ist entfallen: Er beantwortete keine Frage, die
   irgendjemand stellt. */

import { WEEKS, N_WEEKS } from "../config.js";
import { num, fmtDate, weekLabel, localDateStr, escapeHtml } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { state } from "../state.js";
import { onRender } from "../ui/bus.js";
import { emptyState } from "../ui/components.js";
import { serienFarbe } from "../ui/chart.js";

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
  return entries.filter(e=>!excludePause || e.state!=="Pause")
                .reduce((s,e)=>s+(Number(e.duration_minutes)||0),0);
}

/* Aufteilung als Balkenliste. Kategorien bekommen Serienfarben — die Ampel
   bliebe hier eine Wertung, die niemand gemeint hat. */
function renderAufteilung(entries, field, containerId, leerText){
  const arbeit = entries.filter(e=>e.state!=="Pause" && e[field]);
  const summen = {};
  let gesamt = 0;
  arbeit.forEach(e=>{
    summen[e[field]] = (summen[e[field]]||0) + (Number(e.duration_minutes)||0);
    gesamt += Number(e.duration_minutes)||0;
  });

  const zeilen = Object.entries(summen).sort((a,b)=>b[1]-a[1]);
  const el = document.getElementById(containerId);
  if(!zeilen.length){
    el.innerHTML = emptyState("", leerText, { inline:true });
    return;
  }

  el.innerHTML = zeilen.map(([key, minuten], i)=>{
    const anteil = gesamt>0 ? (minuten/gesamt)*100 : 0;
    return `<div class="row-metric">
      <div class="top">
        <span class="name">${escapeHtml(key)}</span>
        <span class="vals">${num(minuten/60,1)} Std. · ${num(anteil,0)}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${anteil}%;background:${serienFarbe(i)}"></div></div>
    </div>`;
  }).join("");
}

/* Alte Einträge tragen noch eine Aktivität. Das Popup fragt sie nicht mehr ab;
   verschlucken wollen wir sie trotzdem nicht. */
function renderAltbestand(entries){
  const mitAktivitaet = entries.filter(e=>e.state!=="Pause" && e.aktivitaet);
  const el = document.getElementById("ztLegacy");
  if(!mitAktivitaet.length){ el.innerHTML = ""; return; }

  const summen = {};
  mitAktivitaet.forEach(e=>{
    summen[e.aktivitaet] = (summen[e.aktivitaet]||0) + (Number(e.duration_minutes)||0);
  });
  const zeilen = Object.entries(summen).sort((a,b)=>b[1]-a[1]);

  el.innerHTML = `<div class="zt-legacy-head">Frühere Aktivitäten</div>
    <p class="zt-legacy-hint">Das Popup fragt die Aktivität nicht mehr ab — diese Einträge stammen aus der Zeit davor.</p>
    <div class="zt-legacy-list">${zeilen.map(([k,m])=>
      `<span class="zt-chip">${escapeHtml(k)} · ${num(m/60,1)} Std.</span>`).join("")}</div>`;
}

function renderZeittracking(){
  const todayStr = localDateStr(new Date().toISOString());
  const curIdx = findCurrentWeekIndex();
  if(state.ztWeekIdx === null) state.ztWeekIdx = curIdx;
  const isCurrentWeek = state.ztWeekIdx === curIdx;
  const weekFrom = WEEKS[state.ztWeekIdx][0], weekTo = WEEKS[state.ztWeekIdx][1];

  document.getElementById("ztWeekHeading").textContent = isCurrentWeek ? "Diese Woche" : "Ausgewählte Woche";
  document.getElementById("ztWeekLabel").textContent = weekLabel(state.ztWeekIdx);
  document.getElementById("ztPrevWeek").disabled = state.ztWeekIdx <= 0;
  document.getElementById("ztNextWeek").disabled = state.ztWeekIdx >= N_WEEKS - 1;
  document.querySelectorAll(".zt-week-sub").forEach(el=>{
    el.textContent = isCurrentWeek ? "diese Woche" : weekLabel(state.ztWeekIdx);
  });

  const weekAll = filterTimeEntries({dateFrom: weekFrom, dateTo: weekTo});
  const arbeit = sumMinutes(weekAll, true) / 60;
  const pause  = sumMinutes(weekAll.filter(e=>e.state==="Pause"), false) / 60;
  const tim    = sumMinutes(weekAll.filter(e=>e.person==="tim"), true) / 60;
  const simon  = sumMinutes(weekAll.filter(e=>e.person==="simon"), true) / 60;

  document.getElementById("ztWeekHours").textContent = num(arbeit, 1);
  document.getElementById("ztWeekHoursSub").textContent =
    pause > 0 ? "Stunden Arbeit · " + num(pause,1) + " Std. Pause" : "Stunden gesamt";
  document.getElementById("ztWeekTim").textContent = num(tim, 1);
  document.getElementById("ztWeekSimon").textContent = num(simon, 1);
  document.getElementById("ztWeekTimSub").textContent =
    arbeit > 0 ? num((tim/arbeit)*100, 0) + "% der Zeit" : "Stunden";
  document.getElementById("ztWeekSimonSub").textContent =
    arbeit > 0 ? num((simon/arbeit)*100, 0) + "% der Zeit" : "Stunden";

  // Die Heute-Karte ergibt nur Sinn, solange man auf der laufenden Woche steht.
  const heuteKarte = document.getElementById("ztTodayCard");
  heuteKarte.style.display = isCurrentWeek ? "" : "none";
  if(isCurrentWeek){
    const todayAll = filterTimeEntries({dateFrom: todayStr, dateTo: todayStr});
    document.getElementById("ztTodayHours").textContent = num(sumMinutes(todayAll, true)/60, 1);
    document.getElementById("ztTodaySub").textContent = fmtDate(todayStr) + " Stunden";
  }

  renderAufteilung(weekAll, "zuordnung", "ztByZuordnung",
    "In dieser Woche wurde noch keine Zeit einem Kunden zugeordnet.");
  renderAufteilung(weekAll, "state", "ztByState",
    "In dieser Woche wurde noch nichts erfasst.");
  renderAltbestand(weekAll);
}

document.getElementById("ztPrevWeek").addEventListener("click", ()=>{
  if(state.ztWeekIdx > 0){ state.ztWeekIdx--; renderZeittracking(); }
});
document.getElementById("ztNextWeek").addEventListener("click", ()=>{
  if(state.ztWeekIdx < N_WEEKS - 1){ state.ztWeekIdx++; renderZeittracking(); }
});

onRender("zeittracking", renderZeittracking);
