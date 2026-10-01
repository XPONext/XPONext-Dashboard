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

/* Mit Cent — fuer kleine Betraege, bei denen das Runden die Aussage
   zerstoert: Ein Wert von 3,35 EUR je Call waere als "3 EUR" sinnlos. */
export function euroCent(n){
  return "€" + Number(n).toLocaleString("de-DE",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/* "vor 5 Min." — fuer den Stand der Abgleiche. Geschuetzte Leerzeichen: In
   den schmalen Kennzahl-Karten brach "gerade eben" sonst um. */
export function vorWieLange(d){
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if(min < 1) return "gerade\u00a0eben";
  if(min < 60) return "vor\u00a0" + min + "\u00a0Min.";
  const std = Math.round(min / 60);
  if(std < 48) return "vor\u00a0" + std + "\u00a0Std.";
  return "vor\u00a0" + Math.round(std / 24) + "\u00a0Tagen";
}
