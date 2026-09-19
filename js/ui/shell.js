/* Rahmen der Seite: der Umschalter Aufgaben | Projekte im Reiter "Arbeit"
   und der Nachtragen-Dialog, der von jeder Seite aus erreichbar ist.

   Der Dialog enthaelt die frueheren Eingabemasken (Team-Zahlen, Lead-Gen,
   Hebel). Sie sind nur umgezogen, nicht umgebaut — die zugehoerigen Module
   finden ihre Elemente weiterhin ueber dieselben IDs. */

const TEIL_KEY = "xponext_arbeit_teil";

function zeigeTeil(name){
  document.querySelectorAll("[data-arbeit]").forEach(b=>{
    b.classList.toggle("active", b.dataset.arbeit === name);
    b.setAttribute("aria-selected", b.dataset.arbeit === name ? "true" : "false");
  });
  document.querySelectorAll("[data-teil]").forEach(t=>{ t.hidden = t.dataset.teil !== name; });
}

export function initShell(){
  // Umschalter — die Wahl bleibt im Browser erhalten, damit man nicht bei jedem
  // Laden wieder bei den Aufgaben landet, wenn man gerade an Projekten sitzt.
  document.querySelectorAll("[data-arbeit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      zeigeTeil(btn.dataset.arbeit);
      try{ localStorage.setItem(TEIL_KEY, btn.dataset.arbeit); }catch(e){ /* privates Fenster o.ae. */ }
    });
  });
  let gemerkt = null;
  try{ gemerkt = localStorage.getItem(TEIL_KEY); }catch(e){ /* egal */ }
  if(gemerkt && document.querySelector(`[data-arbeit="${gemerkt}"]`)) zeigeTeil(gemerkt);

  // Nachtragen-Dialog
  const dlg = document.getElementById("nachtragenDialog");
  const knopf = document.getElementById("nachtragenBtn");
  if(!dlg || !knopf) return;

  knopf.addEventListener("click", ()=>dlg.showModal());
  dlg.querySelector('[data-nachtragen="schliessen"]').addEventListener("click", ()=>dlg.close());
  // Klick auf den abgedunkelten Hintergrund schliesst — trifft das dialog-Element selbst
  dlg.addEventListener("click", ev=>{ if(ev.target === dlg) dlg.close(); });

  // Spruenge zu Dialogen, die anderswo leben (z.B. "Calls nachtragen" im
  // Vertriebs-Reiter): erst schliessen, dann den eigentlichen Knopf druecken —
  // zwei offene modale Dialoge uebereinander waeren nicht bedienbar.
  dlg.querySelectorAll("[data-sprung]").forEach(b=>{
    b.addEventListener("click", ()=>{
      dlg.close();
      const ziel = document.getElementById(b.dataset.sprung);
      if(ziel) ziel.click();
    });
  });
}
