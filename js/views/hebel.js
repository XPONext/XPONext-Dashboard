/* Ansicht: Hebel — taegliche Hebel-Stunden erfassen und pruefen. */

import { LEVERS } from "../config.js";
import { num, barClass } from "../utils/format.js";
import { weekIndexForDate } from "../utils/weeks.js";
import { state, personEntry, buildWeeklyAggregates } from "../state.js";
import { upsertDailyPersonal } from "../data.js";
import { onRender, renderAll, flashSaved } from "../ui/bus.js";

export const HEBEL_INPUT_IDS = {
  callBreakdowns:"hebelCallBreakdowns", coldCall:"hebelColdCall",
  coachings:"hebelCoachings", offer:"hebelOffer", zielgruppe:"hebelZielgruppe"
};

function loadDayIntoHebelForm(){
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const dp = (state.dailyPersonal[date] && state.dailyPersonal[date][person]) || {hebel:{}};
  LEVERS.forEach(([key])=>{
    document.getElementById(HEBEL_INPUT_IDS[key]).value = Number((dp.hebel||{})[key])||0;
  });
  const wi = weekIndexForDate(date);
  renderHebelPreview(wi, person);
}

function renderHebelPreview(i, person){
  if(i<0){ document.getElementById("hebelPreview").innerHTML = ""; return; }
  const e = personEntry(i, person);
  document.getElementById("hebelPreview").innerHTML = LEVERS.map(([key,label])=>{
    const ist = Number(e.hebel[key])||0;
    const pct = (ist/1)*100;
    return `<div class="row-metric">
      <div class="top"><span class="name">${label}</span><span class="vals">${num(ist,2)} / 1 Std. (${num(pct,0)}%)</span></div>
      <div class="bar-track"><div class="bar-fill ${barClass(pct)}" style="width:${Math.min(100,pct)}%"></div></div>
    </div>`;
  }).join("");
}
document.getElementById("saveHebelBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const existingLeadGen = (state.dailyPersonal[date] && state.dailyPersonal[date][person] && state.dailyPersonal[date][person].leadGenHours) || 0;
  const newHebel = {};
  LEVERS.forEach(([key])=>{
    newHebel[key] = Number(document.getElementById(HEBEL_INPUT_IDS[key]).value)||0;
  });
  if(!state.dailyPersonal[date]) state.dailyPersonal[date] = {};
  state.dailyPersonal[date][person] = { leadGenHours: existingLeadGen, hebel: newHebel };
  await upsertDailyPersonal(date, person);
  buildWeeklyAggregates();
  flashSaved("saveHebelMsg");
  renderAll();
});
onRender(()=>{
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  renderHebelPreview(weekIndexForDate(date), person);
});

export { loadDayIntoHebelForm };
