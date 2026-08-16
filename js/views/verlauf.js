/* Ansicht: Verlauf — Wochenwerte als Tabelle. */

import { WEEKS, N_WEEKS, PERSONS } from "../config.js";
import { num, euro, fmtDate } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { personEntry, teamEntry, hebelHours } from "../state.js";
import { onRender } from "../ui/bus.js";

function renderHistory(){
  const curIdx = findCurrentWeekIndex();

  const teamRows = [];
  for(let i=0;i<N_WEEKS;i++){
    const team = teamEntry(i);
    const hasAny = team.termineGebucht||team.termineShowup||team.closes||team.umsatz;
    teamRows.push(`<tr class="${i===curIdx?'current-week':''}">
      <td>${i+1}</td>
      <td>${fmtDate(WEEKS[i][0])}–${fmtDate(WEEKS[i][1])}</td>
      <td>${hasAny?num(team.termineGebucht,0):"–"}</td>
      <td>${hasAny?num(team.termineShowup,0):"–"}</td>
      <td>${hasAny?num(team.closes,0):"–"}</td>
      <td>${hasAny?euro(team.umsatz):"–"}</td>
    </tr>`);
  }
  document.getElementById("historyTeamBody").innerHTML = teamRows.join("");

  const rows = [];
  for(let i=0;i<N_WEEKS;i++){
    let anyForWeek = false;
    PERSONS.forEach(([key,label])=>{
      const e = personEntry(i, key);
      const hebelSum = hebelHours(e);
      const hasAny = e.leadGenHours||hebelSum>0;
      if(!hasAny) return;
      anyForWeek = true;
      rows.push(`<tr class="${i===curIdx?'current-week':''}">
        <td>${i+1}</td>
        <td>${fmtDate(WEEKS[i][0])}–${fmtDate(WEEKS[i][1])}</td>
        <td>${label}</td>
        <td>${num(e.leadGenHours,1)}</td>
        <td>${num(hebelSum,2)}</td>
      </tr>`);
    });
    if(!anyForWeek){
      rows.push(`<tr class="${i===curIdx?'current-week':''}">
        <td>${i+1}</td>
        <td>${fmtDate(WEEKS[i][0])}–${fmtDate(WEEKS[i][1])}</td>
        <td>–</td><td>–</td><td>–</td>
      </tr>`);
    }
  }
  document.getElementById("historyBody").innerHTML = rows.join("");
}
onRender(renderHistory);
