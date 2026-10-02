/* Alle Supabase-Zugriffe auf Tabellenebene.
   Laedt in den state und schreibt aus dem state zurueck. */

import { db } from "./supabase.js";
import { state, buildWeeklyAggregates } from "./state.js";
import { showErrorBanner } from "./ui/bus.js";

/* Supabase liefert je Abfrage hoechstens 1000 Zeilen — ohne Fehlermeldung,
   der Rest fehlt einfach. time_entries hat die Grenze am 01.10.2026
   ueberschritten: Ab da kamen die neuesten Eintraege nicht mehr an, und "Zeit
   heute", Lead-Gen- und Hebel-Stunden blieben stehen, obwohl der Tracker
   schrieb. Grosse Tabellen deshalb seitenweise laden, sortiert, damit keine
   Zeile zwischen zwei Seiten verrutscht. */
const SEITE = 1000;
async function alleZeilen(tabelle, sortierung){
  let alle = [];
  const spalten = [].concat(sortierung);
  for(let von = 0; ; von += SEITE){
    let abfrage = db.from(tabelle).select("*");
    spalten.forEach(s=>{ abfrage = abfrage.order(s, { ascending: true }); });
    const { data, error } = await abfrage.range(von, von + SEITE - 1);
    if(error) return { data: null, error };
    alle = alle.concat(data);
    if(data.length < SEITE) return { data: alle, error: null };
  }
}

export async function fetchAllData(){
  const [personalRes, teamRes, timeRes, tasksRes, goalsRes, commitRes, projRes, stepRes,
         custRes, revMonRes, revRes, callsRes, setRes, leistRes, meetRes,
         monthRes, salesRes, anrufRes, vorgabeRes, syncRes, leadRes, instRes,
         ticketRes, sprintRes, ausgabenRes] = await Promise.all([
    db.from("daily_personal").select("*"),
    db.from("daily_team").select("*"),
    alleZeilen("time_entries", "id"),
    db.from("tasks").select("*").order("created_at", { ascending: true }),
    db.from("weekly_goals").select("*"),
    db.from("weekly_commitments").select("*").order("created_at", { ascending: true }),
    db.from("projects").select("*").order("created_at", { ascending: true }),
    db.from("project_steps").select("*").order("created_at", { ascending: true }),
    db.from("customers").select("*").order("sort_order", { ascending: true }),
    db.from("revenue_months").select("*"),
    db.from("revenues").select("*").order("period_start", { ascending: false }),
    db.from("daily_calls").select("*").order("date", { ascending: true }),
    db.from("settings").select("*"),
    db.from("tracker_options").select("name").eq("kind","leistung").eq("active", true).order("sort_order", { ascending: true }),
    db.from("daily_meetings").select("*"),
    db.from("monthly_goals").select("*"),
    db.from("sales_meetings").select("*"),
    alleZeilen("sales_calls", "id"),
    db.from("daily_call_targets").select("*"),
    db.from("sync_status").select("*"),
    db.from("sales_leads").select("*"),
    alleZeilen("instantly_daily", ["date", "campaign_id"]),
    db.from("tickets").select("*").order("id", { ascending: true }),
    db.from("sprints").select("*").order("nummer", { ascending: true }),
    alleZeilen("expenses", "id")
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
  // Die Tabelle gibt es erst nach sql/009. Fehlt sie, bleibt das Monatsprojekt
  // leer — das Dashboard soll deswegen nicht stehen bleiben.
  if(monthRes.error){ state.monthGoals = []; }
  else{ state.monthGoals = monthRes.data; }
  if(commitRes.error){ console.error(commitRes.error); state.commitments = []; }
  else{ state.commitments = commitRes.data; }
  // Kunden und Umsaetze gibt es erst, nachdem sql/001 gelaufen ist. Bis dahin
  // meldet Supabase einen Fehler — das Dashboard soll deswegen nicht stehen
  // bleiben. Der Grund wird aber gemerkt: "noch keine Kunden angelegt" und
  // "Tabelle fehlt oder Passwort falsch" saehen sonst identisch aus.
  const kundenFehler = custRes.error || revMonRes.error || revRes.error;
  state.ladeFehler = kundenFehler ? kundenFehler.message : null;
  if(custRes.error){ console.error(custRes.error); state.customers = []; }
  else{ state.customers = custRes.data; }
  if(revMonRes.error){ console.error(revMonRes.error); state.revenueMonths = []; }
  else{ state.revenueMonths = revMonRes.data; }
  if(revRes.error){ console.error(revRes.error); state.revenues = []; }
  else{ state.revenues = revRes.data; }
  // Calls und Einstellungen gibt es erst nach sql/004. Bis dahin bleibt der
  // Reiter leer, statt das ganze Dashboard aufzuhalten.
  if(callsRes.error){ console.error(callsRes.error); state.calls = []; }
  else{ state.calls = callsRes.data; }
  // Leistungsarten gibt es erst nach sql/006 — bis dahin die feste Liste.
  const LEISTUNGEN_FALLBACK = ["Webseite","Google Ads","GEO-Optimierung","Google Ads + GEO","Beratung","Sonstiges"];
  if(leistRes.error || !leistRes.data || !leistRes.data.length){
    if(leistRes.error) console.error(leistRes.error);
    state.leistungen = LEISTUNGEN_FALLBACK;
  } else {
    state.leistungen = leistRes.data.map(r=>r.name);
  }
  // Termine aus Close gibt es erst nach sql/008.
  if(meetRes.error){ console.error(meetRes.error); state.meetings = []; }
  else{ state.meetings = meetRes.data; }
  // Termine aus dem Close-Kalender gibt es erst nach sql/010 und dem ersten
  // Abgleich auf Railway. Bis dahin zaehlt das Dashboard wie vorher — eine
  // leere Tabelle hiesse sonst "0 Termine", obwohl nur der Abgleich fehlt.
  state.salesTabelleDa = !salesRes.error;
  state.salesMeetings = salesRes.error ? [] : salesRes.data;
  state.salesMeetingsOk = state.salesMeetings.some(t=>t.source === "close");
  // Anrufe aus Close, Tagesvorgabe und Zustand der Abgleiche gibt es erst nach
  // sql/011. Bis dahin rechnet der Calls-Teil wie vorher aus daily_calls.
  state.salesCalls = anrufRes.error ? [] : anrufRes.data;
  state.salesCallsOk = state.salesCalls.length > 0;
  state.callTargets = {};
  if(!vorgabeRes.error) vorgabeRes.data.forEach(r=>{ state.callTargets[r.date] = r; });
  state.syncStatus = {};
  if(!syncRes.error) syncRes.data.forEach(r=>{ state.syncStatus[r.key] = r; });
  // Kanal je Lead (sql/012). Bis dahin bleibt die Karte "Woher kommen Termine
  // und Auftraege?" mit einem Hinweis stehen.
  state.salesLeads = {};
  if(!leadRes.error) leadRes.data.forEach(r=>{ state.salesLeads[r.lead_id] = r; });
  state.salesLeadsOk = !leadRes.error && leadRes.data.length > 0;
  state.salesLeadsTabelleDa = !leadRes.error;
  // Cold Emails je Kampagne und Tag aus Instantly (sql/013)
  state.instantlyDaily = instRes.error ? [] : instRes.data;
  // Tickets und Sprints gibt es erst nach sql/014_tickets. Bis dahin erklaert
  // der Reiter, was fehlt — "keine Tickets" saehe sonst aus wie ein leeres Board.
  state.ticketTabelleDa = !ticketRes.error && !sprintRes.error;
  state.tickets = ticketRes.error ? [] : ticketRes.data;
  state.sprints = sprintRes.error ? [] : sprintRes.data;
  // Finanzen (sql/014_finanzen): Ausgaben aus den Rechnungs-Mails
  state.finanzenTabelleDa = !ausgabenRes.error;
  state.expenses = ausgabenRes.error ? [] : ausgabenRes.data;
  if(setRes.error){ console.error(setRes.error); state.settings = {}; }
  else{
    state.settings = {};
    (setRes.data || []).forEach(r=>{ state.settings[r.key] = Number(r.value); });
  }

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

/* ---------- Kunden ---------- */

export async function kundeSpeichern(werte, id){
  const nutzlast = {
    name: werte.name,
    kind: werte.kind,
    status: werte.status,
    note: werte.note || null,
    updated_at: new Date().toISOString()
  };
  // "active" steuert die Sichtbarkeit im Tracker-Popup und wird ueber das
  // eigene Feld gesetzt. Frueher wurde es bei JEDEM Speichern aus dem Status
  // abgeleitet — dadurch tauchte eine Karteileiche, die man nur kurz auf
  // "intern" stellen wollte, ploetzlich in Simons Popup auf.
  nutzlast.active = werte.active !== undefined
    ? !!werte.active && werte.status !== "beendet"
    : werte.status !== "beendet";

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
    service: werte.service || null,
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
    // Fehlt die Spalte, ist sql/006 in Supabase noch nicht gelaufen. Supabase
    // meldet das als "schema cache" — damit weiss niemand, was zu tun ist.
    if(/service/.test(antwort.error.message || "")){
      throw new Error("Die Leistungsart fehlt noch in der Datenbank. Dafür einmal sql/006_leistung_und_budget.sql im Supabase-SQL-Editor ausführen.");
    }
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


/* ---------- Stunden nachtragen ----------
   Wenn ein Popup verpasst wurde oder Arbeit vor der Kundenbeziehung
   stattgefunden hat. Geschrieben wird derselbe Satzbau wie beim Tracker,
   damit die Auswertung nicht zwei Faelle unterscheiden muss. */
export async function stundenNachtragen({ person, datum, stunden, kundenName, notiz }){
  const minuten = Math.round(Number(stunden) * 60);
  if(!(minuten > 0)) throw new Error("Bitte eine Stundenzahl über 0 eintragen.");

  const { data, error } = await db.from("time_entries").insert({
    person,
    // Mittags, damit der Eintrag unabhaengig von der Zeitzone auf dem
    // gewaehlten Tag landet.
    ts: new Date(datum + "T12:00:00").toISOString(),
    duration_minutes: minuten,
    state: "Nachgetragen",
    zuordnung: kundenName,
    aktivitaet: notiz || null
  }).select();
  if(error){
    console.error(error);
    throw new Error("Stunden konnten nicht gespeichert werden: " + error.message);
  }
  if(!data || !data.length){
    throw new Error("Die Stunden wurden von der Datenbank nicht übernommen — bitte die Seite neu laden.");
  }
  return data[0];
}


/* ---------- Calls ---------- */

export async function callsSpeichern(datum, person, anzahl, target){
  const nutzlast = {
    date: datum, person, calls: Number(anzahl) || 0,
    source: "dashboard", updated_at: new Date().toISOString()
  };
  // Die Vorgabe nur setzen, wenn sie noch fehlt — was an einem vergangenen
  // Tag in der Inbox stand, laesst sich nachtraeglich nicht rekonstruieren
  // und darf nicht durch einen heutigen Wert ersetzt werden.
  if(target != null) nutzlast.target = Number(target);

  const { data, error } = await db.from("daily_calls")
    .upsert(nutzlast, { onConflict: "date,person" }).select();
  if(error){
    console.error(error);
    throw new Error("Calls konnten nicht gespeichert werden: " + error.message);
  }
  if(!data || !data.length) throw new Error("Die Datenbank hat den Eintrag nicht übernommen — bitte die Seite neu laden.");
  return data[0];
}

export async function einstellungSpeichern(key, wert){
  const { data, error } = await db.from("settings")
    .upsert({ key, value: Number(wert), updated_at: new Date().toISOString() },
            { onConflict: "key" }).select();
  if(error){
    console.error(error);
    throw new Error("Einstellung konnte nicht gespeichert werden: " + error.message);
  }
  if(!data || !data.length) throw new Error("Die Datenbank hat die Änderung nicht übernommen — bitte die Seite neu laden.");
  return data[0];
}


/* ---------- Tickets und Sprints (sql/014_tickets) ----------
   Dieselben Zeilen liest und schreibt Claude ueber tools/tickets/ im
   jeweiligen Repo — Feldnamen deshalb nur zusammen mit dem Tool aendern. */

function sqlFehlt(error){
  // Fehlt die Tabelle, meldet Supabase "schema cache" — damit weiss niemand,
  // was zu tun ist.
  return /schema cache|does not exist/i.test(error.message || "");
}

export async function ticketSpeichern(nutzlast, id){
  const zeile = { ...nutzlast, updated_at: new Date().toISOString() };
  const antwort = id
    ? await db.from("tickets").update(zeile).eq("id", id).select()
    : await db.from("tickets").insert(zeile).select();
  if(antwort.error){
    console.error(antwort.error);
    if(sqlFehlt(antwort.error)){
      throw new Error("Die Tickets fehlen noch in der Datenbank. Dafür einmal sql/014_tickets.sql im Supabase-SQL-Editor ausführen.");
    }
    // Der Schluessel ist eindeutig. Passiert, wenn jemand anderes (oder
    // Claude) gerade ein Ticket angelegt hat, das hier noch nicht geladen war.
    if(String(antwort.error.code) === "23505"){
      throw new Error("Diese Ticket-Nummer ist inzwischen vergeben. Bitte die Seite neu laden und erneut anlegen.");
    }
    throw new Error("Ticket konnte nicht gespeichert werden: " + antwort.error.message);
  }
  if(!antwort.data || !antwort.data.length) throw new Error("Die Datenbank hat das Ticket nicht übernommen — bitte die Seite neu laden.");
  return antwort.data[0];
}

export async function ticketLoeschen(id){
  const { error } = await db.from("tickets").delete().eq("id", id);
  if(error){
    console.error(error);
    throw new Error("Ticket konnte nicht gelöscht werden: " + error.message);
  }
}

export async function sprintSpeichern(nutzlast){
  const { data, error } = await db.from("sprints")
    .upsert({ ...nutzlast, updated_at: new Date().toISOString() }, { onConflict: "board,nummer" })
    .select();
  if(error){
    console.error(error);
    if(sqlFehlt(error)){
      throw new Error("Die Sprints fehlen noch in der Datenbank. Dafür einmal sql/014_tickets.sql im Supabase-SQL-Editor ausführen.");
    }
    throw new Error("Sprint konnte nicht gespeichert werden: " + error.message);
  }
  if(!data || !data.length) throw new Error("Die Datenbank hat den Sprint nicht übernommen — bitte die Seite neu laden.");
  return data[0];
}

/* ---------- Finanzen ---------- */

/* Eine Ausgabe korrigieren oder von Hand anlegen. Korrigierte Zeilen fasst der
   Rechnungsabgleich nie wieder an (korrigiert = true). */
export async function ausgabeSpeichern(werte, id){
  const nutzlast = { ...werte, korrigiert: true, updated_at: new Date().toISOString() };
  const zeile = id ? { ...nutzlast, id }
    : { ...nutzlast, id: "hand_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)), source: "hand" };
  const abfrage = id
    ? db.from("expenses").update(nutzlast).eq("id", id)
    : db.from("expenses").insert(zeile);
  const { error } = await abfrage;
  if(error){ console.error(error); throw new Error("Ausgabe konnte nicht gespeichert werden: " + error.message); }
  return zeile;
}
