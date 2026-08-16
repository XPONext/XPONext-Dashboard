/* Zuordnung von Datumsangaben zu den Wochen aus config.js. */

import { WEEKS, N_WEEKS } from "../config.js";

/* Achtung: liefert -1 für alles ausserhalb des in WEEKS definierten Zeitraums.
   Aufrufer muessen das abfangen, sonst fallen solche Eintraege still aus
   allen Aggregaten. Kalendarische Auswertungen (z. B. Kunden/Umsatz) duerfen
   sich deshalb nicht auf WEEKS stuetzen. */
export function weekIndexForDate(dateStr){
  for(let i=0;i<N_WEEKS;i++){
    if(dateStr>=WEEKS[i][0] && dateStr<=WEEKS[i][1]) return i;
  }
  return -1;
}

export function findCurrentWeekIndex(){
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i=0;i<WEEKS.length;i++){
    const s = new Date(WEEKS[i][0]+"T00:00:00");
    const e = new Date(WEEKS[i][1]+"T23:59:59");
    if(today>=s && today<=e) return i;
  }
  if(today < new Date(WEEKS[0][0]+"T00:00:00")) return 0;
  return WEEKS.length-1;
}
