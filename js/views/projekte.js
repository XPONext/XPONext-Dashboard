/* Ansicht: Projekte — Langzeitvorhaben mit Schritten.

   Die Frage, die diese Ansicht beantwortet: Woran arbeiten wir gerade, wie
   weit sind wir, und was ist liegengeblieben? Deshalb steht oben der
   Gesamtfortschritt und das, was über der Frist ist — nicht eine Zählung
   erledigter Schritte, die immer nur wächst. */

import { fmtDate, escapeHtml, num, todayIso } from "../utils/format.js";
import { db } from "../supabase.js";
import { state, kundeNach, normStatus } from "../state.js";
import { fetchAllData } from "../data.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner } from "../ui/bus.js";
import { personBadge, pruefe, PERSON_OPTIONS, PERSON_LABEL, emptyState } from "../ui/components.js";

const PROJECT_STATUS_LABEL = { aktiv:"Aktiv", pausiert:"Pausiert", fertig:"Abgeschlossen" };
const STATUS_OPTIONS = [["aktiv","Aktiv"],["pausiert","Pausiert"],["fertig","Abgeschlossen"]];

/* Supabase meldet keinen Fehler, wenn eine Policy die Zeile verwirft — es
   kommt einfach nichts zurueck. Ohne diese Pruefung landete undefined im
   Speicher und die naechste Zeichnung brach ab. */
function pruefeZeile(data, was){
  if(!data || !data.length) throw new Error(was + " — bitte die Seite neu laden.");
}

function stepsOf(projectId){
  return state.projectSteps.filter(s=>String(s.project_id)===String(projectId));
}

function tasksOf(projectId){
  return state.tasks.filter(t=>String(t.project_id)===String(projectId));
}

/* Tage bis zur Frist. Negativ = überfällig. */
function tageBis(datum){
  if(!datum) return null;
  const heute = new Date(todayIso()+"T00:00:00");
  const ziel  = new Date(datum+"T00:00:00");
  const tage = Math.round((ziel - heute) / 86400000);
  // Ein unbrauchbares Datum soll nicht still als "nicht faellig" durchgehen
  return Number.isFinite(tage) ? tage : null;
}

function fristText(tage){
  if(tage === null) return "";
  if(tage < 0)  return Math.abs(tage) + (Math.abs(tage) === 1 ? " Tag überfällig" : " Tage überfällig");
  if(tage === 0) return "heute fällig";
  if(tage === 1) return "morgen fällig";
  if(tage <= 14) return "in " + tage + " Tagen";
  return "";
}

function istOffen(p){ return p.status !== "fertig"; }

async function neuLaden(){
  try{
    await fetchAllData();
  }catch(e){
    showErrorBanner("Gespeichert, aber die Ansicht konnte nicht aktualisiert werden: " +
                    ((e && e.message) || e) + " — bitte die Seite neu laden.");
  }
  renderAll();
}

/* ---------- Dialoge ---------- */

function kundenOptionen(){
  return [["", "— kein Kunde —"]].concat(
    state.customers.filter(c=>c.kind === "kunde" && c.status !== "beendet").map(c=>[c.id, c.name])
  );
}

async function openProjectModal(id){
  const p = id != null ? state.projects.find(x=>String(x.id)===String(id)) : null;

  const felder = [
    { name:"title", label:"Projektname", type:"text", required:true, width:"full",
      placeholder:"z.B. Website-Relaunch" },
    { name:"description", label:"Beschreibung", type:"textarea", width:"full",
      placeholder:"Worum geht es? (optional)" },
    { name:"owner",  label:"Verantwortlich", type:"select", options:PERSON_OPTIONS, value:"beide" },
    { name:"status", label:"Status", type:"select", options:STATUS_OPTIONS, value:"aktiv" },
    { name:"due_date", label:"Deadline", type:"date" }
  ];
  // Der Kundenbezug ist optional und erscheint nur, wenn es Kunden gibt.
  if(state.customers.length){
    felder.push({ name:"customer_id", label:"Für welchen Kunden?", type:"select",
                  options:kundenOptionen(), value:"", width:"full",
                  hint:"Optional — interne Projekte lässt du leer." });
  }

  const ergebnis = await openModal({
    title: p ? "Projekt bearbeiten" : "Neues Projekt",
    submitLabel: p ? "Änderungen speichern" : "Projekt anlegen",
    fields: felder,
    initial: p,
    onSubmit: async werte=>{
      const nutzlast = {
        title: werte.title,
        description: werte.description || null,
        owner: werte.owner,
        status: werte.status,
        due_date: werte.due_date || null
      };
      if(state.customers.length) nutzlast.customer_id = werte.customer_id || null;

      if(p){
        const { data, error } = await db.from("projects").update(nutzlast).eq("id", p.id).select();
        pruefe(error, "Projekt konnte nicht gespeichert werden");
        pruefeZeile(data, "Das Projekt wurde von der Datenbank nicht übernommen");
        const idx = state.projects.findIndex(x=>String(x.id)===String(p.id));
        if(idx>=0) state.projects[idx] = data[0];
      } else {
        const { data, error } = await db.from("projects").insert(nutzlast).select();
        pruefe(error, "Projekt konnte nicht angelegt werden");
        pruefeZeile(data, "Das Projekt wurde von der Datenbank nicht übernommen");
        state.projects.push(data[0]);
      }
    },
    onDelete: p ? async ()=>{
      const n = stepsOf(p.id).length;
      const a = tasksOf(p.id).length;
      const teile = [];
      if(n) teile.push(`${n} Schritt${n>1?"e":""}`);
      if(a) teile.push(`${a} verknüpfte Aufgabe${a>1?"n":""}`);
      const ok = await confirmDialog(`Projekt „${p.title}" löschen?`, {
        detail: teile.length
          ? teile.join(" und ") + " — die Schritte werden mitgelöscht, die Aufgaben bleiben erhalten und verlieren nur die Zuordnung."
          : ""
      });
      if(!ok) return false;
      const { error } = await db.from("projects").delete().eq("id", p.id);
      pruefe(error, "Projekt konnte nicht gelöscht werden");
      state.projects = state.projects.filter(x=>String(x.id)!==String(p.id));
      state.projectSteps = state.projectSteps.filter(s=>String(s.project_id)!==String(p.id));
    } : null
  });
  if(ergebnis) await neuLaden();
}

async function openStepModal(projectId, vorhandener){
  const ergebnis = await openModal({
    title: vorhandener ? "Schritt bearbeiten" : "Neuer Schritt",
    submitLabel: vorhandener ? "Änderungen speichern" : "Schritt hinzufügen",
    fields: [
      { name:"text", label:"Was ist zu tun?", type:"text", required:true, width:"full",
        placeholder:"z.B. Struktur der Startseite festlegen" },
      { name:"assignee", label:"Zugewiesen an", type:"select", options:PERSON_OPTIONS, value:"tim" },
      { name:"due_date", label:"Bis wann?", type:"date", hint:"Optional." }
    ],
    initial: vorhandener,
    onSubmit: async werte=>{
      const nutzlast = {
        project_id: projectId,
        text: werte.text,
        assignee: werte.assignee,
        due_date: werte.due_date || null
      };
      if(vorhandener){
        const { data, error } = await db.from("project_steps")
          .update(nutzlast).eq("id", vorhandener.id).select();
        pruefe(error, "Schritt konnte nicht gespeichert werden");
        pruefeZeile(data, "Der Schritt wurde von der Datenbank nicht übernommen");
        // Auch im Speicher nachziehen: Scheitert danach das Neuladen, zeigte
        // die Ansicht sonst weiter den alten Text, obwohl gespeichert wurde.
        const idx = state.projectSteps.findIndex(x=>String(x.id)===String(vorhandener.id));
        if(idx>=0) state.projectSteps[idx] = data[0];
      } else {
        const { data, error } = await db.from("project_steps")
          .insert({ ...nutzlast, done:false }).select();
        pruefe(error, "Schritt konnte nicht gespeichert werden");
        pruefeZeile(data, "Der Schritt wurde von der Datenbank nicht übernommen");
        state.projectSteps.push(data[0]);
      }
    },
    onDelete: vorhandener ? async ()=>{
      if(!await confirmDialog(`Schritt „${vorhandener.text}" löschen?`)) return false;
      const { error } = await db.from("project_steps").delete().eq("id", vorhandener.id);
      pruefe(error, "Schritt konnte nicht gelöscht werden");
      state.projectSteps = state.projectSteps.filter(s=>String(s.id)!==String(vorhandener.id));
    } : null
  });
  if(ergebnis) await neuLaden();
}

/* ---------- Übersicht ---------- */

function renderKopf(){
  const offene = state.projects.filter(istOffen);
  const alleSchritte = state.projectSteps.filter(s=>
    offene.some(p=>String(p.id)===String(s.project_id)));
  const erledigt = alleSchritte.filter(s=>s.done).length;
  const pct = alleSchritte.length ? (erledigt/alleSchritte.length)*100 : 0;

  document.getElementById("projStatActive").textContent = offene.length;
  const pausiert = offene.filter(p=>p.status === "pausiert").length;
  document.getElementById("projStatActiveSub").textContent =
    pausiert ? pausiert + " davon pausiert" : (offene.length ? "alle aktiv" : "keins offen");

  document.getElementById("projStatProgress").textContent =
    alleSchritte.length ? num(pct,0) + "%" : "—";
  const bar = document.getElementById("projStatProgressBar");
  bar.style.width = pct + "%";
  bar.className = "bar-fill " + (pct >= 80 ? "ok" : pct >= 40 ? "warn" : "low");
  document.getElementById("projStatProgressSub").textContent =
    alleSchritte.length ? erledigt + " von " + alleSchritte.length + " Schritten" : "noch keine Schritte";

  // Ueberfaellig zaehlt Schritte UND Projekte, deren eigene Frist verstrichen
  // ist. Vorher zaehlten nur Schritte — ein Projekt konnte seine Deadline
  // reissen, ohne hier jemals aufzutauchen.
  const spaeteSchritte = alleSchritte.filter(s=>!s.done && s.due_date && tageBis(s.due_date) < 0);
  const spaeteProjekte = offene.filter(p=>p.due_date && tageBis(p.due_date) < 0);
  const ueberfaellig = spaeteSchritte.length + spaeteProjekte.length;
  const aeltestes = spaeteSchritte.map(s=>s.due_date)
    .concat(spaeteProjekte.map(p=>p.due_date))
    .sort((a,b)=>a.localeCompare(b))[0];

  document.getElementById("projStatLate").textContent = ueberfaellig;
  document.getElementById("projStatLateSub").textContent = ueberfaellig
    ? "Schritte und Fristen · längster Rückstand " + fristText(tageBis(aeltestes))
    : "Schritte und Fristen im Plan";

  // Nächste Deadline über Projekte UND Schritte
  const fristen = offene.filter(p=>p.due_date).map(p=>({ datum:p.due_date, was:p.title }))
    .concat(alleSchritte.filter(s=>!s.done && s.due_date).map(s=>({ datum:s.due_date, was:s.text })))
    .sort((a,b)=>a.datum.localeCompare(b.datum));
  const naechste = fristen[0];
  document.getElementById("projStatDeadline").textContent =
    naechste ? fmtDate(naechste.datum) + " " + naechste.was : "—";
  document.getElementById("projStatDeadlineSub").textContent =
    naechste ? (fristText(tageBis(naechste.datum)) || "später") : "keine Frist gesetzt";

  renderAuslastung(offene);
}

/* Wer hat wie viel offen? Beantwortet die Frage, ob sich etwas bei einer
   Person staut. */
function renderAuslastung(offene){
  const el = document.getElementById("projWorkload");
  const offeneSchritte = state.projectSteps.filter(s=>
    !s.done && offene.some(p=>String(p.id)===String(s.project_id)));

  if(!offeneSchritte.length){ el.innerHTML = ""; return; }

  const proPerson = {};
  offeneSchritte.forEach(s=>{
    const wer = s.assignee || "offen";
    proPerson[wer] = proPerson[wer] || { gesamt:0, spaet:0 };
    proPerson[wer].gesamt++;
    if(s.due_date && tageBis(s.due_date) < 0) proPerson[wer].spaet++;
  });

  el.innerHTML = `<div class="workload-title">Offene Schritte</div>
    <div class="workload-list">${Object.entries(proPerson)
      .sort((a,b)=>b[1].gesamt-a[1].gesamt)
      .map(([wer, z])=>`
        <span class="workload-chip${z.spaet ? " is-late" : ""}">
          ${escapeHtml(wer === "offen" ? "ohne Zuweisung" : (PERSON_LABEL[wer] || wer))}
          <b>${z.gesamt}</b>${z.spaet ? `<span class="wl-late">${z.spaet} überfällig</span>` : ""}
        </span>`).join("")}</div>`;
}

/* ---------- Projektliste ---------- */

function gefilterteProjekte(){
  const filter = document.getElementById("prFilter").value;
  if(filter === "alle") return state.projects.slice();
  if(filter.startsWith("meine-")){
    const wer = filter.slice(6);
    return state.projects.filter(p=>istOffen(p) && (p.owner === wer || p.owner === "beide"));
  }
  return state.projects.filter(istOffen);
}

function renderProjects(){
  const sichtbare = gefilterteProjekte();
  renderKopf();

  const list = document.getElementById("projectsList");
  if(!state.projects.length){
    list.innerHTML = emptyState("Noch keine Projekte",
      "Langzeitvorhaben, die nicht in eine Woche passen — Website-Relaunch, neues Angebot, Prozessumbau. Schritte hakst du nach und nach ab.");
    return;
  }
  if(!sichtbare.length){
    list.innerHTML = emptyState("Nichts in dieser Auswahl",
      "Stell die Auswahl oben auf „Alle, auch abgeschlossene“, um die übrigen Projekte zu sehen.");
    return;
  }

  // Projekte mit näherer Frist zuerst, fristlose ans Ende
  const sortiert = sichtbare.slice().sort((a,b)=>{
    if(a.status === "fertig" && b.status !== "fertig") return 1;
    if(b.status === "fertig" && a.status !== "fertig") return -1;
    if(a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if(a.due_date) return -1;
    if(b.due_date) return 1;
    return String(a.title).localeCompare(String(b.title));
  });

  list.innerHTML = sortiert.map(p=>{
    const steps = stepsOf(p.id).slice().sort((a,b)=>{
      if(!!a.done !== !!b.done) return a.done ? 1 : -1;
      if(a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if(a.due_date) return -1;
      if(b.due_date) return 1;
      return String(a.created_at||"").localeCompare(String(b.created_at||""));
    });
    const fertig = steps.filter(s=>s.done).length;
    const pct = steps.length ? (fertig/steps.length)*100 : 0;
    const tage = tageBis(p.due_date);
    const kunde = p.customer_id ? kundeNach(p.customer_id) : null;
    const aufgaben = tasksOf(p.id);
    const offeneAufgaben = aufgaben.filter(t=>normStatus(t) !== "done").length;

    const schrittZeilen = steps.length ? steps.map(s=>{
      const st = tageBis(s.due_date);
      const spaet = !s.done && st !== null && st < 0;
      return `<div class="step-row ${s.done?"is-done":""}">
        <input type="checkbox" ${s.done?"checked":""} data-pact="step-toggle" data-id="${escapeHtml(s.id)}">
        <span class="step-text">${escapeHtml(s.text)}</span>
        ${s.due_date ? `<span class="due-badge ${spaet?"is-late":""}">${escapeHtml(fmtDate(s.due_date))}${spaet?" · "+escapeHtml(fristText(st)):""}</span>` : ""}
        ${personBadge(s.assignee)}
        <button type="button" class="step-edit" data-pact="step-edit" data-id="${escapeHtml(s.id)}" title="Schritt bearbeiten">✎</button>
      </div>`;
    }).join("") : `<div class="step-empty">Noch keine Schritte — zerleg das Projekt in einzelne Handgriffe, dann siehst du den Fortschritt.</div>`;

    return `<div class="project-card ${p.status==="fertig"?"is-done":""}">
      <div class="project-top">
        <div class="project-title">${escapeHtml(p.title)}</div>
        <button type="button" class="project-edit" data-pact="proj-edit" data-id="${escapeHtml(p.id)}" title="Projekt bearbeiten">✎</button>
      </div>
      ${p.description ? `<div class="project-desc">${escapeHtml(p.description)}</div>` : ""}
      <div class="project-badges">
        <span class="status-badge st-${escapeHtml(p.status)}">${escapeHtml(PROJECT_STATUS_LABEL[p.status]||p.status)}</span>
        ${personBadge(p.owner)}
        ${kunde ? `<span class="task-badge kunde">${escapeHtml(kunde.name)}</span>` : ""}
        ${p.due_date ? `<span class="due-badge ${tage!==null&&tage<0&&p.status!=="fertig"?"is-late":""}">bis ${escapeHtml(fmtDate(p.due_date))}${
            p.status!=="fertig" && fristText(tage) ? " · " + escapeHtml(fristText(tage)) : ""}</span>` : ""}
        ${offeneAufgaben ? `<span class="task-badge">${offeneAufgaben} offene Aufgabe${offeneAufgaben>1?"n":""} im Board</span>` : ""}
      </div>
      <div class="project-progress">
        <div class="bar-track"><div class="bar-fill ${pct>=80?"ok":pct>=40?"warn":"low"}" style="width:${pct}%"></div></div>
        <span class="ratio">${fertig}/${steps.length}</span>
      </div>
      <div class="step-list">${schrittZeilen}</div>
      <div class="step-add">
        <button type="button" class="btn-outline" data-pact="step-add" data-id="${escapeHtml(p.id)}">+ Schritt</button>
      </div>
    </div>`;
  }).join("");
}

/* ---------- Ereignisse ---------- */

document.getElementById("openAddProjectBtn").addEventListener("click", ()=>openProjectModal(null));
document.getElementById("prFilter").addEventListener("change", renderProjects);

document.getElementById("projectsList").addEventListener("click", async (ev)=>{
  const el = ev.target.closest("[data-pact]");
  if(!el) return;
  const act = el.dataset.pact, id = el.dataset.id;

  if(act === "proj-edit"){ openProjectModal(id); return; }
  if(act === "step-add"){ openStepModal(id, null); return; }

  const s = state.projectSteps.find(x=>String(x.id)===String(id));
  if(!s) return;

  if(act === "step-edit"){ openStepModal(s.project_id, s); return; }

  if(act === "step-toggle"){
    const done = el.checked;
    // .select() ist hier nicht optional: Verwirft eine RLS-Policy die Zeile,
    // meldet Supabase KEINEN Fehler, sondern schreibt einfach nichts. Ohne die
    // Rueckgabe stand der Haken gesetzt da, waehrend in der Datenbank nichts
    // passiert war — und das faellt erst beim naechsten Neuladen auf.
    const { data, error } = await db.from("project_steps")
      .update({ done }).eq("id", s.id).select();
    if(error || !data || !data.length){
      if(error) console.error(error);
      showErrorBanner(error
        ? "Konnte nicht gespeichert werden: " + error.message
        : "Der Schritt konnte nicht gespeichert werden — er wurde von der Datenbank nicht übernommen. Bitte die Seite neu laden.");
      el.checked = !done;
      return;
    }
    s.done = done;
    renderProjects();
  }
});

onRender("projekte", renderProjects);
