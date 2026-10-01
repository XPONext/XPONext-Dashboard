/* Ansicht: Umsatz-Kopf, Hebel-Summe und Bestenliste. */

import { N_WEEKS, TOTAL, TOTAL_HEBEL } from "../config.js";
import { num, euro, weekLabel } from "../utils/format.js";
import { combinedEntry, cumulative, realisierterUmsatz, auftraegeInWoche, auftragswertInWoche } from "../state.js";
import { onRender } from "../ui/bus.js";

/* Zeichnet den Umsatz-Kopf ueber allen Reitern, dazu Hebel-Summe und
   Bestenliste im Verlauf-Reiter. Die Vertriebskennzahlen stehen seit
   01.10.2026 in views/vertrieb.js, mit einem Zeitraum fuer die ganze Seite. */
function renderDashboard(){
  const {c, weeksLogged, onTarget} = cumulative();

  // Umsatz kommt aus den Kundeneintraegen, nicht mehr aus der Wochen-Eingabe.
  const umsatz = realisierterUmsatz();
  document.getElementById("dashUmsatzIst").textContent = euro(umsatz);
  const umsatzPct = Math.min(100, (umsatz/TOTAL.umsatz)*100);
  document.getElementById("dashUmsatzBar").style.width = umsatzPct+"%";
  document.getElementById("dashUmsatzMeta").textContent =
    num(umsatzPct,1)+"% erreicht · noch "+euro(Math.max(0,TOTAL.umsatz-umsatz))+" bis "+euro(TOTAL.umsatz);

  const hebelPct = (c.hebel/TOTAL_HEBEL)*100;
  const hb = document.getElementById("barHebelTotal");
  hb.style.width = Math.min(100,hebelPct)+"%";
  hb.className = "kpi-fill " + (hebelPct >= 100 ? "is-ok" : hebelPct >= 60 ? "is-warn" : "is-low");
  document.getElementById("pctHebelTotal").textContent = num(c.hebel,1)+" / "+TOTAL_HEBEL+" Std. ("+num(hebelPct,1)+"%)";

  document.getElementById("streakWeeksLogged").textContent = weeksLogged;
  document.getElementById("streakOnTarget").textContent = onTarget;

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
    ["Erstgespräche gebucht", i=>combinedEntry(i).termineGebucht, v=>num(v,0)],
    ["Erstgespräche geführt", i=>combinedEntry(i).termineShowup, v=>num(v,0)],
    ["Aufträge", i=>auftraegeInWoche(i).length, v=>num(v,0)],
    ["Auftragswert", i=>auftragswertInWoche(i), v=>euro(v)],
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
