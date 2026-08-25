/* Alle Supabase-Zugriffe auf Tabellenebene.
   Laedt in den state und schreibt aus dem state zurueck. */

import { db } from "./supabase.js";
import { state, buildWeeklyAggregates } from "./state.js";
import { showErrorBanner, renderAll } from "./ui/bus.js";
import { pruefeZeile } from "./ui/components.js";

export async function fetchAllData(){
  // ACHTUNG: Reihenfolge der Namen und der Abfragen muessen Zeile fuer Zeile
  // zusammenpassen. Verrutscht hier etwas, landen z.B. Umsaetze in der
  // Kundenliste — und zwar ohne jede Fehlermeldung.
  const [personalRes, teamRes, timeRes, tasksRes, goalsRes, commitRes, projRes,
         custRes, revMonRes, revRes] = await Promise.all([
    db.from("daily_personal").select("*"),
    db.from("daily_team").select("*"),
    db.from("time_entries").select("*"),
    db.from("tasks").select("*").order("created_at", { ascending: true }),
    db.from("weekly_goals").select("*"),
    db.from("weekly_commitments").select("*").order("created_at", { ascending: true }),
    db.from("projects").select("*").order("created_at", { ascending: true }),
    db.from("customers").select("*").order("sort_order", { ascending: true }),
    db.from("revenue_months").select("*"),
    db.from("revenues").select("*").order("period_start", { ascending: false })
  ]);
  if(projRes.error){ console.error(projRes.error); state.projects = []; }
  else{ state.projects = projRes.data; }
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

/* Alles neu laden und neu zeichnen.

   Lag vorher gleich zweimal identisch in den Ansichten. Scheitert das Laden,
   ist der Speicherstand womoeglich aelter als die Datenbank — deshalb eine
   sichtbare Meldung statt eines stillen Weitermachens. */
export async function neuLaden(){
  try{
    await fetchAllData();
  }catch(e){
    showErrorBanner("Gespeichert, aber die Ansicht konnte nicht aktualisiert werden: " +
                    ((e && e.message) || e) + " — bitte die Seite neu laden.");
  }
  renderAll();
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

/* ---------- Aufgaben ----------
   Bis zum Board-Umbau schrieb views/aufgaben.js als einzige Ansicht direkt
   auf db. Jetzt gibt es zwei Boards und die Dashboard-Karte, die dieselbe
   Aufgabe speichern — die Ableitungsregeln stehen deshalb hier, an einer
   einzigen Stelle. */

/* Die Board-Navigation benutzt "allgemein" und "ohne" als Platzhalter fuer
   "kein Projekt" bzw. "kein Kunde". Diese Strings duerfen NIE in die
   Datenbank — dort ist die Abwesenheit einer Zuordnung schlicht null. */
function idOderNull(wert){
  if(wert == null) return null;
  const s = String(wert);
  return (s === "" || s === "allgemein" || s === "ohne") ? null : wert;
}

export async function aufgabeSpeichern(werte, id){
  const projektId = idOderNull(werte.project_id);
  const projekt = projektId != null
    ? state.projects.find(p => String(p.id) === String(projektId))
    : null;

  const nutzlast = {
    text:        werte.text,
    description: werte.description || null,
    assignee:    werte.assignee || null,
    priority:    werte.priority || "mittel",
    due_date:    werte.due_date || null,
    status:      werte.status || "backlog"
  };
  // done ist das Altfeld aus der Zeit vor den Spalten. Es wird weiter
  // mitgefuehrt, damit Aufgaben aus dieser Zeit vergleichbar bleiben.
  nutzlast.done = nutzlast.status === "done";

  // Die Zuordnung nur anfassen, wenn der Aufrufer sie mitschickt — sonst
  // wuerde das Speichern aus einem Board heraus die Zuordnung leeren.
  if("project_id" in werte || "customer_id" in werte){
    nutzlast.project_id = projektId;
    // Das Projekt gewinnt: es kennt seinen Kunden verlaesslich, die Auswahl
    // im Dialog kann veraltet sein. Ohne Projekt zaehlt die eigene Wahl.
    nutzlast.customer_id = projekt
      ? (projekt.customer_id || null)
      : idOderNull(werte.customer_id);
  }
  if("week_start" in werte) nutzlast.week_start = werte.week_start || null;

  const antwort = id
    ? await db.from("tasks").update(nutzlast).eq("id", id).select()
    : await db.from("tasks").insert(nutzlast).select();
  if(antwort.error){
    console.error(antwort.error);
    throw new Error("Aufgabe konnte nicht gespeichert werden: " + antwort.error.message);
  }
  pruefeZeile(antwort.data, "Die Aufgabe wurde von der Datenbank nicht übernommen");
  return antwort.data[0];
}

export async function aufgabeLoeschen(id){
  const { error } = await db.from("tasks").delete().eq("id", id);
  if(error){
    console.error(error);
    throw new Error("Aufgabe konnte nicht gelöscht werden: " + error.message);
  }
}

export async function aufgabeVerschieben(id, weekStart){
  const { data, error } = await db.from("tasks")
    .update({ week_start: weekStart }).eq("id", id).select();
  if(error){
    console.error(error);
    throw new Error("Verschieben fehlgeschlagen: " + error.message);
  }
  pruefeZeile(data, "Die Aufgabe wurde von der Datenbank nicht übernommen");
  return data[0];
}


/* ---------- Projekte ---------- */

export async function projektSpeichern(nutzlast, id){
  const antwort = id
    ? await db.from("projects").update(nutzlast).eq("id", id).select()
    : await db.from("projects").insert(nutzlast).select();
  if(antwort.error){
    console.error(antwort.error);
    throw new Error("Projekt konnte nicht gespeichert werden: " + antwort.error.message);
  }
  pruefeZeile(antwort.data, "Das Projekt wurde von der Datenbank nicht übernommen");
  const projekt = antwort.data[0];

  // Der Kunde steht denormalisiert auch an der Aufgabe, damit eine Aufgabe
  // ohne Projekt trotzdem ein Board hat. Haengt man ein Projekt an einen
  // anderen Kunden um, muessen seine Aufgaben mitwandern — sonst liegen sie
  // weiter im Board des alten Kunden.
  if(id){
    const { error } = await db.from("tasks")
      .update({ customer_id: projekt.customer_id || null })
      .eq("project_id", projekt.id);
    if(error){
      console.error(error);
      throw new Error("Das Projekt wurde gespeichert, aber seine Aufgaben behielten den alten Kunden: "
                      + error.message + " — bitte die Seite neu laden.");
    }
  }
  return projekt;
}
