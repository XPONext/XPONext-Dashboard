/* Reiter "Angebote & Verträge" — der Umschalter zwischen beiden Teilen.

   Beides entsteht nach einem Gespräch mit dem Kunden, erst das Angebot, nach
   der Zusage der Vertrag. Deshalb ein Reiter mit Umschalter statt zwei
   Reitern, wie Aufgaben | Projekte unter "Arbeit".

   Eigene Attribute (data-dokument, data-dokument-teil) statt der vom
   Arbeit-Reiter: Dessen Umschalter greift seitenweit auf [data-arbeit] und
   [data-teil] zu und würde sich mit einem zweiten verhaken. Die Optik
   (.arbeit-switch) ist dieselbe.

   Jeder Teil baut sich erst auf, wenn er zum ersten Mal sichtbar wird — also
   nicht beim Laden der Seite und nicht für den Teil, den man nie anklickt.
   Das spart beim Vertrag den Katalog-Abruf und beim Angebot den Abruf der
   Bausteine. */

import { oeffneAngebot } from "./angebote.js";
import { oeffneVertrag } from "./auftraege.js";

const MERKER = "xponext_dokument_teil";
const OEFFNEN = { angebot: oeffneAngebot, vertrag: oeffneVertrag };

function aktuellerTeil(){
  const aktiv = document.querySelector("[data-dokument].active");
  return aktiv ? aktiv.dataset.dokument : "angebot";
}

function zeige(name){
  document.querySelectorAll("[data-dokument]").forEach(b=>{
    b.classList.toggle("active", b.dataset.dokument === name);
    b.setAttribute("aria-selected", b.dataset.dokument === name ? "true" : "false");
  });
  document.querySelectorAll("[data-dokument-teil]").forEach(t=>{
    t.hidden = t.dataset.dokumentTeil !== name;
  });
  OEFFNEN[name]?.();          // baut sich beim ersten Mal auf, danach nichts
}

document.querySelectorAll("[data-dokument]").forEach(b=>{
  b.addEventListener("click", ()=>{
    zeige(b.dataset.dokument);
    try{ localStorage.setItem(MERKER, b.dataset.dokument); }catch(e){ /* privates Fenster */ }
  });
});

// Beim Öffnen des Reiters den zuletzt benutzten Teil zeigen — wer gestern
// einen Vertrag geschrieben hat, landet heute nicht erst beim Angebot.
document.querySelector('.tab-btn[data-view="dokumente"]')?.addEventListener("click", ()=>{
  let gemerkt = null;
  try{ gemerkt = localStorage.getItem(MERKER); }catch(e){ /* egal */ }
  zeige(OEFFNEN[gemerkt] ? gemerkt : aktuellerTeil());
});
