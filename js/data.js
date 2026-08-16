/* Alle Supabase-Zugriffe auf Tabellenebene.
   Laedt in den state und schreibt aus dem state zurueck. */

import { db } from "./supabase.js";
import { state, buildWeeklyAggregates } from "./state.js";
import { showErrorBanner } from "./ui/bus.js";

export async function fetchAllData(){
  const [personalRes, teamRes, timeRes, tasksRes, goalsRes, commitRes, projRes, stepRes,
         custRes, revRes] = await Promise.all([
    db.from("daily_personal").select("*"),
    db.from("daily_team").select("*"),
    db.from("time_entries").select("*"),
    db.from("tasks").select("*").order("created_at", { ascending: true }),
    db.from("weekly_goals").select("*"),
    db.from("weekly_commitments").select("*").order("created_at", { ascending: true }),
    db.from("projects").select("*").order("created_at", { ascending: true }),
    db.from("project_steps").select("*").order("created_at", { ascending: true }),
    db.from("customers").select("*").order("sort_order", { ascending: true }),
    db.from("revenue_months").select("*")
  ]);
  if(projRes.error){ console.error(projRes.error); state.projects = []; }
  else{ state.projects = projRes.data; }
  if(stepRes.error){ console.error(stepRes.error); state.projectSteps = []; }
  else{ state.projectSteps = stepRes.data; }
  if(timeRes.error){ console.error(timeRes.error); state.timeEntries = []; }
  else{ state.timeEntries = timeRes.data; }
  if(tasksRes.error){ console.error(tasksRes.error); state.tasks = []; }
  else{ state.tasks = tasksRes.data; }
  if(goalsRes.error){ console.error(goalsRes.error); state.goals = []; }
  else{ state.goals = goalsRes.data; }
  if(commitRes.error){ console.error(commitRes.error); state.commitments = []; }
  else{ state.commitments = commitRes.data; }
  // Kunden und Umsaetze gibt es erst, nachdem sql/001 gelaufen ist. Bis dahin
  // meldet Supabase einen Fehler — das Dashboard soll deswegen nicht stehen
  // bleiben, sondern den Kunden-Reiter einfach leer zeigen.
  if(custRes.error){ console.error(custRes.error); state.customers = []; }
  else{ state.customers = custRes.data; }
  if(revRes.error){ console.error(revRes.error); state.revenueMonths = []; }
  else{ state.revenueMonths = revRes.data; }

  const dp = {};
  if(personalRes.error){ console.error(personalRes.error); showErrorBanner("Daten konnten nicht geladen werden: "+personalRes.error.message); }
  else{
    personalRes.data.forEach(row=>{
      if(!dp[row.date]) dp[row.date] = {};
      dp[row.date][row.person] = { leadGenHours: Number(row.lead_gen_hours)||0, hebel: row.hebel || {} };
    });
  }

  const dt = {};
  if(teamRes.error){ console.error(teamRes.error); showErrorBanner("Team-Daten konnten nicht geladen werden: "+teamRes.error.message); }
  else{
    teamRes.data.forEach(row=>{
      dt[row.date] = {
        termineGebucht: Number(row.termine_gebucht)||0,
        termineShowup: Number(row.termine_showup)||0,
        closes: Array.isArray(row.closes) ? row.closes.map(Number) : []
      };
    });
  }

  state.dailyPersonal = dp;
  state.dailyTeam = dt;
  buildWeeklyAggregates();
}

/* Wirft bei Fehlern. Vorher wurde nur ein alert() gezeigt und der Aufrufer
   machte weiter — der Nutzer sah danach "Gespeichert", obwohl nichts
   gespeichert war, und der Speicher behauptete einen Wert, den die Datenbank
   nicht hatte. */
export async function upsertDailyPersonal(date, person){
  const e = (state.dailyPersonal[date] && state.dailyPersonal[date][person]) || {leadGenHours:0, hebel:{}};
  const { error } = await db.from("daily_personal").upsert({
    date, person, lead_gen_hours: e.leadGenHours, hebel: e.hebel, updated_at: new Date().toISOString()
  });
  if(error){ console.error(error); throw new Error("Speichern fehlgeschlagen: "+error.message); }
}

export async function upsertDailyTeam(date){
  const e = state.dailyTeam[date] || {termineGebucht:0, termineShowup:0, closes:[]};
  const { error } = await db.from("daily_team").upsert({
    date,
    termine_gebucht: e.termineGebucht,
    termine_showup: e.termineShowup,
    closes: e.closes,
    updated_at: new Date().toISOString()
  });
  if(error){ console.error(error); throw new Error("Speichern fehlgeschlagen: "+error.message); }
}


/* ---------- Kunden ---------- */

export async function kundeSpeichern(werte, id){
  const nutzlast = {
    name: werte.name,
    kind: werte.kind,
    status: werte.status,
    note: werte.note || null,
    active: werte.status !== "beendet",
    updated_at: new Date().toISOString()
  };
  const antwort = id
    ? await db.from("customers").update(nutzlast).eq("id", id).select()
    : await db.from("customers").insert({ ...nutzlast, sort_order: 100 }).select();
  if(antwort.error){
    console.error(antwort.error);
    // Der Name ist eindeutig — das ist der haeufigste Fehlerfall.
    if(String(antwort.error.code) === "23505"){
      throw new Error("Es gibt schon einen Kunden mit diesem Namen.");
    }
    throw new Error("Kunde konnte nicht gespeichert werden: " + antwort.error.message);
  }
  return antwort.data[0];
}

export async function kundeLoeschen(id){
  const { error } = await db.from("customers").delete().eq("id", id);
  if(error){
    console.error(error);
    // on delete restrict: haengen noch Umsaetze dran, geht das Loeschen nicht.
    if(String(error.code) === "23503"){
      throw new Error("Der Kunde hat noch Umsatzeinträge. Erst die Umsätze löschen oder den Kunden auf „Beendet“ setzen.");
    }
    throw new Error("Kunde konnte nicht gelöscht werden: " + error.message);
  }
}

/* ---------- Umsaetze ---------- */

export async function umsatzSpeichern(werte, id){
  const nutzlast = {
    customer_id: werte.customer_id,
    kind: werte.kind,
    title: werte.title || null,
    amount: Number(werte.amount) || 0,
    period_start: werte.period_start,
    period_end: werte.period_end || null,
    note: werte.note || null,
    updated_at: new Date().toISOString()
  };
  const antwort = id
    ? await db.from("revenues").update(nutzlast).eq("id", id).select()
    : await db.from("revenues").insert(nutzlast).select();
  if(antwort.error){
    console.error(antwort.error);
    throw new Error("Umsatz konnte nicht gespeichert werden: " + antwort.error.message);
  }
  return antwort.data[0];
}

export async function umsatzLoeschen(id){
  const { error } = await db.from("revenues").delete().eq("id", id);
  if(error){
    console.error(error);
    throw new Error("Umsatz konnte nicht gelöscht werden: " + error.message);
  }
}
