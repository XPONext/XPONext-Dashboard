/* ============================================================
   Ein Dialog fuer alles.

   Ersetzt die sechs handgebauten Overlays. Grundlage ist das native
   <dialog>: showModal() bringt Escape, den abgedunkelten Hintergrund,
   den Fokus-Trap und das Stilllegen der Seite dahinter von sich aus mit —
   genau das, was vorher fehlte.

   Aufruf:

     const werte = await openModal({
       title: "Neues Projekt",
       submitLabel: "Anlegen",
       fields: [
         {name:"title", label:"Projektname", type:"text", required:true},
         {name:"owner", label:"Verantwortlich", type:"select",
          options:[["tim","Tim"],["simon","Simon"]]}
       ],
       initial: projekt,                  // gesetzt = Bearbeiten
       onSubmit: async werte => { ... },  // Fehler hier bleiben im Dialog
       onDelete: async () => { ... }      // gesetzt = Loeschen anbieten
     });

   Der Rueckgabewert ist das Werteobjekt oder null, wenn abgebrochen wurde.
   Bearbeiten und Anlegen unterscheiden sich nur noch durch die uebergebenen
   Daten — es gibt keine Modul-Variablen mehr, die den Modus merken.
   ============================================================ */

import { escapeHtml } from "../utils/format.js";

let dialog = null;

function ensureDialog(){
  if(dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "dlg";
  dialog.id = "appDialog";
  document.body.appendChild(dialog);

  // Klick auf den Hintergrund schliesst — das Einzige, was <dialog>
  // nicht selbst mitbringt. Der Klick trifft das dialog-Element selbst,
  // sobald er ausserhalb des Inhalts landet.
  dialog.addEventListener("click", ev=>{
    if(ev.target === dialog) dialog.close("abbruch");
  });
  return dialog;
}

function fieldMarkup(f, initial){
  const wert = initial && initial[f.name] != null ? initial[f.name] : (f.value != null ? f.value : "");
  const id = "dlg_" + f.name;
  const hint = f.hint ? `<div class="dlg-hint">${escapeHtml(f.hint)}</div>` : "";
  const req = f.required ? " required" : "";
  let control;

  switch(f.type){
    case "select":
      control = `<select id="${id}" name="${f.name}"${req}>` +
        (f.options || []).map(([v,l])=>
          `<option value="${escapeHtml(v)}"${String(v)===String(wert)?" selected":""}>${escapeHtml(l)}</option>`
        ).join("") + `</select>`;
      break;
    case "textarea":
      control = `<textarea id="${id}" name="${f.name}" rows="${f.rows||3}"${req}` +
        (f.placeholder?` placeholder="${escapeHtml(f.placeholder)}"`:"") +
        `>${escapeHtml(wert)}</textarea>`;
      break;
    case "checkbox":
      control = `<input type="checkbox" id="${id}" name="${f.name}"${wert?" checked":""}>`;
      break;
    default: // text, number, date
      control = `<input type="${f.type||"text"}" id="${id}" name="${f.name}" value="${escapeHtml(wert)}"${req}` +
        (f.placeholder?` placeholder="${escapeHtml(f.placeholder)}"`:"") +
        (f.step!=null?` step="${escapeHtml(f.step)}"`:"") +
        (f.min!=null?` min="${escapeHtml(f.min)}"`:"") + `>`;
  }

  return `<div class="field${f.width==="full"?" is-full":""}">
    <label for="${id}">${escapeHtml(f.label)}</label>
    ${control}
    ${hint}
  </div>`;
}

function readValues(form, fields){
  const werte = {};
  fields.forEach(f=>{
    const el = form.elements[f.name];
    if(!el) return;
    if(f.type === "checkbox") werte[f.name] = el.checked;
    else if(f.type === "number") werte[f.name] = el.value === "" ? null : Number(el.value);
    else werte[f.name] = el.value.trim();
  });
  return werte;
}

export function openModal(opts){
  const {
    title,
    submitLabel = "Speichern",
    fields = [],
    initial = null,
    onSubmit = null,
    onDelete = null,
    deleteLabel = "Löschen",
    extraActions = [],
    validate = null
  } = opts;

  const dlg = ensureDialog();

  dlg.innerHTML = `
    <form method="dialog" class="dlg-box">
      <div class="dlg-head">
        <h3>${escapeHtml(title)}</h3>
        <button type="button" class="dlg-close" data-dlg="abbruch" title="Schließen" aria-label="Schließen">✕</button>
      </div>
      <div class="dlg-body">${fields.map(f=>fieldMarkup(f, initial)).join("")}</div>
      <div class="dlg-error" hidden></div>
      <div class="dlg-actions">
        <button type="button" class="btn" data-dlg="submit">${escapeHtml(submitLabel)}</button>
        <button type="button" class="btn-outline" data-dlg="abbruch">Abbrechen</button>
        ${extraActions.filter(a=>!a.hidden).map(a=>
          `<button type="button" class="btn-outline" data-dlg="extra" data-value="${escapeHtml(a.value)}">${escapeHtml(a.label)}</button>`
        ).join("")}
        ${onDelete ? `<button type="button" class="dlg-del" data-dlg="delete">${escapeHtml(deleteLabel)}</button>` : ""}
      </div>
    </form>`;

  const form = dlg.querySelector("form");
  const fehler = dlg.querySelector(".dlg-error");
  const submitBtn = dlg.querySelector('[data-dlg="submit"]');

  function zeigeFehler(text){
    fehler.textContent = text;
    fehler.hidden = false;
  }

  return new Promise(resolve=>{
    let ergebnis = null;
    let laeuft = false;

    async function absenden(){
      if(laeuft) return;                       // Doppelklick erzeugte vorher zwei Eintraege
      const werte = readValues(form, fields);

      const fehlend = fields.find(f=>f.required && !werte[f.name]);
      if(fehlend){ zeigeFehler(`Bitte „${fehlend.label}" ausfüllen.`); return; }
      if(validate){
        const meldung = validate(werte);
        if(meldung){ zeigeFehler(meldung); return; }
      }

      if(!onSubmit){ ergebnis = werte; dlg.close("ok"); return; }

      laeuft = true;
      submitBtn.disabled = true;
      const alterText = submitBtn.textContent;
      submitBtn.textContent = "Speichert …";
      try{
        await onSubmit(werte);
        ergebnis = werte;
        dlg.close("ok");
      }catch(e){
        zeigeFehler(e && e.message ? e.message : String(e));
      }finally{
        laeuft = false;
        submitBtn.disabled = false;
        submitBtn.textContent = alterText;
      }
    }

    form.addEventListener("click", async ev=>{
      const btn = ev.target.closest("[data-dlg]");
      if(!btn) return;
      const art = btn.dataset.dlg;

      if(art === "abbruch"){ dlg.close("abbruch"); return; }
      if(art === "submit"){ await absenden(); return; }
      if(art === "extra"){ ergebnis = { action: btn.dataset.value }; dlg.close("ok"); return; }
      if(art === "delete"){
        if(laeuft) return;
        laeuft = true;
        btn.disabled = true;
        try{
          const weiter = await onDelete();
          if(weiter !== false){ ergebnis = { action: "deleted" }; dlg.close("ok"); }
        }catch(e){
          zeigeFehler(e && e.message ? e.message : String(e));
        }finally{
          laeuft = false;
          btn.disabled = false;
        }
      }
    });

    // Enter im Textfeld speichert — vorher nur bei zwei der sechs Dialoge.
    form.addEventListener("keydown", ev=>{
      if(ev.key === "Enter" && ev.target.tagName !== "TEXTAREA"){
        ev.preventDefault();
        absenden();
      }
    });

    dlg.addEventListener("close", ()=>resolve(ergebnis), { once: true });

    dlg.showModal();
    const erstes = form.querySelector("input:not([type=checkbox]), select, textarea");
    if(erstes) erstes.focus();
  });
}

/* Ersetzt window.confirm — gleicher Stil wie der Rest, und die Aktion
   liest sich als Satz statt als nackte Systemmeldung. */
export function confirmDialog(frage, opts = {}){
  const { confirmLabel = "Ja, löschen", danger = true, detail = "" } = opts;
  const dlg = ensureDialog();

  dlg.innerHTML = `
    <form method="dialog" class="dlg-box is-narrow">
      <div class="dlg-head"><h3>Bestätigen</h3></div>
      <div class="dlg-body">
        <p class="dlg-frage">${escapeHtml(frage)}</p>
        ${detail ? `<p class="dlg-hint">${escapeHtml(detail)}</p>` : ""}
      </div>
      <div class="dlg-actions">
        <button type="button" class="btn${danger?" is-danger":""}" data-dlg="ja">${escapeHtml(confirmLabel)}</button>
        <button type="button" class="btn-outline" data-dlg="nein">Abbrechen</button>
      </div>
    </form>`;

  return new Promise(resolve=>{
    let ja = false;
    dlg.querySelector("form").addEventListener("click", ev=>{
      const btn = ev.target.closest("[data-dlg]");
      if(!btn) return;
      ja = btn.dataset.dlg === "ja";
      dlg.close();
    });
    dlg.addEventListener("close", ()=>resolve(ja), { once: true });
    dlg.showModal();
    dlg.querySelector('[data-dlg="nein"]').focus();
  });
}
