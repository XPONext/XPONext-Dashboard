/* Ansicht: Verlauf — wie sich die Zahlen über das Jahr entwickeln.

   Zwei Umsatzbegriffe, die hier bewusst getrennt bleiben:

   - **Auftragswert** aus den Closes: was beim Abschluss vereinbart wurde.
     Das ist eine Vertriebskennzahl.
   - **Realisierter Umsatz** aus den Kundeneinträgen: was tatsächlich in
     welchem Monat anfällt (Retainer laufen weiter, ohne dass es einen neuen
     Close gibt). Das ist die Zahl fürs Jahresziel.

   Beides zusammenzuzählen würde doppelt zählen. Deshalb steht der
   Auftragswert bei den Vertriebszahlen und der realisierte Umsatz im
   Jahresziel-Diagramm. */

import { WEEKS, N_WEEKS, PERSONS, TOTAL, WEEKLY_TARGET } from "../config.js";
import { num, euro, fmtDate, escapeHtml } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { state, personEntry, teamEntry, hebelHours } from "../state.js";
import { onRender, showErrorBanner } from "../ui/bus.js";
import { linienChart, balkenChart } from "../ui/chart.js";
import { emptyState } from "../ui/components.js";

const MONATE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function gewaehltePerson(){
  return document.getElementById("vlPerson").value;
}

/* Bis zu welcher Woche gibt es Daten? Danach wird nicht auf null gezogen —
   eine noch nicht erfasste Woche ist keine Null. */
function letzteWocheMitDaten(){
  let letzte = findCurrentWeekIndex();
  for(let i=0;i<N_WEEKS;i++){
    const t = teamEntry(i);
    const stunden = PERSONS.reduce((s,[k])=>
      s + personEntry(i,k).leadGenHours + hebelHours(personEntry(i,k)), 0);
    if(t.termineGebucht || t.termineShowup || t.closes || t.umsatz || stunden) letzte = Math.max(letzte, i);
  }
  return letzte;
}

/* ---------- Umsatz gegen das Jahresziel ---------- */

function monatsUmsaetze(){
  const proMonat = {};
  state.revenueMonths.forEach(r=>{
    proMonat[r.month_start] = (proMonat[r.month_start] || 0) + (Number(r.amount) || 0);
  });
  return Object.keys(proMonat).sort().map(m=>[m, proMonat[m]]);
}

function renderUmsatz(){
  const el = document.getElementById("vlUmsatzChart");
  const monate = monatsUmsaetze();

  if(!monate.length){
    el.innerHTML = emptyState(
      "Noch kein Umsatz erfasst",
      "Trag im Reiter „Kunden“ Retainer und Aufträge ein — danach siehst du hier, wie der Umsatz gegen das Jahresziel von " +
      euro(TOTAL.umsatz) + " läuft."
    );
    return;
  }

  // Vom ersten Monat mit Umsatz bis Jahresende, damit die Zielgerade sichtbar ist
  const ersterMonat = monate[0][0];
  const labels = [], istKumuliert = [], ziel = [];
  let summe = 0;
  let [j, m] = ersterMonat.split("-").map(Number);
  const gesamtMonate = [];
  while(j < 2026 || (j === 2026 && m <= 12)){
    gesamtMonate.push(j + "-" + String(m).padStart(2,"0") + "-01");
    m++; if(m > 12){ m = 1; j++; }
    if(gesamtMonate.length > 36) break;   // Sicherheitsnetz
  }

  const heute = new Date();
  const heutigerMonat = heute.getFullYear() + "-" + String(heute.getMonth()+1).padStart(2,"0") + "-01";

  gesamtMonate.forEach((mon, i)=>{
    labels.push(MONATE[Number(mon.slice(5,7)) - 1]);
    const treffer = monate.find(([k])=>k === mon);
    if(treffer) summe += treffer[1];
    // Nach dem laufenden Monat keine Ist-Linie mehr zeichnen
    istKumuliert.push(mon <= heutigerMonat ? summe : null);
    ziel.push(Math.round(TOTAL.umsatz * (i + 1) / gesamtMonate.length));
  });

  el.innerHTML = linienChart({
    reihen: [
      { name: "Umsatz kumuliert", werte: istKumuliert },
      { name: "Ziel", werte: ziel, ziel: true }
    ],
    labels,
    hoehe: 240,
    flaeche: true,
    einheit: " €",
    beschreibung: "Kumulierter realisierter Umsatz je Monat gegen die Zielgerade auf " +
                  euro(TOTAL.umsatz) + " bis Jahresende"
  });
}

/* ---------- Vertrieb je Woche ---------- */

function renderVertrieb(){
  const bis = letzteWocheMitDaten();
  const labels = WEEKS.slice(0, bis + 1).map((_, i)=> "KW " + (i + 1));
  const reihen = [
    { name: "Termine gebucht", werte: labels.map((_,i)=> teamEntry(i).termineGebucht) },
    { name: "davon Show-up",   werte: labels.map((_,i)=> teamEntry(i).termineShowup) },
    { name: "Abschlüsse",      werte: labels.map((_,i)=> teamEntry(i).closes) }
  ];

  const el = document.getElementById("vlVertriebChart");
  if(!reihen.some(r=>r.werte.some(v=>v > 0))){
    el.innerHTML = emptyState("Noch keine Vertriebszahlen",
      "Sobald in der Wochen-Eingabe Termine und Abschlüsse stehen, entsteht hier der Verlauf.");
    return;
  }
  el.innerHTML = balkenChart({
    reihen, labels, hoehe: 220,
    beschreibung: "Gebuchte Termine, Show-ups und Abschlüsse je Kalenderwoche"
  });
}

/* ---------- Stunden je Woche ---------- */

function renderStunden(){
  const person = gewaehltePerson();
  const bis = letzteWocheMitDaten();
  const labels = WEEKS.slice(0, bis + 1).map((_, i)=> "KW " + (i + 1));

  const personen = person === "team" ? PERSONS.map(([k])=>k) : [person];
  const leadGen = labels.map((_,i)=> personen.reduce((s,k)=> s + personEntry(i,k).leadGenHours, 0));
  const hebel   = labels.map((_,i)=> personen.reduce((s,k)=> s + hebelHours(personEntry(i,k)), 0));

  // Das Ziel skaliert mit der Auswahl: Team = beide Personen
  const faktor = personen.length;
  const zielLead  = labels.map(()=> WEEKLY_TARGET.leadGen / 2 * faktor);

  document.getElementById("vlStundenSub").textContent =
    person === "team"
      ? `Lead-Gen und Hebel für beide zusammen — Ziel ${num(WEEKLY_TARGET.leadGen,0)} Std. Lead-Gen je Woche`
      : `Lead-Gen und Hebel — Ziel ${num(WEEKLY_TARGET.leadGen/2,0)} Std. Lead-Gen je Woche`;

  const el = document.getElementById("vlStundenChart");
  if(!leadGen.some(v=>v>0) && !hebel.some(v=>v>0)){
    el.innerHTML = emptyState("Noch keine Stunden erfasst",
      "Lead-Gen trägst du in der Wochen-Eingabe ein, Hebel-Stunden im Reiter „Hebel“.");
    return;
  }
  el.innerHTML = linienChart({
    reihen: [
      { name: "Lead-Gen", werte: leadGen },
      { name: "Hebel",    werte: hebel },
      { name: "Ziel Lead-Gen", werte: zielLead, ziel: true }
    ],
    labels, hoehe: 200, einheit: " Std.",
    beschreibung: "Lead-Gen- und Hebel-Stunden je Kalenderwoche gegen das Wochenziel"
  });
}

/* ---------- Tabellen ----------
   Wochen ohne jede Zahl werden zusammengefasst, statt 25 Zeilen mit
   Gedankenstrichen zu zeigen. */

function abweichung(ist, soll){
  if(!soll) return "";
  const pct = (ist / soll) * 100;
  const klasse = pct >= 100 ? "ok" : pct >= 60 ? "warn" : "low";
  return `<span class="abw abw-${klasse}">${num(pct,0)}%</span>`;
}

function renderTeamTabelle(){
  const curIdx = findCurrentWeekIndex();
  const zeilen = [];
  let leerAmStueck = 0;

  const schreibeLuecke = ()=>{
    if(leerAmStueck){
      zeilen.push(`<tr class="leerzeile"><td colspan="7">${leerAmStueck} Woche${leerAmStueck>1?"n":""} ohne Eintrag</td></tr>`);
      leerAmStueck = 0;
    }
  };

  for(let i=0;i<N_WEEKS;i++){
    const t = teamEntry(i);
    const hatWas = t.termineGebucht || t.termineShowup || t.closes || t.umsatz;
    if(!hatWas && i !== curIdx){ leerAmStueck++; continue; }
    schreibeLuecke();
    zeilen.push(`<tr class="${i===curIdx?'current-week':''}">
      <td>KW ${i+1}</td>
      <td>${escapeHtml(fmtDate(WEEKS[i][0]))}–${escapeHtml(fmtDate(WEEKS[i][1]))}</td>
      <td>${num(t.termineGebucht,0)}</td>
      <td>${num(t.termineShowup,0)} ${abweichung(t.termineShowup, WEEKLY_TARGET.termineShowup)}</td>
      <td>${num(t.closes,0)}</td>
      <td>${t.umsatz ? escapeHtml(euro(t.umsatz)) : "–"}</td>
      <td>${abweichung(t.termineGebucht, WEEKLY_TARGET.termineGebucht)}</td>
    </tr>`);
  }
  schreibeLuecke();

  document.getElementById("vlTeamTable").innerHTML = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Woche</th><th>Zeitraum</th><th>Termine</th><th>Show-up</th>
      <th>Abschlüsse</th><th>Auftragswert</th><th>Termine vs. Ziel</th>
    </tr></thead>
    <tbody>${zeilen.join("")}</tbody>
  </table></div>
  <p class="tabellen-hinweis">„Auftragswert“ ist die Summe der bei den Abschlüssen eingetragenen Beträge — nicht der realisierte Umsatz aus dem Diagramm oben.</p>`;
}

function renderPersonTabelle(){
  const curIdx = findCurrentWeekIndex();
  const person = gewaehltePerson();
  const personen = person === "team" ? PERSONS : PERSONS.filter(([k])=>k === person);
  const zeilen = [];
  let leerAmStueck = 0;

  const schreibeLuecke = ()=>{
    if(leerAmStueck){
      zeilen.push(`<tr class="leerzeile"><td colspan="5">${leerAmStueck} Woche${leerAmStueck>1?"n":""} ohne Eintrag</td></tr>`);
      leerAmStueck = 0;
    }
  };

  for(let i=0;i<N_WEEKS;i++){
    const eintraege = personen.map(([k,label])=>{
      const e = personEntry(i,k);
      return { label, lead: e.leadGenHours, hebel: hebelHours(e) };
    }).filter(e=>e.lead || e.hebel);

    if(!eintraege.length && i !== curIdx){ leerAmStueck++; continue; }
    schreibeLuecke();

    if(!eintraege.length){
      zeilen.push(`<tr class="current-week"><td>KW ${i+1}</td>
        <td>${escapeHtml(fmtDate(WEEKS[i][0]))}–${escapeHtml(fmtDate(WEEKS[i][1]))}</td>
        <td colspan="3">noch nichts erfasst</td></tr>`);
      continue;
    }
    eintraege.forEach((e, nr)=>{
      zeilen.push(`<tr class="${i===curIdx?'current-week':''}">
        <td>${nr===0 ? "KW " + (i+1) : ""}</td>
        <td>${nr===0 ? escapeHtml(fmtDate(WEEKS[i][0]))+"–"+escapeHtml(fmtDate(WEEKS[i][1])) : ""}</td>
        <td>${escapeHtml(e.label)}</td>
        <td>${num(e.lead,1)} ${abweichung(e.lead, WEEKLY_TARGET.leadGen/2)}</td>
        <td>${num(e.hebel,2)} ${abweichung(e.hebel, WEEKLY_TARGET.hebel)}</td>
      </tr>`);
    });
  }
  schreibeLuecke();

  document.getElementById("vlPersonTable").innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Woche</th><th>Zeitraum</th><th>Person</th><th>Lead-Gen</th><th>Hebel</th></tr></thead>
    <tbody>${zeilen.join("")}</tbody>
  </table></div>`;
}

/* ---------- CSV ---------- */

function csvZeile(felder){
  return felder.map(f=>{
    const t = String(f ?? "");
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }).join(";");
}

function exportiere(){
  const zeilen = [csvZeile([
    "Woche","Von","Bis","Termine gebucht","Show-up","Abschluesse","Auftragswert",
    "Lead-Gen Tim","Lead-Gen Simon","Hebel Tim","Hebel Simon"
  ])];
  for(let i=0;i<N_WEEKS;i++){
    const t = teamEntry(i);
    const tim = personEntry(i,"tim"), simon = personEntry(i,"simon");
    zeilen.push(csvZeile([
      "KW " + (i+1), WEEKS[i][0], WEEKS[i][1],
      t.termineGebucht, t.termineShowup, t.closes, t.umsatz,
      tim.leadGenHours, simon.leadGenHours,
      hebelHours(tim), hebelHours(simon)
    ]));
  }
  // Semikolon und BOM, damit Excel die Datei direkt richtig aufteilt
  const blob = new Blob(["﻿" + zeilen.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "xponext-verlauf.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* ---------- Zusammenbau ---------- */

function renderHistory(){
  renderUmsatz();
  renderVertrieb();
  renderStunden();
  renderTeamTabelle();
  renderPersonTabelle();
}

document.getElementById("vlPerson").addEventListener("change", renderHistory);
document.getElementById("vlExport").addEventListener("click", ()=>{
  try{
    exportiere();
  }catch(e){
    showErrorBanner("Der Export hat nicht geklappt: " + ((e && e.message) || e));
  }
});

onRender("verlauf", renderHistory);
