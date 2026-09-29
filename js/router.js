/* Reiterwechsel.

   Die Ansichten melden sich ueber ui/bus.js selbst zum Zeichnen an; hier wird
   nur umgeschaltet und neu geladen. */

import { fetchAllData } from "./data.js";
import { renderAll } from "./ui/bus.js";
import { loadDayIntoForm } from "./views/eingabe.js";
import { loadDayIntoHebelForm } from "./views/hebel.js";

/* Reiter ohne den Kopf "Fahrplan zum Umsatzziel". Heute, Vertrieb, Kunden und
   Verlauf beantworten Fragen, zu denen der Umsatzstand gehört. Arbeit und
   Angebote & Verträge sind Werkbänke — dort nimmt der Balken nur Platz weg,
   bevor man zum eigentlichen Formular kommt. */
const OHNE_KOPF = new Set(["arbeit", "dokumente"]);

function kopfFuer(view){
  const kopf = document.querySelector(".hero");
  if(kopf) kopf.hidden = OHNE_KOPF.has(view);
}

export function initRouter(){
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("view-"+btn.dataset.view).classList.add("active");
      kopfFuer(btn.dataset.view);
      await fetchAllData();
      loadDayIntoForm();
      loadDayIntoHebelForm();
      renderAll();
    });
  });
}
