/* Kleine Bausteine, die mehrere Ansichten teilen. */

import { escapeHtml, fmtDate, tageBis, fristText } from "../utils/format.js";
import { state } from "../state.js";

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

/* Badge fuer eine Frist. Ohne Datum gar kein Badge.
   Bei einer erledigten Sache faellt die Warnfarbe weg — was fertig ist, kann
   nicht mehr ueberfaellig werden. */
export function fristBadge(datum, opts = {}){
  if(!datum) return "";
  const tage = tageBis(datum);
  const spaet = !opts.erledigt && tage !== null && tage < 0;
  const zusatz = !opts.erledigt && fristText(tage) ? " · " + fristText(tage) : "";
  return `<span class="due-badge${spaet?" is-late":""}">${escapeHtml(fmtDate(datum))}${escapeHtml(zusatz)}</span>`;
}

/* Wirft bei Supabase-Fehlern, damit der Dialog offen bleibt und die Meldung
   dort steht statt in einem alert(). */
export function pruefe(error, was){
  if(error){
    console.error(error);
    throw new Error(was + ": " + error.message);
  }
}

/* Supabase meldet keinen Fehler, wenn eine Policy die Zeile verwirft — es
   kommt einfach nichts zurueck. Ohne diese Pruefung landete undefined im
   Speicher und die naechste Zeichnung brach ab. */
export function pruefeZeile(data, was){
  if(!data || !data.length) throw new Error(was + " — bitte die Seite neu laden.");
}

/* Kunden zur Auswahl in einem Dialog.

   nurKunden: nur abrechenbare Kunden (fuer Umsatz und Projektzuordnung).
   Ohne die Option sind auch die internen Zuordnungen dabei — eine Aufgabe
   darf auf "XPO intern" laufen, ein Umsatz nicht. */
export function kundenOptionen(opts = {}){
  const { nurKunden = false, leerLabel = null } = opts;
  const liste = state.customers
    .filter(c=> c.status !== "beendet" && (!nurKunden || c.kind === "kunde"))
    .map(c=>[c.id, c.kind === "intern" ? c.name + " (intern)" : c.name]);
  return leerLabel ? [["", leerLabel]].concat(liste) : liste;
}

/* Leerzustand in einheitlicher Form. */
export function emptyState(titel, hinweis, opts = {}){
  return `<div class="empty-state${opts.inline?" is-inline":""}">
    ${titel ? `<div class="es-title">${escapeHtml(titel)}</div>` : ""}
    <div class="es-hint">${escapeHtml(hinweis)}</div>
  </div>`;
}
