import {
  WEEKS, N_WEEKS, LEAD_GEN_PER_PERSON, TOTAL, WEEKLY_TARGET, LEVERS, PERSONS, TOTAL_HEBEL,
  PRIORITY_ORDER, STATUS_COLUMNS,
  SUPABASE_URL, SUPABASE_ANON_KEY, SECRET_STORAGE_KEY, PERSON_STORAGE_KEY
} from "./config.js";
import { escapeHtml, fmtDate, weekLabel, euro, num, localDateStr, barClass } from "./utils/format.js";
import { weekIndexForDate, findCurrentWeekIndex } from "./utils/weeks.js";

/* ---------- Fehlerbanner ----------
   Seit dem Umbau auf ES-Module scheitern Ladefehler still, wenn die Konsole zu
   ist. Der Banner macht sie sichtbar — er ist der Ersatz für ein Test-Setup. */
function showErrorBanner(msg){
  let el = document.getElementById("errorBanner");
  if(!el){
    el = document.createElement("div");
    el.id = "errorBanner";
    el.className = "error-banner";
    document.body.prepend(el);
  }
  el.textContent = msg;
  el.style.display = "block";
}

window.addEventListener("error", ev=>{
  showErrorBanner("Es ist ein Fehler aufgetreten: "+(ev.message||"unbekannt")+" — bitte die Seite neu laden.");
});
window.addEventListener("unhandledrejection", ev=>{
  const r = ev.reason;
  showErrorBanner("Es ist ein Fehler aufgetreten: "+((r&&r.message)||r||"unbekannt")+" — bitte die Seite neu laden.");
});

let db;

function buildClient(secret){
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { "x-app-secret": secret } }
  });
}

async function ensureAuthorized(){
  let secret = localStorage.getItem(SECRET_STORAGE_KEY);
  while(true){
    if(!secret){
      secret = window.prompt("Team-Passwort für den KPI-Tracker eingeben:");
      if(secret === null){
        document.body.innerHTML = "<p style='padding:2rem;font-family:sans-serif;'>Ohne Passwort kein Zugriff auf den Tracker.</p>";
        throw new Error("Kein Passwort eingegeben");
      }
    }
    db = buildClient(secret);
    const { error } = await db.from("daily_team").upsert({ date: "2000-01-01", termine_gebucht: 0 });
    if(!error){
      localStorage.setItem(SECRET_STORAGE_KEY, secret);
      return;
    }
    alert("Falsches Passwort, bitte erneut versuchen.");
    secret = null;
  }
}

async function fetchAllData(){
  const [personalRes, teamRes, timeRes, tasksRes, goalsRes, commitRes, projRes, stepRes] = await Promise.all([
    db.from("daily_personal").select("*"),
    db.from("daily_team").select("*"),
    db.from("time_entries").select("*"),
    db.from("tasks").select("*").order("created_at", { ascending: true }),
    db.from("weekly_goals").select("*"),
    db.from("weekly_commitments").select("*").order("created_at", { ascending: true }),
    db.from("projects").select("*").order("created_at", { ascending: true }),
    db.from("project_steps").select("*").order("created_at", { ascending: true })
  ]);
  if(projRes.error){ console.error(projRes.error); PROJECTS = []; }
  else{ PROJECTS = projRes.data; }
  if(stepRes.error){ console.error(stepRes.error); PROJECT_STEPS = []; }
  else{ PROJECT_STEPS = stepRes.data; }
  if(timeRes.error){ console.error(timeRes.error); TIME_ENTRIES = []; }
  else{ TIME_ENTRIES = timeRes.data; }
  if(tasksRes.error){ console.error(tasksRes.error); TASKS = []; }
  else{ TASKS = tasksRes.data; }
  if(goalsRes.error){ console.error(goalsRes.error); GOALS = []; }
  else{ GOALS = goalsRes.data; }
  if(commitRes.error){ console.error(commitRes.error); COMMITMENTS = []; }
  else{ COMMITMENTS = commitRes.data; }
  const dp = {};
  if(personalRes.error){ console.error(personalRes.error); alert("Daten konnten nicht geladen werden: "+personalRes.error.message); }
  else{
    personalRes.data.forEach(row=>{
      if(!dp[row.date]) dp[row.date] = {};
      dp[row.date][row.person] = { leadGenHours: Number(row.lead_gen_hours)||0, hebel: row.hebel || {} };
    });
  }

  const dt = {};
  if(teamRes.error){ console.error(teamRes.error); alert("Team-Daten konnten nicht geladen werden: "+teamRes.error.message); }
  else{
    teamRes.data.forEach(row=>{
      dt[row.date] = {
        termineGebucht: Number(row.termine_gebucht)||0,
        termineShowup: Number(row.termine_showup)||0,
        closes: Array.isArray(row.closes) ? row.closes.map(Number) : []
      };
    });
  }

  DAILY_PERSONAL = dp;
  DAILY_TEAM = dt;
  buildWeeklyAggregates();
}

function buildWeeklyAggregates(){
  const data = {}, dataTeam = {};
  for(let i=0;i<N_WEEKS;i++){
    data[i] = { tim: {leadGenHours:0, hebel:{}}, simon: {leadGenHours:0, hebel:{}} };
    dataTeam[i] = { termineGebucht:0, termineShowup:0, closesCount:0, closesSum:0 };
  }
  Object.entries(DAILY_PERSONAL).forEach(([date, persons])=>{
    const wi = weekIndexForDate(date);
    if(wi<0) return;
    PERSONS.forEach(([key])=>{
      const d = persons[key];
      if(!d) return;
      data[wi][key].leadGenHours += Number(d.leadGenHours)||0;
      LEVERS.forEach(([lk])=>{
        data[wi][key].hebel[lk] = (data[wi][key].hebel[lk]||0) + (Number(d.hebel[lk])||0);
      });
    });
  });
  Object.entries(DAILY_TEAM).forEach(([date, t])=>{
    const wi = weekIndexForDate(date);
    if(wi<0) return;
    dataTeam[wi].termineGebucht += Number(t.termineGebucht)||0;
    dataTeam[wi].termineShowup += Number(t.termineShowup)||0;
    const closes = t.closes || [];
    dataTeam[wi].closesCount += closes.length;
    dataTeam[wi].closesSum += closes.reduce((s,v)=>s+(Number(v)||0),0);
  });
  DATA = data;
  DATA_TEAM = dataTeam;
}

async function upsertDailyPersonal(date, person){
  const e = (DAILY_PERSONAL[date] && DAILY_PERSONAL[date][person]) || {leadGenHours:0, hebel:{}};
  const { error } = await db.from("daily_personal").upsert({
    date, person, lead_gen_hours: e.leadGenHours, hebel: e.hebel, updated_at: new Date().toISOString()
  });
  if(error){ console.error(error); alert("Speichern fehlgeschlagen: "+error.message); }
}

async function upsertDailyTeam(date){
  const e = DAILY_TEAM[date] || {termineGebucht:0, termineShowup:0, closes:[]};
  const { error } = await db.from("daily_team").upsert({
    date,
    termine_gebucht: e.termineGebucht,
    termine_showup: e.termineShowup,
    closes: e.closes,
    updated_at: new Date().toISOString()
  });
  if(error){ console.error(error); alert("Speichern fehlgeschlagen: "+error.message); }
}

let DAILY_PERSONAL = {}; // { "2026-07-14": { tim: {calls, hebel:{...}}, simon: {...} } }
let DAILY_TEAM = {}; // { "2026-07-14": {termineGebucht, termineShowup, closes, umsatz} }
let DATA = {}; // Wochen-Aggregate, aus DAILY_PERSONAL berechnet: { 1: { tim: {calls, hebel:{...}}, simon: {...} } }
let DATA_TEAM = {}; // Wochen-Aggregate, aus DAILY_TEAM berechnet: { 1: {termineGebucht, termineShowup, closes, umsatz} }
let TIME_ENTRIES = []; // Rohe Zeittracking-Einträge aus der Supabase-Tabelle "time_entries"
let TASKS = []; // Rohe Aufgaben aus der Supabase-Tabelle "tasks"
let GOALS = []; // Wochenfokus aus der Supabase-Tabelle "weekly_goals"
let COMMITMENTS = []; // Wochen-Commitments aus der Supabase-Tabelle "weekly_commitments"
let PROJECTS = [];    // Langzeitprojekte aus der Supabase-Tabelle "projects"
let PROJECT_STEPS = []; // Zugehörige Schritte aus "project_steps"
let boardWeekIdx = 0; // aktuell im Aufgaben-Board angezeigte Woche (Index in WEEKS)
let ztWeekIdx = null; // aktuell im Zeittracking angezeigte Woche; null = noch nicht gesetzt, startet auf der laufenden
// Status robust bestimmen — auch für Alt-Aufgaben ohne status-Feld
function normStatus(t){
  if(t.status && STATUS_COLUMNS.some(c=>c[0]===t.status)) return t.status;
  return t.done ? "done" : "backlog";
}

function personEntry(i, person){
  const w = (DATA[i] && DATA[i][person]) || {};
  return {
    leadGenHours: Number(w.leadGenHours)||0,
    hebel: w.hebel || {}
  };
}

function teamEntry(i){
  const w = DATA_TEAM[i] || {};
  return {
    termineGebucht: Number(w.termineGebucht)||0,
    termineShowup: Number(w.termineShowup)||0,
    closes: Number(w.closesCount)||0,
    umsatz: Number(w.closesSum)||0
  };
}

function hebelHours(entry){
  return LEVERS.reduce((s,[k])=>s+(Number(entry.hebel[k])||0),0);
}

function combinedEntry(i){
  const t = personEntry(i,"tim"), s = personEntry(i,"simon"), team = teamEntry(i);
  return {
    leadGenHours: t.leadGenHours+s.leadGenHours,
    termineGebucht: team.termineGebucht,
    termineShowup: team.termineShowup,
    closes: team.closes,
    umsatz: team.umsatz,
    hebelHours: hebelHours(t)+hebelHours(s)
  };
}

function cumulative(){
  const c = {leadGenHours:0,termineGebucht:0,termineShowup:0,closes:0,umsatz:0,hebel:0};
  let weeksLogged = 0, onTarget = 0, bestWeek = null, bestUmsatz = -1;
  for(let i=0;i<N_WEEKS;i++){
    const e = combinedEntry(i);
    const hasAny = e.leadGenHours||e.termineGebucht||e.termineShowup||e.closes||e.umsatz||e.hebelHours>0;
    if(!hasAny) continue;
    weeksLogged++;
    c.leadGenHours += e.leadGenHours; c.termineGebucht += e.termineGebucht; c.termineShowup += e.termineShowup;
    c.closes += e.closes; c.umsatz += e.umsatz;
    c.hebel += e.hebelHours;
    if(e.umsatz >= WEEKLY_TARGET.umsatz) onTarget++;
    if(e.umsatz > bestUmsatz){ bestUmsatz = e.umsatz; bestWeek = i; }
  }
  return {c, weeksLogged, onTarget, bestWeek, bestUmsatz};
}

/* ---------- Zeittracking ---------- */

function filterTimeEntries({dateFrom, dateTo, person}){
  return TIME_ENTRIES.filter(e=>{
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
  if(ztWeekIdx === null) ztWeekIdx = curIdx;
  const isCurrentWeek = ztWeekIdx === curIdx;
  const weekFrom = WEEKS[ztWeekIdx][0], weekTo = WEEKS[ztWeekIdx][1];

  // Die "Heute"-Karte ergibt nur Sinn, solange man auf der laufenden Woche steht.
  document.getElementById("ztTodayCard").style.display = isCurrentWeek ? "" : "none";
  document.getElementById("ztWeekHeading").textContent = isCurrentWeek ? "Diese Woche" : "Ausgewählte Woche";
  document.getElementById("ztWeekLabel").textContent = weekLabel(ztWeekIdx);
  document.getElementById("ztPrevWeek").disabled = ztWeekIdx <= 0;
  document.getElementById("ztNextWeek").disabled = ztWeekIdx >= N_WEEKS - 1;
  document.querySelectorAll(".zt-week-sub").forEach(el=>{
    el.textContent = isCurrentWeek ? "diese Woche" : weekLabel(ztWeekIdx);
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
  TIME_ENTRIES.filter(e=>e.state!=="Pause").forEach(e=>{
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

/* ---------- Rendering ---------- */
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

const HEBEL_INPUT_IDS = {callBreakdowns:"hebelCallBreakdowns", coldCall:"hebelColdCall", coachings:"hebelCoachings", offer:"hebelOffer", zielgruppe:"hebelZielgruppe"};

function todayIso(){
  return new Date().toISOString().slice(0,10);
}
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
  const dp = (DAILY_PERSONAL[date] && DAILY_PERSONAL[date][person]) || {leadGenHours:0};
  document.getElementById("inLeadGen").value = dp.leadGenHours || 0;

  const dt = DAILY_TEAM[date] || {termineGebucht:0, termineShowup:0, closes:[]};
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

function loadDayIntoHebelForm(){
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const dp = (DAILY_PERSONAL[date] && DAILY_PERSONAL[date][person]) || {hebel:{}};
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
  const goal = GOALS.find(g=>g.week_start===weekStart);
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

  const rows = COMMITMENTS.filter(c=>c.week_start===weekStart);
  const list = document.getElementById("commitmentsList");
  if(!rows.length){
    list.innerHTML = `<div class="commit-empty">Noch keine Commitments für diese Woche.</div>`;
    return;
  }
  list.innerHTML = rows.map(c=>`
    <div class="commit-row ${c.done?"is-done":""}" data-id="${c.id}">
      <input type="checkbox" ${c.done?"checked":""} data-act="toggle" data-id="${c.id}">
      <span class="commit-text">${escapeHtml(c.text)}</span>
      <span class="task-badge person">${PERSON_LABEL[c.assignee]||c.assignee}</span>
      <button type="button" class="commit-del" data-act="del" data-id="${c.id}" title="Commitment löschen">✕</button>
    </div>`).join("");
}

/* ---------- Projekte ----------
   Langzeitprojekte hängen bewusst an keiner Woche — sie laufen quer über den
   ganzen Zeitraum. Jedes Projekt hat beliebig viele Schritte zum Abhaken. */
const PROJECT_STATUS_LABEL = { aktiv:"Aktiv", pausiert:"Pausiert", fertig:"Abgeschlossen" };

function stepsOf(projectId){
  return PROJECT_STEPS.filter(s=>String(s.project_id)===String(projectId));
}

function renderProjects(){
  const showDone = document.getElementById("showDoneProjects").checked;

  // Kennzahlen immer über alle Projekte rechnen, unabhängig vom Anzeigefilter.
  const activeProjects = PROJECTS.filter(p=>p.status==="aktiv");
  const openSteps = PROJECT_STEPS.filter(s=>!s.done && PROJECTS.some(p=>String(p.id)===String(s.project_id) && p.status!=="fertig"));
  document.getElementById("projStatActive").textContent = activeProjects.length;
  document.getElementById("projStatOpen").textContent = openSteps.length;
  document.getElementById("projStatDone").textContent = PROJECT_STEPS.filter(s=>s.done).length;

  const todayStr = todayIso();
  const upcoming = PROJECTS
    .filter(p=>p.status!=="fertig" && p.due_date)
    .sort((a,b)=>a.due_date.localeCompare(b.due_date))[0];
  document.getElementById("projStatDeadline").textContent = upcoming ? (fmtDate(upcoming.due_date)+" · "+upcoming.title) : "—";

  const visible = PROJECTS.filter(p=>showDone || p.status!=="fertig");
  // Offene zuerst, innerhalb dessen die mit der nächsten Deadline oben.
  visible.sort((a,b)=>{
    const rank = s => s==="aktiv" ? 0 : (s==="pausiert" ? 1 : 2);
    if(rank(a.status)!==rank(b.status)) return rank(a.status)-rank(b.status);
    if(a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if(a.due_date) return -1;
    if(b.due_date) return 1;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  const list = document.getElementById("projectsList");
  if(!visible.length){
    list.innerHTML = `<div class="projects-empty">${PROJECTS.length ? "Keine offenen Projekte — setz den Haken oben, um die abgeschlossenen zu sehen." : "Noch keine Projekte angelegt."}</div>`;
    return;
  }

  list.innerHTML = visible.map(p=>{
    const steps = stepsOf(p.id);
    const doneCount = steps.filter(s=>s.done).length;
    const pct = steps.length ? (doneCount/steps.length)*100 : 0;
    const isLate = p.due_date && p.due_date < todayStr && p.status!=="fertig";

    const stepRows = steps.length ? steps.map(s=>`
      <div class="step-row ${s.done?"is-done":""}">
        <input type="checkbox" ${s.done?"checked":""} data-pact="step-toggle" data-id="${s.id}">
        <span class="step-text">${escapeHtml(s.text)}</span>
        <span class="task-badge person">${PERSON_LABEL[s.assignee]||s.assignee}</span>
        <button type="button" class="step-del" data-pact="step-del" data-id="${s.id}" title="Schritt löschen">✕</button>
      </div>`).join("") : `<div class="step-empty">Noch keine Schritte — leg unten den ersten an.</div>`;

    return `<div class="project-card ${p.status==="fertig"?"is-done":""}">
      <div class="project-top">
        <div class="project-title">${escapeHtml(p.title)}</div>
        <button type="button" class="project-edit" data-pact="proj-edit" data-id="${p.id}" title="Projekt bearbeiten">Bearbeiten</button>
      </div>
      ${p.description ? `<div class="project-desc">${escapeHtml(p.description)}</div>` : ""}
      <div class="project-badges">
        <span class="status-badge st-${p.status}">${PROJECT_STATUS_LABEL[p.status]||p.status}</span>
        <span class="task-badge person">${PERSON_LABEL[p.owner]||p.owner}</span>
        ${p.due_date ? `<span class="due-badge ${isLate?"is-late":""}">${isLate?"überfällig seit ":"bis "}${fmtDate(p.due_date)}</span>` : ""}
      </div>
      <div class="project-progress">
        <div class="bar-track"><div class="bar-fill ${pct>=100?"ok":(pct>=50?"warn":"low")}" style="width:${pct}%"></div></div>
        <span class="ratio">${doneCount}/${steps.length}</span>
      </div>
      <div class="step-list">${stepRows}</div>
      <button type="button" class="btn-outline step-add" data-pact="step-add" data-id="${p.id}">+ Schritt</button>
    </div>`;
  }).join("");
}

/* ---------- Aufgaben-Board ---------- */
const PERSON_LABEL = { tim:"Tim", simon:"Simon", beide:"Beide" };
const PRIO_LABEL = { hoch:"Hoch", mittel:"Mittel", niedrig:"Niedrig" };

function renderTasks(){
  const weekStart = WEEKS[boardWeekIdx][0];
  document.getElementById("tasksWeekLabel").textContent = weekLabel(boardWeekIdx);
  document.getElementById("taskPrevWeek").disabled = boardWeekIdx <= 0;
  document.getElementById("taskNextWeek").disabled = boardWeekIdx >= N_WEEKS - 1;

  const weekTasks = TASKS.filter(t=>t.week_start===weekStart);
  const board = document.getElementById("kanbanBoard");
  board.innerHTML = STATUS_COLUMNS.map(([key,label])=>{
    const colTasks = weekTasks.filter(t=>normStatus(t)===key).slice().sort((a,b)=>{
      const pa = PRIORITY_ORDER[a.priority] ?? 1, pb = PRIORITY_ORDER[b.priority] ?? 1;
      if(pa !== pb) return pa - pb;
      return new Date(a.created_at) - new Date(b.created_at);
    });
    const cards = colTasks.length
      ? colTasks.map(t=>`
        <div class="kanban-card ${key==="done"?"is-done":""}" data-id="${t.id}">
          <div class="kanban-card-text">${escapeHtml(t.text)}</div>
          <div class="kanban-card-badges">
            <span class="task-badge person">${PERSON_LABEL[t.assignee]||t.assignee}</span>
            <span class="task-badge prio-${t.priority}">${PRIO_LABEL[t.priority]||t.priority}</span>
          </div>
        </div>`).join("")
      : `<div class="kanban-empty">–</div>`;
    return `
      <div class="kanban-col">
        <div class="kanban-col-head">
          <span class="kanban-col-title">${label}</span>
          <span class="kanban-count">${colTasks.length}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>`;
  }).join("");
}

function renderAll(){
  renderDashboard();
  renderHistory();
  renderGoal();
  renderCommitments();
  renderTasks();
  renderProjects();
  const date = document.getElementById("entryDate").value;
  renderPreview(weekIndexForDate(date));
  const dateHebel = document.getElementById("entryDateHebel").value;
  const personHebel = document.getElementById("personSelectHebel").value;
  renderHebelPreview(weekIndexForDate(dateHebel), personHebel);
  renderZeittracking();
}

/* ---------- Events ---------- */
document.querySelectorAll(".tab-btn").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-"+btn.dataset.view).classList.add("active");
    await fetchAllData();
    loadDayIntoForm();
    loadDayIntoHebelForm();
    renderAll();
  });
});

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
  const existingHebel = (DAILY_PERSONAL[date] && DAILY_PERSONAL[date][person] && DAILY_PERSONAL[date][person].hebel) || {};
  if(!DAILY_PERSONAL[date]) DAILY_PERSONAL[date] = {};
  DAILY_PERSONAL[date][person] = {
    leadGenHours: Number(document.getElementById("inLeadGen").value)||0,
    hebel: existingHebel
  };
  await upsertDailyPersonal(date, person);
  buildWeeklyAggregates();
  const msg = document.getElementById("saveMsg");
  msg.style.display = "block";
  setTimeout(()=>msg.style.display="none", 1800);
  renderAll();
});

document.getElementById("saveTeamBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDate").value;
  DAILY_TEAM[date] = {
    termineGebucht: Number(document.getElementById("inTermineGebucht").value)||0,
    termineShowup: Number(document.getElementById("inTermineShowup").value)||0,
    closes: currentClosesDraft.filter(v=>v>0)
  };
  await upsertDailyTeam(date);
  buildWeeklyAggregates();
  const msg = document.getElementById("saveTeamMsg");
  msg.style.display = "block";
  setTimeout(()=>msg.style.display="none", 1800);
  renderAll();
});

document.getElementById("saveHebelBtn").addEventListener("click", async ()=>{
  const date = document.getElementById("entryDateHebel").value;
  const person = document.getElementById("personSelectHebel").value;
  const existingLeadGen = (DAILY_PERSONAL[date] && DAILY_PERSONAL[date][person] && DAILY_PERSONAL[date][person].leadGenHours) || 0;
  const newHebel = {};
  LEVERS.forEach(([key])=>{
    newHebel[key] = Number(document.getElementById(HEBEL_INPUT_IDS[key]).value)||0;
  });
  if(!DAILY_PERSONAL[date]) DAILY_PERSONAL[date] = {};
  DAILY_PERSONAL[date][person] = { leadGenHours: existingLeadGen, hebel: newHebel };
  await upsertDailyPersonal(date, person);
  buildWeeklyAggregates();
  const msg = document.getElementById("saveHebelMsg");
  msg.style.display = "block";
  setTimeout(()=>msg.style.display="none", 1800);
  renderAll();
});

/* ---------- Wochenfokus-Modal ---------- */
function openGoalModal(){
  const weekStart = WEEKS[entryWeekIdx()][0];
  const goal = GOALS.find(g=>g.week_start===weekStart);
  document.getElementById("inGoalText").value = goal ? goal.goal : "";
  document.getElementById("goalModal").classList.add("open");
  setTimeout(()=>document.getElementById("inGoalText").focus(), 0);
}
function closeGoalModal(){ document.getElementById("goalModal").classList.remove("open"); }

document.getElementById("editGoalBtn").addEventListener("click", openGoalModal);
document.getElementById("goalModalClose").addEventListener("click", closeGoalModal);
document.getElementById("goalModal").addEventListener("click", (ev)=>{ if(ev.target.id==="goalModal") closeGoalModal(); });

document.getElementById("goalModalSave").addEventListener("click", async ()=>{
  const goal = document.getElementById("inGoalText").value.trim();
  const weekStart = WEEKS[entryWeekIdx()][0];
  const { data, error } = await db.from("weekly_goals").upsert({ week_start: weekStart, goal }, { onConflict: "week_start" }).select();
  if(error){ console.error(error); alert("Wochenfokus konnte nicht gespeichert werden: "+error.message); return; }
  const idx = GOALS.findIndex(g=>g.week_start===weekStart);
  if(idx>=0) GOALS[idx] = data[0]; else GOALS.push(data[0]);
  closeGoalModal();
  renderGoal();
});

/* ---------- Projekte: Modals & Aktionen ---------- */
let editingProjectId = null; // null = Anlegen, sonst Bearbeiten
let stepForProjectId = null;

function openProjectModal(id){
  editingProjectId = id ?? null;
  const p = id != null ? PROJECTS.find(x=>String(x.id)===String(id)) : null;
  document.getElementById("projectModalTitle").textContent = p ? "Projekt bearbeiten" : "Neues Projekt";
  document.getElementById("inProjectTitle").value = p ? p.title : "";
  document.getElementById("inProjectDesc").value = p && p.description ? p.description : "";
  document.getElementById("inProjectOwner").value = p ? p.owner : "beide";
  document.getElementById("inProjectStatus").value = p ? p.status : "aktiv";
  document.getElementById("inProjectDue").value = p && p.due_date ? p.due_date : "";
  document.getElementById("projectDeleteBtn").style.display = p ? "inline-flex" : "none";
  document.getElementById("projectModal").classList.add("open");
  setTimeout(()=>document.getElementById("inProjectTitle").focus(), 0);
}
function closeProjectModal(){ document.getElementById("projectModal").classList.remove("open"); }

document.getElementById("openAddProjectBtn").addEventListener("click", ()=>openProjectModal(null));
document.getElementById("projectModalClose").addEventListener("click", closeProjectModal);
document.getElementById("projectModal").addEventListener("click", (ev)=>{ if(ev.target.id==="projectModal") closeProjectModal(); });
document.getElementById("showDoneProjects").addEventListener("change", renderProjects);

document.getElementById("projectSaveBtn").addEventListener("click", async ()=>{
  const title = document.getElementById("inProjectTitle").value.trim();
  if(!title){ alert("Bitte einen Projektnamen eingeben."); return; }
  const payload = {
    title,
    description: document.getElementById("inProjectDesc").value.trim() || null,
    owner: document.getElementById("inProjectOwner").value,
    status: document.getElementById("inProjectStatus").value,
    due_date: document.getElementById("inProjectDue").value || null
  };
  if(editingProjectId != null){
    const { data, error } = await db.from("projects").update(payload).eq("id", editingProjectId).select();
    if(error){ console.error(error); alert("Projekt konnte nicht gespeichert werden: "+error.message); return; }
    const idx = PROJECTS.findIndex(p=>String(p.id)===String(editingProjectId));
    if(idx>=0) PROJECTS[idx] = data[0];
  } else {
    const { data, error } = await db.from("projects").insert(payload).select();
    if(error){ console.error(error); alert("Projekt konnte nicht angelegt werden: "+error.message); return; }
    PROJECTS.push(data[0]);
  }
  closeProjectModal();
  renderProjects();
});

document.getElementById("projectDeleteBtn").addEventListener("click", async ()=>{
  if(editingProjectId == null) return;
  const p = PROJECTS.find(x=>String(x.id)===String(editingProjectId));
  const n = stepsOf(editingProjectId).length;
  if(!confirm(`Projekt "${p?p.title:""}" wirklich löschen?${n?`\n\nDie ${n} zugehörigen Schritte werden mitgelöscht.`:""}`)) return;
  const { error } = await db.from("projects").delete().eq("id", editingProjectId);
  if(error){ console.error(error); alert("Projekt konnte nicht gelöscht werden: "+error.message); return; }
  PROJECTS = PROJECTS.filter(x=>String(x.id)!==String(editingProjectId));
  PROJECT_STEPS = PROJECT_STEPS.filter(s=>String(s.project_id)!==String(editingProjectId));
  closeProjectModal();
  renderProjects();
});

function openStepModal(projectId){
  stepForProjectId = projectId;
  document.getElementById("inStepText").value = "";
  document.getElementById("inStepAssignee").value = "tim";
  document.getElementById("stepModal").classList.add("open");
  setTimeout(()=>document.getElementById("inStepText").focus(), 0);
}
function closeStepModal(){ document.getElementById("stepModal").classList.remove("open"); }

document.getElementById("stepModalClose").addEventListener("click", closeStepModal);
document.getElementById("stepModal").addEventListener("click", (ev)=>{ if(ev.target.id==="stepModal") closeStepModal(); });
document.getElementById("inStepText").addEventListener("keydown", (ev)=>{ if(ev.key==="Enter") document.getElementById("stepSaveBtn").click(); });

document.getElementById("stepSaveBtn").addEventListener("click", async ()=>{
  const text = document.getElementById("inStepText").value.trim();
  if(!text){ alert("Bitte einen Schritt eingeben."); return; }
  const { data, error } = await db.from("project_steps").insert({
    project_id: stepForProjectId,
    text,
    assignee: document.getElementById("inStepAssignee").value,
    done: false
  }).select();
  if(error){ console.error(error); alert("Schritt konnte nicht gespeichert werden: "+error.message); return; }
  PROJECT_STEPS.push(data[0]);
  closeStepModal();
  renderProjects();
});

document.getElementById("projectsList").addEventListener("click", async (ev)=>{
  const el = ev.target.closest("[data-pact]");
  if(!el) return;
  const act = el.dataset.pact, id = el.dataset.id;

  if(act === "proj-edit"){ openProjectModal(id); return; }
  if(act === "step-add"){ openStepModal(id); return; }

  const s = PROJECT_STEPS.find(x=>String(x.id)===String(id));
  if(!s) return;

  if(act === "step-toggle"){
    const done = el.checked;
    const { error } = await db.from("project_steps").update({ done }).eq("id", s.id);
    if(error){ console.error(error); alert("Konnte nicht gespeichert werden: "+error.message); el.checked = !done; return; }
    s.done = done;
    renderProjects();
  } else if(act === "step-del"){
    if(!confirm("Schritt \""+s.text+"\" löschen?")) return;
    const { error } = await db.from("project_steps").delete().eq("id", s.id);
    if(error){ console.error(error); alert("Konnte nicht gelöscht werden: "+error.message); return; }
    PROJECT_STEPS = PROJECT_STEPS.filter(x=>String(x.id)!==String(id));
    renderProjects();
  }
});

/* ---------- Commitments ---------- */
function openAddCommitmentModal(){
  document.getElementById("inCommitmentText").value = "";
  document.getElementById("inCommitmentAssignee").value = "tim";
  document.getElementById("addCommitmentModal").classList.add("open");
  setTimeout(()=>document.getElementById("inCommitmentText").focus(), 0);
}
function closeAddCommitmentModal(){ document.getElementById("addCommitmentModal").classList.remove("open"); }

document.getElementById("openAddCommitmentBtn").addEventListener("click", openAddCommitmentModal);
document.getElementById("addCommitmentModalClose").addEventListener("click", closeAddCommitmentModal);
document.getElementById("addCommitmentModal").addEventListener("click", (ev)=>{ if(ev.target.id==="addCommitmentModal") closeAddCommitmentModal(); });
document.getElementById("inCommitmentText").addEventListener("keydown", (ev)=>{ if(ev.key==="Enter") document.getElementById("addCommitmentBtn").click(); });

document.getElementById("addCommitmentBtn").addEventListener("click", async ()=>{
  const text = document.getElementById("inCommitmentText").value.trim();
  if(!text){ alert("Bitte ein Commitment eingeben."); return; }
  const assignee = document.getElementById("inCommitmentAssignee").value;
  const { data, error } = await db.from("weekly_commitments").insert({
    week_start: WEEKS[entryWeekIdx()][0], text, assignee, done: false
  }).select();
  if(error){ console.error(error); alert("Commitment konnte nicht gespeichert werden: "+error.message); return; }
  COMMITMENTS.push(data[0]);
  closeAddCommitmentModal();
  renderCommitments();
});

document.getElementById("commitmentsList").addEventListener("click", async (ev)=>{
  const el = ev.target.closest("[data-act]");
  if(!el) return;
  const id = el.dataset.id;
  const c = COMMITMENTS.find(x=>String(x.id)===String(id));
  if(!c) return;

  if(el.dataset.act === "toggle"){
    const done = el.checked;
    const { error } = await db.from("weekly_commitments").update({ done }).eq("id", c.id);
    if(error){ console.error(error); alert("Konnte nicht gespeichert werden: "+error.message); el.checked = !done; return; }
    c.done = done;
    renderCommitments();
  } else if(el.dataset.act === "del"){
    if(!confirm("Commitment \""+c.text+"\" löschen?")) return;
    const { error } = await db.from("weekly_commitments").delete().eq("id", c.id);
    if(error){ console.error(error); alert("Konnte nicht gelöscht werden: "+error.message); return; }
    COMMITMENTS = COMMITMENTS.filter(x=>String(x.id)!==String(id));
    renderCommitments();
  }
});

/* ---------- Neue-Aufgabe-Modal ---------- */
function openAddTaskModal(){
  document.getElementById("inTaskText").value = "";
  document.getElementById("inTaskAssignee").value = "tim";
  document.getElementById("inTaskPriority").value = "mittel";
  document.getElementById("addTaskModal").classList.add("open");
  setTimeout(()=>document.getElementById("inTaskText").focus(), 0);
}
function closeAddTaskModal(){ document.getElementById("addTaskModal").classList.remove("open"); }

document.getElementById("openAddTaskBtn").addEventListener("click", openAddTaskModal);
document.getElementById("addTaskModalClose").addEventListener("click", closeAddTaskModal);
document.getElementById("addTaskModal").addEventListener("click", (ev)=>{ if(ev.target.id==="addTaskModal") closeAddTaskModal(); });

document.getElementById("addTaskBtn").addEventListener("click", async ()=>{
  const textEl = document.getElementById("inTaskText");
  const text = textEl.value.trim();
  if(!text){ alert("Bitte eine Aufgabe eingeben."); return; }
  const assignee = document.getElementById("inTaskAssignee").value;
  const priority = document.getElementById("inTaskPriority").value;
  const { data, error } = await db.from("tasks").insert({
    week_start: WEEKS[boardWeekIdx][0], text, assignee, priority, done: false
  }).select();
  if(error){ console.error(error); alert("Aufgabe konnte nicht gespeichert werden: "+error.message); return; }
  TASKS.push(data[0]);
  closeAddTaskModal();
  renderTasks();
});

/* ---------- Board: Wochen-Navigation ---------- */
document.getElementById("taskPrevWeek").addEventListener("click", ()=>{
  if(boardWeekIdx > 0){ boardWeekIdx--; renderTasks(); }
});
document.getElementById("taskNextWeek").addEventListener("click", ()=>{
  if(boardWeekIdx < N_WEEKS - 1){ boardWeekIdx++; renderTasks(); }
});

/* ---------- Zeittracking: Wochen-Navigation ---------- */
document.getElementById("ztPrevWeek").addEventListener("click", ()=>{
  if(ztWeekIdx > 0){ ztWeekIdx--; renderZeittracking(); }
});
document.getElementById("ztNextWeek").addEventListener("click", ()=>{
  if(ztWeekIdx < N_WEEKS - 1){ ztWeekIdx++; renderZeittracking(); }
});

/* ---------- Board: Karte anklicken -> Modal ---------- */
let modalTaskId = null;
function openTaskModal(id){
  const t = TASKS.find(x=>String(x.id)===String(id));
  if(!t) return;
  modalTaskId = t.id;
  document.getElementById("modalTaskText").value = t.text;
  document.getElementById("modalStatus").value = normStatus(t);
  document.getElementById("modalAssignee").value = t.assignee;
  document.getElementById("modalPriority").value = t.priority;
  // "Nächste Woche" nur anbieten, wenn es eine nächste Woche gibt
  document.getElementById("modalPushWeek").style.display = (boardWeekIdx < N_WEEKS - 1) ? "inline-flex" : "none";
  document.getElementById("taskModal").classList.add("open");
}
function closeTaskModal(){
  document.getElementById("taskModal").classList.remove("open");
  modalTaskId = null;
}

document.getElementById("kanbanBoard").addEventListener("click", (ev)=>{
  const card = ev.target.closest(".kanban-card");
  if(card) openTaskModal(card.dataset.id);
});

document.getElementById("modalClose").addEventListener("click", closeTaskModal);
document.getElementById("taskModal").addEventListener("click", (ev)=>{
  if(ev.target.id === "taskModal") closeTaskModal();
});
document.addEventListener("keydown", (ev)=>{
  if(ev.key !== "Escape") return;
  ["taskModal","goalModal","addTaskModal"].forEach(id=>document.getElementById(id).classList.remove("open"));
  modalTaskId = null;
});

document.getElementById("modalSave").addEventListener("click", async ()=>{
  if(modalTaskId == null) return;
  const t = TASKS.find(x=>String(x.id)===String(modalTaskId));
  if(!t) return;
  const text = document.getElementById("modalTaskText").value.trim();
  if(!text){ alert("Der Aufgabentext darf nicht leer sein."); return; }
  const status = document.getElementById("modalStatus").value;
  const assignee = document.getElementById("modalAssignee").value;
  const priority = document.getElementById("modalPriority").value;
  const done = status === "done";
  const { error } = await db.from("tasks").update({ text, status, assignee, priority, done }).eq("id", t.id);
  if(error){ console.error(error); alert("Speichern fehlgeschlagen: "+error.message); return; }
  Object.assign(t, { text, status, assignee, priority, done });
  closeTaskModal();
  renderTasks();
});

document.getElementById("modalPushWeek").addEventListener("click", async ()=>{
  if(modalTaskId == null || boardWeekIdx >= N_WEEKS - 1) return;
  const t = TASKS.find(x=>String(x.id)===String(modalTaskId));
  if(!t) return;
  const nextWeekStart = WEEKS[boardWeekIdx + 1][0];
  const { error } = await db.from("tasks").update({ week_start: nextWeekStart }).eq("id", t.id);
  if(error){ console.error(error); alert("Verschieben fehlgeschlagen: "+error.message); return; }
  t.week_start = nextWeekStart;
  closeTaskModal();
  renderTasks();
});

document.getElementById("modalDelete").addEventListener("click", async ()=>{
  if(modalTaskId == null) return;
  if(!confirm("Aufgabe wirklich löschen?")) return;
  const id = modalTaskId;
  const { error } = await db.from("tasks").delete().eq("id", id);
  if(error){ console.error(error); alert("Löschen fehlgeschlagen: "+error.message); return; }
  TASKS = TASKS.filter(t=>String(t.id)!==String(id));
  closeTaskModal();
  renderTasks();
});

/* ---------- Init ---------- */
async function init(){
  // supabase-js kommt per CDN. Fällt das aus, wäre die Seite sonst kommentarlos leer.
  if(!window.supabase){
    showErrorBanner("Die Verbindung zu Supabase konnte nicht geladen werden (CDN nicht erreichbar). Bitte Internetverbindung prüfen und neu laden.");
    return;
  }
  await ensureAuthorized();
  populateEntryControls();
  boardWeekIdx = findCurrentWeekIndex();
  await fetchAllData();
  loadDayIntoForm();
  loadDayIntoHebelForm();
  renderAll();
}
init();
