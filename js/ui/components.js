/* Kleine Bausteine, die mehrere Ansichten teilen. */

import { escapeHtml } from "../utils/format.js";

export const PERSON_LABEL = { tim:"Tim", simon:"Simon", beide:"Beide" };
export const PRIO_LABEL   = { hoch:"Hoch", mittel:"Mittel", niedrig:"Niedrig" };

export const PERSON_OPTIONS = [["tim","Tim"],["simon","Simon"],["beide","Beide"]];
export const PRIO_OPTIONS   = [["hoch","Hoch"],["mittel","Mittel"],["niedrig","Niedrig"]];

/* Badge fuer die zugewiesene Person. Ohne Zuweisung gar kein Badge — Altdaten
   aus der Zeit vor dem Feld haben sonst das Wort "undefined" angezeigt. */
export function personBadge(who){
  if(!who) return "";
  return `<span class="task-badge person">${escapeHtml(PERSON_LABEL[who] || who)}</span>`;
}

/* Wirft bei Supabase-Fehlern, damit der Dialog offen bleibt und die Meldung
   dort steht statt in einem alert(). */
export function pruefe(error, was){
  if(error){
    console.error(error);
    throw new Error(was + ": " + error.message);
  }
}

/* Leerzustand in einheitlicher Form. */
export function emptyState(titel, hinweis, opts = {}){
  return `<div class="empty-state${opts.inline?" is-inline":""}">
    ${titel ? `<div class="es-title">${escapeHtml(titel)}</div>` : ""}
    <div class="es-hint">${escapeHtml(hinweis)}</div>
  </div>`;
}
