/* Einstiegspunkt: Zugang pruefen, Daten laden, Ansichten zeichnen.

   Die Reihenfolge der View-Importe bestimmt die Reihenfolge beim Zeichnen —
   jede Ansicht meldet sich beim Import ueber onRender() an. */

import { ensureAuthorized } from "./supabase.js";
import { fetchAllData } from "./data.js";
import { state } from "./state.js";
import { findCurrentWeekIndex } from "./utils/weeks.js";
import { renderAll, showErrorBanner } from "./ui/bus.js";
import { initRouter } from "./router.js";

import "./views/dashboard.js";
import "./views/verlauf.js";
import { populateEntryControls, loadDayIntoForm } from "./views/eingabe.js";
import { loadDayIntoHebelForm } from "./views/hebel.js";
import "./views/aufgaben.js";
import "./views/projekte.js";
import "./views/zeittracking.js";

window.addEventListener("error", ev=>{
  showErrorBanner("Es ist ein Fehler aufgetreten: "+(ev.message||"unbekannt")+" — bitte die Seite neu laden.");
});
window.addEventListener("unhandledrejection", ev=>{
  const r = ev.reason;
  showErrorBanner("Es ist ein Fehler aufgetreten: "+((r&&r.message)||r||"unbekannt")+" — bitte die Seite neu laden.");
});

async function init(){
  // supabase-js kommt per CDN. Faellt das aus, waere die Seite sonst kommentarlos leer.
  if(!window.supabase){
    showErrorBanner("Die Verbindung zu Supabase konnte nicht geladen werden (CDN nicht erreichbar). Bitte Internetverbindung prüfen und neu laden.");
    return;
  }
  await ensureAuthorized();
  populateEntryControls();
  state.boardWeekIdx = findCurrentWeekIndex();
  await fetchAllData();
  loadDayIntoForm();
  loadDayIntoHebelForm();
  initRouter();
  renderAll();
}
init();
