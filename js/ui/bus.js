/* Kleiner Verteiler zwischen den Ansichten.

   Frueher rief renderAll() alle Renderfunktionen direkt auf. Beim Aufteilen in
   Module haette das einen Zirkelbezug ergeben: der Router braucht die Ansichten,
   die Ansichten brauchen nach dem Speichern wieder renderAll().

   Stattdessen meldet jede Ansicht ihre Renderfunktion hier an, und wer Daten
   aendert, ruft renderAll(). Niemand muss jemanden anderen importieren. */

const abonnenten = [];

/* Reihenfolge der Anmeldung = Reihenfolge beim Zeichnen. */
export function onRender(fn){
  abonnenten.push(fn);
}

export function renderAll(){
  abonnenten.forEach(fn=>{
    try{
      fn();
    }catch(e){
      // Eine kaputte Ansicht darf nicht alle anderen mitreissen.
      console.error("Fehler beim Zeichnen einer Ansicht:", e);
      showErrorBanner("Eine Ansicht konnte nicht gezeichnet werden: " + (e && e.message));
    }
  });
}

/* ---------- Fehlerbanner ----------
   Seit dem Umbau auf ES-Module scheitern Fehler still, wenn die Konsole zu ist.
   Der Banner macht sie sichtbar. */
export function showErrorBanner(msg){
  let el = document.getElementById("errorBanner");
  if(!el){
    el = document.createElement("div");
    el.id = "errorBanner";
    el.className = "error-banner";
    document.body.prepend(el);
  }
  el.textContent = msg;
  el.style.display = "block";
}

/* Kurze Bestaetigung nach dem Speichern. Ersetzt die drei kopierten
   .save-msg-Bloecke. */
export function flashSaved(elementId){
  const el = document.getElementById(elementId);
  if(!el) return;
  el.style.display = "block";
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(()=>{ el.style.display = "none"; }, 1800);
}
