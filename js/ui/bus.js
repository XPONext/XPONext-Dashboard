/* Kleiner Verteiler zwischen den Ansichten.

   Frueher rief renderAll() alle Renderfunktionen direkt auf. Beim Aufteilen in
   Module haette das einen Zirkelbezug ergeben: der Router braucht die Ansichten,
   die Ansichten brauchen nach dem Speichern wieder renderAll().

   Stattdessen meldet jede Ansicht ihre Renderfunktion hier an, und wer Daten
   aendert, ruft renderAll(). Niemand muss jemanden anderen importieren. */

const abonnenten = [];

/* Reihenfolge der Anmeldung = Reihenfolge beim Zeichnen.
   Der Name landet in der Fehlermeldung — ohne ihn weiss man bei einem
   Problem nicht, welche Ansicht veraltete Zahlen zeigt. */
export function onRender(name, fn){
  abonnenten.push({ name, fn });
}

export function renderAll(){
  const kaputt = [];
  abonnenten.forEach(({ name, fn })=>{
    try{
      fn();
    }catch(e){
      // Eine kaputte Ansicht darf nicht alle anderen mitreissen. Sie kann
      // dabei aber halb gezeichnet stehenbleiben — halb neue, halb alte
      // Zahlen nebeneinander. Deshalb wird sie sichtbar ausgegraut.
      console.error("Fehler beim Zeichnen der Ansicht " + name + ":", e);
      kaputt.push(name + " (" + ((e && e.message) || "unbekannt") + ")");
      const el = document.getElementById("view-" + name);
      if(el) el.classList.add("is-stale");
    }
  });
  if(kaputt.length){
    showErrorBanner("Diese Ansichten zeigen möglicherweise veraltete Zahlen: " + kaputt.join(" · "), "render");
  } else {
    document.querySelectorAll(".view.is-stale").forEach(el=>el.classList.remove("is-stale"));
    // Nur die eigene Meldung zuruecknehmen. Eine Meldung ueber einen
    // fehlgeschlagenen Speichervorgang darf nicht verschwinden, nur weil
    // danach alles fehlerfrei neu gezeichnet wurde.
    const el = document.getElementById("errorBanner");
    if(el && el.dataset.quelle === "render") el.style.display = "none";
  }
}

/* ---------- Fehlerbanner ----------
   Seit dem Umbau auf ES-Module scheitern Fehler still, wenn die Konsole zu ist.
   Der Banner macht sie sichtbar. */
export function showErrorBanner(msg, quelle = "allgemein"){
  let el = document.getElementById("errorBanner");
  if(!el){
    el = document.createElement("div");
    el.id = "errorBanner";
    el.className = "error-banner";
    document.body.prepend(el);
    // Ohne Schliessen-Knopf bleibt ein einmaliger Fehler bis zum Neuladen
    // stehen, auch wenn danach alles wieder funktioniert.
    el.addEventListener("click", ev=>{
      if(ev.target.dataset.act === "zu") el.style.display = "none";
    });
  }
  el.dataset.quelle = quelle;
  el.innerHTML = "";
  const text = document.createElement("span");
  text.textContent = msg;
  const zu = document.createElement("button");
  zu.type = "button";
  zu.className = "banner-close";
  zu.dataset.act = "zu";
  zu.textContent = "✕";
  zu.setAttribute("aria-label", "Meldung schließen");
  el.append(text, zu);
  el.style.display = "flex";
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

/* Klammert einen Speichervorgang.

   Schlaegt er fehl, wird der lokale Stand aus der Datenbank neu geladen und
   der Fehler sichtbar gemeldet. Vorher lief der Aufrufer weiter, zeigte
   "Gespeichert" und behielt einen Wert im Speicher, den die Datenbank gar
   nicht hatte — der Unterschied fiel erst beim naechsten Neuladen auf. */
export async function speichern(vorgang, bestaetigungsId, neuLaden){
  try{
    await vorgang();
  }catch(e){
    showErrorBanner((e && e.message) || "Speichern fehlgeschlagen.");
    if(neuLaden){
      try{ await neuLaden(); }catch(_){ /* Anzeige bleibt wie sie ist */ }
    }
    renderAll();
    return false;
  }
  if(bestaetigungsId) flashSaved(bestaetigungsId);
  renderAll();
  return true;
}
