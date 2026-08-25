/* Reine Formatierungshelfer — keine Datenzugriffe, keine Seiteneffekte. */

import { WEEKS } from "../config.js";

/* Muss um jeden Nutzerwert herum, der per innerHTML in die Seite geht. */
export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

export function fmtDate(iso){
  const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
}

export function weekLabel(i){
  return `KW ${i+1} (${fmtDate(WEEKS[i][0])}–${fmtDate(WEEKS[i][1])})`;
}

export function euro(n){
  return "€" + Math.round(n).toLocaleString("de-DE");
}

export function num(n, digits){
  return n.toLocaleString("de-DE",{maximumFractionDigits: digits===undefined?1:digits});
}

/* Wandelt einen UTC-Zeitstempel in das lokale Tagesdatum um.
   Wichtig: time_entries.ts ist UTC, die Auswertung denkt in lokalen Tagen. */
export function localDateStr(tsIso){
  const d = new Date(tsIso);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

/* Ampelklasse für Fortschrittsbalken. */
export function barClass(pct){
  if(pct>=100) return "ok";
  if(pct>=60) return "warn";
  return "low";
}

/* Heutiges Datum als YYYY-MM-DD, in LOKALER Zeit.
   toISOString() rechnet in UTC — zwischen Mitternacht und 2 Uhr lieferte das
   den Vortag, und damit galten Fristen einen Tag zu spaet als ueberfaellig. */
export function todayIso(){
  return localDateStr(new Date());
}

/* ---------- Fristen ----------
   Lagen bis zum Board-Umbau privat in views/projekte.js. Seit Aufgaben eine
   eigene Faelligkeit haben, brauchen sie auch das Board, die Kacheln und die
   Dashboard-Karte — deshalb hier, direkt neben todayIso(), an dem sie
   ohnehin als Einziges haengen. */

/* Tage bis zur Frist. Negativ = ueberfaellig. null = keine Frist. */
export function tageBis(datum){
  if(!datum) return null;
  const heute = new Date(todayIso()+"T00:00:00");
  const ziel  = new Date(datum+"T00:00:00");
  const tage = Math.round((ziel - heute) / 86400000);
  // Ein unbrauchbares Datum soll nicht still als "nicht faellig" durchgehen
  return Number.isFinite(tage) ? tage : null;
}

export function fristText(tage){
  if(tage === null) return "";
  if(tage < 0)  return Math.abs(tage) + (Math.abs(tage) === 1 ? " Tag überfällig" : " Tage überfällig");
  if(tage === 0) return "heute fällig";
  if(tage === 1) return "morgen fällig";
  if(tage <= 14) return "in " + tage + " Tagen";
  return "";
}
