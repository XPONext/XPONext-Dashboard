/* Ansicht: Hebel — die Stunden, die nicht direkt Umsatz bringen, aber die
   Qualität der Arbeit heben. Ziel sind 7 Std. je Woche und Person.

   Bewusst KEIN Ziel je einzelnem Hebel: festgelegt sind 7 Std. pro Woche
   insgesamt, wie die sich auf die fünf Hebel verteilen, entscheidet ihr.
   Vorher stand hier "/ 1 Std." je Hebel — eine Zahl, die nirgends herkam. */

import { LEVERS, N_WEEKS, WEEKLY_TARGET, PERSONS, WEEKS } from "../config.js";
import { num, barClass, escapeHtml, fmtDate } from "../utils/format.js";
import { weekIndexForDate, findCurrentWeekIndex } from "../utils/weeks.js";
import { state, personEntry, hebelHours, buildWeeklyAggregates } from "../state.js";
import { upsertDailyPersonal, fetchAllData } from "../data.js";
import { onRender, speichern } from "../ui/bus.js";
import { linienChart, chartTabelle, serienFarbe } from "../ui/chart.js";
import { emptyState } from "../ui/components.js";

const ZIEL_WOCHE = WEEKLY_TARGET.hebel;              // 7 Std. je Person und Woche
const ZIEL_JAHR  = ZIEL_WOCHE * N_WEEKS;             // 175 Std. je Person
const SCHRITT    = 0.25;                             // Viertelstunden

/* ---------- Eingabe ---------- */

/* Die Felder werden aus LEVERS erzeugt. Vorher standen die fünf Hebel
   doppelt im Code: einmal im Markup, einmal in der Konfiguration. */
function baueEingabefelder(){
  document.getElementById("hebelInputs").innerHTML = LEVERS.map(([key,label])=>`
    <div class="lever-row">
      <label class="lever-name" for="heb_${key}">${escapeHtml(label)}</label>
      <div class="lever-stepper">
        <button type="button" class="step-btn" data-heb="minus" data-key="${key}" aria-label="${escapeHtml(label)} verringern">−</button>
        <input type="number" id="heb_${key}" data-heb-input="${key}" min="0" step="${SCHRITT}" value="0" inputmode="decimal">
        <button type="button" class="step-btn" data-heb="plus" data-key="${key}" aria-label="${escapeHtml(label)} erhöhen">+</button>
      </div>
      <span class="lever-unit">Std.</span>
    </div>`).join("");
}

function feld(key){
  return document.getElementById("heb_" + key);
}

function tagesSumme(){
  return LEVERS.reduce((s,[key])=> s + (Number(feld(key).value) || 0), 0);
}

function zeigeTagesSumme(){
  const summe = tagesSumme();
  document.getElementById("hebelDaySum").textContent =
    "Summe für diesen Tag: " + num(summe, 2) + " Std.";
}

function loadDayIntoHebelForm(){
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const dp = (state.dailyPersonal[date] && state.dailyPersonal[date][person]) || {hebel:{}};
  LEVERS.forEach(([key])=>{
    feld(key).value = Number((dp.hebel||{})[key]) || 0;
  });
  zeigeTagesSumme();
  renderHebel();
}

document.getElementById("hebelInputs").addEventListener("click", ev=>{
  const btn = ev.target.closest("[data-heb]");
  if(!btn) return;
  const el = feld(btn.dataset.key);
  const richtung = btn.dataset.heb === "plus" ? 1 : -1;
  const neu = (Number(el.value) || 0) + richtung * SCHRITT;
  el.value = Math.max(0, Math.round(neu / SCHRITT) * SCHRITT);
  zeigeTagesSumme();
});

document.getElementById("hebelInputs").addEventListener("input", ev=>{
  if(ev.target.dataset.hebInput) zeigeTagesSumme();
});

document.getElementById("saveHebelBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const existingLeadGen = (state.dailyPersonal[date] && state.dailyPersonal[date][person] && state.dailyPersonal[date][person].leadGenHours) || 0;
  const newHebel = {};
  LEVERS.forEach(([key])=>{
    newHebel[key] = Number(feld(key).value) || 0;
  });
  if(!state.dailyPersonal[date]) state.dailyPersonal[date] = {};
  state.dailyPersonal[date][person] = { leadGenHours: existingLeadGen, hebel: newHebel };
  await speichern(async ()=>{
    await upsertDailyPersonal(date, person);
    buildWeeklyAggregates();
  }, "saveHebelMsg", fetchAllData);
});

/* ---------- Auswertung ---------- */

function wochenReihe(person){
  return Array.from({length: N_WEEKS}, (_, i)=> hebelHours(personEntry(i, person)));
}

/* Bis zu welcher Woche gibt es überhaupt Daten? Danach wird die Linie nicht
   auf null gezogen — eine noch nicht erfasste Woche ist keine Null. */
function letzteErfassteWoche(){
  let letzte = -1;
  for(let i=0;i<N_WEEKS;i++){
    const summe = PERSONS.reduce((s,[key])=> s + hebelHours(personEntry(i, key)), 0);
    if(summe > 0) letzte = i;
  }
  return Math.max(letzte, findCurrentWeekIndex());
}

function renderKennzahlen(person, wochenIdx){
  const reihe = wochenReihe(person);
  const dieseWoche = wochenIdx >= 0 ? reihe[wochenIdx] : 0;
  const gesamt = reihe.reduce((s,v)=>s+v, 0);

  const wochePct = (dieseWoche / ZIEL_WOCHE) * 100;
  document.getElementById("hebWeekNum").innerHTML = num(dieseWoche,2) + ` <small>/ ${num(ZIEL_WOCHE,0)} Std.</small>`;
  const wb = document.getElementById("hebWeekBar");
  wb.style.width = Math.min(100, wochePct) + "%";
  wb.className = "bar-fill " + barClass(wochePct);
  document.getElementById("hebWeekPct").textContent =
    dieseWoche >= ZIEL_WOCHE
      ? "Ziel erreicht"
      : "noch " + num(ZIEL_WOCHE - dieseWoche, 2) + " Std. bis zum Wochenziel";

  const jahrPct = (gesamt / ZIEL_JAHR) * 100;
  document.getElementById("hebYearNum").innerHTML = num(gesamt,1) + ` <small>/ ${num(ZIEL_JAHR,0)} Std.</small>`;
  const yb = document.getElementById("hebYearBar");
  yb.style.width = Math.min(100, jahrPct) + "%";
  yb.className = "bar-fill " + barClass(jahrPct);
  document.getElementById("hebYearPct").textContent = num(jahrPct,1) + "% des Jahresziels";

  // Nur Wochen zählen, in denen überhaupt etwas erfasst wurde
  const erfasst = reihe.filter(v=>v > 0).length;
  const erreicht = reihe.filter(v=>v >= ZIEL_WOCHE).length;
  document.getElementById("hebWeeksHit").textContent = erreicht;
  document.getElementById("hebWeeksHitSub").textContent =
    erfasst ? "von " + erfasst + " erfassten Wochen" : "noch nichts erfasst";

  // Stärkster Hebel über den gesamten Zeitraum
  const summen = LEVERS.map(([key,label])=>{
    const s = Array.from({length: N_WEEKS}, (_, i)=> Number(personEntry(i, person).hebel[key]) || 0)
                   .reduce((a,b)=>a+b, 0);
    return [label, s];
  }).sort((a,b)=>b[1]-a[1]);
  const top = summen[0];
  document.getElementById("hebTopLever").textContent = top && top[1] > 0 ? top[0] : "—";
  document.getElementById("hebTopLeverSub").textContent =
    top && top[1] > 0 ? num(top[1],1) + " Std. insgesamt" : "bisher insgesamt";
}

function renderVerlauf(bisWoche){
  const bis = Math.max(0, bisWoche);
  const labels = WEEKS.slice(0, bis + 1).map((_, i)=> "KW " + (i + 1));

  const reihen = PERSONS.map(([key,label])=>({
    name: label,
    werte: wochenReihe(key).slice(0, bis + 1)
  }));
  const zielReihe = { name: "Ziel", werte: labels.map(()=> ZIEL_WOCHE), ziel: true };

  const ziel = document.getElementById("hebChart");
  const hatDaten = reihen.some(r=>r.werte.some(v=>v > 0));
  if(!hatDaten){
    ziel.innerHTML = emptyState(
      "Noch keine Hebel-Stunden erfasst",
      "Trag unten deine ersten Stunden ein — danach siehst du hier den Wochenverlauf gegen das Ziel von 7 Std."
    );
    document.getElementById("hebChartTable").innerHTML = "";
    return;
  }

  ziel.innerHTML = linienChart({
    reihen: [...reihen, zielReihe],
    labels,
    hoehe: 220,
    einheit: " Std.",
    beschreibung: "Hebel-Stunden je Woche für Tim und Simon, verglichen mit dem Wochenziel von 7 Stunden"
  });
  document.getElementById("hebChartTable").innerHTML = chartTabelle({ reihen, labels });
}

/* Aufteilung auf die fünf Hebel — Kategorien, deshalb Serienfarben
   und ausdrücklich nicht die Ampel. */
function renderAufteilung(person, wochenIdx){
  const el = document.getElementById("hebelPreview");
  if(wochenIdx < 0){ el.innerHTML = ""; return; }

  const e = personEntry(wochenIdx, person);
  const werte = LEVERS.map(([key,label])=> [label, Number(e.hebel[key]) || 0]);
  const summe = werte.reduce((s,[,v])=>s+v, 0);

  if(summe <= 0){
    el.innerHTML = emptyState("", "In dieser Woche sind noch keine Hebel-Stunden erfasst.", { inline:true });
    return;
  }

  el.innerHTML = werte
    .map(([label, v], i)=> [label, v, i])
    .sort((a,b)=>b[1]-a[1])
    .map(([label, v, i])=>{
      const anteil = (v / summe) * 100;
      return `<div class="row-metric">
        <div class="top">
          <span class="name">${escapeHtml(label)}</span>
          <span class="vals">${num(v,2)} Std. · ${num(anteil,0)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${anteil}%;background:${serienFarbe(i)}"></div></div>
      </div>`;
    }).join("");
}

function renderHebel(){
  const person = document.getElementById("personSelectHebel").value;
  const wochenIdx = weekIndexForDate(document.getElementById("entryDateHebel").value);

  document.getElementById("hebChartSub").textContent =
    "Hebel-Stunden je Woche gegen das Ziel von " + num(ZIEL_WOCHE,0) + " Std.";
  document.getElementById("hebSplitSub").textContent =
    wochenIdx >= 0
      ? "Woher die Hebel-Stunden in KW " + (wochenIdx + 1) + " kommen (" +
        fmtDate(WEEKS[wochenIdx][0]) + "–" + fmtDate(WEEKS[wochenIdx][1]) + ")"
      : "Woher die Hebel-Stunden kommen";

  renderKennzahlen(person, wochenIdx);
  renderVerlauf(letzteErfassteWoche());
  renderAufteilung(person, wochenIdx);
}

baueEingabefelder();
onRender("hebel", renderHebel);

export { loadDayIntoHebelForm };
