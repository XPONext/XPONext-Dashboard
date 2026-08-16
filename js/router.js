/* Reiterwechsel.

   Die Ansichten melden sich ueber ui/bus.js selbst zum Zeichnen an; hier wird
   nur umgeschaltet und neu geladen. */

import { fetchAllData } from "./data.js";
import { renderAll } from "./ui/bus.js";
import { loadDayIntoForm } from "./views/eingabe.js";
import { loadDayIntoHebelForm } from "./views/hebel.js";

export function initRouter(){
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("view-"+btn.dataset.view).classList.add("active");
      await fetchAllData();
      loadDayIntoForm();
      loadDayIntoHebelForm();
      renderAll();
    });
  });
}
