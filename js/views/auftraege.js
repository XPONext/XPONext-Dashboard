/* Ansicht: Aufträge — Leistungsvereinbarung zusammenklicken.

   Die Frage, die dieser Reiter beantwortet, ist "wie wird aus dem gewonnenen
   Auftrag ein unterschriebener Vertrag". Er formuliert nichts: Jeder Satz im
   erzeugten Dokument steht wortgleich in einem bereits geschlossenen Vertrag.
   Die Auswahl bestimmt nur, welche Bausteine in welcher Reihenfolge ins
   Dokument kommen. Kein Sprachmodell, nichts, was etwas erfinden kann.

   Der Vertragstext selbst liegt NICHT hier, sondern im Workflow-Repo in
   tools/vertrag_formular/bausteine.py — zusammen mit den Verträgen, aus denen
   er stammt. Dieser Reiter holt ihn über /api/vertrag/katalog. Damit gibt es
   genau eine Stelle, an der ein Wortlaut gepflegt wird.

   Bewusst NICHT bei onRender() angemeldet: Der Router zeichnet bei jedem
   Reiterwechsel alle Ansichten neu, und das würde ein halb ausgefülltes
   Formular zurücksetzen. Stattdessen baut sich der Reiter einmal auf, wenn er
   zum ersten Mal geöffnet wird. */

import { escapeHtml } from "../utils/format.js";
import { VERTRAG_API, SECRET_STORAGE_KEY } from "../config.js";

let katalog = null;
let paket = null;
let aufgebaut = false;
let ablage = "datei";   // "datei" lokal, "download" gehostet — s. hole()

const $ = id => document.getElementById(id);

/* Ein Aufruf beim Generator.

   Lokal ist VERTRAG_API leer, dann sind die Pfade relativ und serve.py
   antwortet. Gehostet zeigt es auf Railway; dort prüft der Server dasselbe
   Team-Passwort, das für Supabase ohnehin im localStorage liegt. Ohne den
   Header bekäme man dort 401. */
async function hole(weg, optionen = {}){
  const kopf = { ...(optionen.headers || {}) };
  const secret = localStorage.getItem(SECRET_STORAGE_KEY);
  if(secret) kopf["x-app-secret"] = secret;
  const antwort = await fetch(VERTRAG_API + weg, { ...optionen, headers: kopf });
  const inhalt = await antwort.json().catch(()=>({}));
  if(!antwort.ok){
    // FastAPI verpackt Fehler in "detail", serve.py in "fehler".
    throw new Error(inhalt.detail || inhalt.fehler || ("HTTP " + antwort.status));
  }
  return inhalt;
}

/* ---------- Aufbau ---------- */

async function oeffne(){
  if(aufgebaut) return;
  aufgebaut = true;

  // Zuerst fragen, ob der Generator überhaupt erreichbar ist. Ohne das stünde
  // hier ein Formular, das beim Klick auf "Erzeugen" scheitert.
  let status;
  try{
    status = await hole("/api/vertrag/status");
  }catch(e){
    return zeigeHinweis(VERTRAG_API
      ? ("Der Vertragsdienst ist nicht erreichbar: " + escapeHtml(String(e.message || e))
         + "<br>Adresse: <code>" + escapeHtml(VERTRAG_API) + "</code>")
      : ("Der Dashboard-Server antwortet nicht. Läuft das Dashboard über "
         + "<code>./serve.sh</code>? Ein reines <code>python3 -m http.server</code> "
         + "reicht für diesen Reiter nicht."));
  }
  if(!status.bereit){
    return zeigeHinweis(escapeHtml(status.fehler || "Der Vertragsgenerator ist nicht verfügbar."));
  }
  ablage = status.ablage || "datei";

  try{
    katalog = await hole("/api/vertrag/katalog");
  }catch(e){
    return zeigeHinweis("Die Bausteine liessen sich nicht laden: "
      + escapeHtml(String(e.message || e)));
  }

  $("auftragRaster").hidden = false;
  baueFormular();
}

function zeigeHinweis(html){
  const el = $("auftragHinweis");
  el.innerHTML = "<strong>Der Auftrags-Reiter ist nicht einsatzbereit.</strong><p>" + html + "</p>";
  el.hidden = false;
}

/* ---------- Formular ---------- */

function baueFormular(){
  $("auftragFormular").innerHTML = `
    <div class="card">
      <h2>Kunde</h2>
      <div class="field">
        <label for="aFirma">Firma <small>wie im Vertrag; Inhaber mit Komma anhängen</small></label>
        <input type="text" id="aFirma" autocomplete="off"
               placeholder="Zittrich Corporate Interior, Birgit Zittrich">
        <div class="auftrag-vorschlaege" id="aVorschlaege" hidden></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="aStrasse">Straße und Hausnummer</label>
          <input type="text" id="aStrasse" placeholder="Pielmey 2"></div>
        <div class="field"><label for="aPlzOrt">PLZ und Ort</label>
          <input type="text" id="aPlzOrt" placeholder="47906 Kempen"></div>
      </div>
    </div>

    <div class="card">
      <h2>Paket</h2>
      <div class="auftrag-kacheln" id="aKacheln"></div>
    </div>

    <div class="card" id="aCardLeistungen" hidden>
      <h2>Leistungen <small>§ 1 Vertragsgegenstand — Reihenfolge wie hier</small></h2>
      <div id="aLeistungen"></div>
      <div id="aBausteinFelder"></div>
    </div>

    <div class="card" id="aCardLaufzeit" hidden>
      <h2>Laufzeit</h2>
      <div class="form-grid form-grid-3">
        <div class="field"><label for="aStart">Beginn</label>
          <input type="date" id="aStart"></div>
        <div class="field"><label for="aLaufzeit">Laufzeit</label>
          <select id="aLaufzeit">
            <option value="0">ohne feste Laufzeit</option>
            <option value="3" selected>3 Monate</option>
            <option value="5">5 Monate</option>
            <option value="6">6 Monate</option>
            <option value="12">12 Monate</option>
            <option value="24">24 Monate</option>
          </select></div>
        <div class="field"><label for="aEnde">Ende <small>berechnet</small></label>
          <input type="date" id="aEnde"></div>
      </div>
    </div>

    <div class="card" id="aCardVerguetung" hidden>
      <h2>Vergütung</h2>
      <div class="field" style="max-width:340px;">
        <label for="aModell">Modell</label>
        <select id="aModell">
          <option value="einmalig">Einmalig für die ganze Laufzeit</option>
          <option value="monatlich">Monatlich</option>
          <option value="setup_monatlich">Einrichtung einmalig + monatlich</option>
          <option value="raten">Gesamtbetrag in Raten</option>
        </select>
      </div>
      <div class="form-grid form-grid-3" id="aVergFelder"></div>
    </div>

    <div class="card" id="aCardSchalter" hidden>
      <h2>Klauseln <small>Diese Punkte fallen im Verkaufsgespräch selten — es gibt keine Vorgabe.</small></h2>
      <div id="aSchalter"></div>
    </div>

    <div class="card" id="aCardSonstiges" hidden>
      <h2>Sonstiges</h2>
      <div class="field" style="max-width:340px;">
        <label for="aAgbStand">AGB-Stand <small>muss zur Fassung auf xponext.de passen</small></label>
        <input type="text" id="aAgbStand">
      </div>
      <details class="auftrag-freitext">
        <summary>Individuelle Vereinbarungen</summary>
        <p class="auftrag-notiz">Kommt als eigener Absatz in die Sondervereinbarungen.
           Der Wortlaut wird unverändert übernommen — hier formuliert niemand nach.</p>
        <textarea id="aFreitext" rows="4"
          placeholder="Nur ausfüllen, wenn wirklich etwas Besonderes vereinbart wurde."></textarea>
      </details>
    </div>`;

  $("aAgbStand").value = katalog.agb_stand;
  $("aStart").value = new Date().toISOString().slice(0,10);

  baueKacheln();
  baueSchalter();
  baueVergFelder();
  verdrahte();
}

function baueKacheln(){
  const ziel = $("aKacheln");
  ziel.innerHTML = "";
  for(const [id,p] of Object.entries(katalog.pakete)){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "auftrag-kachel";
    b.dataset.paket = id;
    b.setAttribute("aria-pressed","false");
    b.innerHTML = `<b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.vertraege)}</small>`;
    b.addEventListener("click", ()=>waehlePaket(id));
    ziel.appendChild(b);
  }
}

function waehlePaket(id){
  paket = id;
  document.querySelectorAll(".auftrag-kachel").forEach(b=>
    b.setAttribute("aria-pressed", String(b.dataset.paket===id)));
  ["aCardLeistungen","aCardLaufzeit","aCardVerguetung","aCardSchalter","aCardSonstiges"]
    .forEach(c=>$(c).hidden = false);
  $("auftragErzeugen").disabled = false;
  baueLeistungen();
  rechneEnde();
  aktualisiere();
}

function baueLeistungen(){
  const ziel = $("aLeistungen");
  ziel.innerHTML = "";
  for(const l of katalog.pakete[paket].leistungen){
    const zeile = document.createElement("div");
    zeile.className = "auftrag-baustein";
    zeile.innerHTML = `
      <div class="auftrag-baustein-kopf">
        <input type="checkbox" id="aL_${l.id}" ${l.standard ? "checked" : ""}>
        <label for="aL_${l.id}">${escapeHtml(l.titel)}</label>
        <span class="auftrag-quelle">${escapeHtml(l.quelle)}</span>
      </div>
      <details><summary>Wortlaut</summary>
        <p class="auftrag-volltext">${escapeHtml(l.text)}</p></details>`;
    zeile.querySelector("input").addEventListener("change", ()=>{
      baueBausteinFelder();
      aktualisiere();
    });
    ziel.appendChild(zeile);
  }
  baueBausteinFelder();
}

/* Platzhalter wie {domain} nur abfragen, wenn ein angehakter Baustein sie
   braucht — und eingetippte Werte beim Neuaufbau behalten. */
function baueBausteinFelder(){
  const noetig = new Set();
  for(const l of katalog.pakete[paket].leistungen){
    if($("aL_"+l.id)?.checked) (l.felder||[]).forEach(f=>noetig.add(f));
  }
  const ziel = $("aBausteinFelder");
  const alt = {};
  ziel.querySelectorAll("input").forEach(i=>{ alt[i.dataset.feld] = i.value; });

  const vorhanden = new Set(Object.keys(alt));
  if(noetig.size===vorhanden.size && [...noetig].every(f=>vorhanden.has(f))) return;

  ziel.innerHTML = "";
  if(!noetig.size) return;
  const namen = { domain:"Domain", cms:"Redaktionssystem" };
  const raster = document.createElement("div");
  raster.className = "form-grid";
  for(const f of noetig){
    const feld = document.createElement("div");
    feld.className = "field";
    feld.innerHTML = `<label>${escapeHtml(namen[f]||f)}
        <small>erscheint im Vertragstext</small></label>
      <input type="text" data-feld="${escapeHtml(f)}" placeholder="beispiel-buero.de">`;
    const inp = feld.querySelector("input");
    inp.value = alt[f] || "";
    inp.addEventListener("input", aktualisiere);
    raster.appendChild(feld);
  }
  ziel.appendChild(raster);
}

function baueSchalter(){
  const ziel = $("aSchalter");
  ziel.innerHTML = "";
  for(const [id,s] of Object.entries(katalog.schalter)){
    const block = document.createElement("div");
    block.className = "auftrag-schalter";
    block.innerHTML = `<h3>${escapeHtml(s.titel)}</h3>`
      + (s.hinweis ? `<p class="auftrag-notiz">${escapeHtml(s.hinweis)}</p>` : "");
    for(const o of s.optionen){
      const zeile = document.createElement("div");
      zeile.className = "auftrag-option";
      zeile.innerHTML = `
        <input type="radio" name="aS_${id}" value="${escapeHtml(o.id)}" id="aS_${id}_${o.id}">
        <label for="aS_${id}_${o.id}">${escapeHtml(o.label)}</label>
        <span class="auftrag-quelle">${escapeHtml(o.quelle)}</span>`;
      zeile.querySelector("input").addEventListener("change", aktualisiere);
      block.appendChild(zeile);
    }
    const offen = document.createElement("div");
    offen.className = "auftrag-offen";
    offen.id = "aOffen_"+id;
    offen.textContent = "noch nicht gewählt";
    block.appendChild(offen);
    ziel.appendChild(block);
  }
}

function baueVergFelder(){
  const felder = {
    einmalig:        [["gesamt","Gesamtbetrag netto"]],
    monatlich:       [["monat","Monatlich netto"],
                      ["monat_folge","Danach netto <small>leer = kein Satz</small>"]],
    setup_monatlich: [["setup","Einrichtung netto"],["monat","Monatlich netto"],
                      ["monat_folge","Danach netto <small>leer = kein Satz</small>"]],
    raten:           [["gesamt","Gesamtbetrag netto"],["raten_anzahl","Anzahl Raten"],
                      ["raten_betrag","je Rate <small>berechnet</small>"]],
  }[$("aModell").value];

  const ziel = $("aVergFelder");
  const alt = {};
  ziel.querySelectorAll("input").forEach(i=>{ alt[i.dataset.v] = i.value; });
  ziel.innerHTML = "";
  for(const [id,beschriftung] of felder){
    const feld = document.createElement("div");
    feld.className = "field";
    feld.innerHTML = `<label>${beschriftung}</label>
      <input type="text" inputmode="decimal" data-v="${id}">`;
    const inp = feld.querySelector("input");
    inp.value = alt[id] || "";
    inp.addEventListener("input", ()=>{ rechneRaten(id); aktualisiere(); });
    ziel.appendChild(feld);
  }
}

/* ---------- Rechnen ---------- */

const v = name => document.querySelector(`#aVergFelder [data-v="${name}"]`)?.value || "";

let rateVonHand = false;
function rechneRaten(geaendert){
  if(geaendert==="raten_betrag"){ rateVonHand = true; return; }
  if(rateVonHand) return;
  const gesamt = parseFloat((v("gesamt")||"").replace(/\./g,"").replace(",","."));
  const anzahl = parseInt(v("raten_anzahl"),10);
  const feld = document.querySelector('#aVergFelder [data-v="raten_betrag"]');
  if(feld && gesamt>0 && anzahl>0) feld.value = (gesamt/anzahl).toFixed(2).replace(".",",");
}

let endeVonHand = false;
function rechneEnde(){
  if(endeVonHand) return;
  const start = $("aStart").value, monate = parseInt($("aLaufzeit").value,10);
  if(!start || !monate){ $("aEnde").value = ""; return; }
  const d = new Date(start+"T12:00:00");
  d.setMonth(d.getMonth()+monate);
  d.setDate(d.getDate()-1);
  $("aEnde").value = d.toISOString().slice(0,10);
}

/* ---------- Verdrahtung ---------- */

function verdrahte(){
  ["aFirma","aStrasse","aPlzOrt","aAgbStand","aFreitext"]
    .forEach(id=>$(id).addEventListener("input", aktualisiere));
  ["aStart","aLaufzeit"].forEach(id=>
    $(id).addEventListener("change", ()=>{ rechneEnde(); aktualisiere(); }));
  $("aEnde").addEventListener("input", ()=>{ endeVonHand = true; aktualisiere(); });
  $("aModell").addEventListener("change", ()=>{ baueVergFelder(); aktualisiere(); });
  $("auftragErzeugen").addEventListener("click", erzeuge);

  // Close-Vorschläge für die Firmendaten
  let suchLauf = null;
  $("aFirma").addEventListener("input", ev=>{
    clearTimeout(suchLauf);
    const begriff = ev.target.value.trim();
    const box = $("aVorschlaege");
    if(begriff.length < 3){ box.hidden = true; return; }
    suchLauf = setTimeout(async ()=>{
      let treffer = [];
      try{
        treffer = await hole("/api/vertrag/kunden?q="+encodeURIComponent(begriff));
      }catch(e){ /* ohne CRM tippt man die Adresse eben */ }
      box.innerHTML = "";
      box.hidden = !treffer.length;
      for(const t of treffer){
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t.firma + (t.plz_ort ? " · " + t.plz_ort : "");
        b.addEventListener("click", ()=>{
          $("aFirma").value = t.firma;
          $("aStrasse").value = t.strasse;
          $("aPlzOrt").value = t.plz_ort;
          box.hidden = true;
          aktualisiere();
        });
        box.appendChild(b);
      }
    }, 350);
  });
}

/* ---------- Daten sammeln ---------- */

function sammle(){
  const leistungen = [];
  for(const l of katalog.pakete[paket].leistungen){
    if($("aL_"+l.id)?.checked) leistungen.push(l.id);
  }
  const felder = {};
  document.querySelectorAll("#aBausteinFelder input")
    .forEach(i=>{ felder[i.dataset.feld] = i.value; });

  const schalter = {};
  for(const id of Object.keys(katalog.schalter)){
    const gewaehlt = document.querySelector(`input[name="aS_${id}"]:checked`);
    schalter[id] = gewaehlt ? gewaehlt.value : null;
    const marke = $("aOffen_"+id);
    if(marke) marke.hidden = !!gewaehlt;
  }

  return {
    paket, leistungen, felder, schalter,
    kunde_firma: $("aFirma").value,
    kunde_strasse: $("aStrasse").value,
    kunde_plz_ort: $("aPlzOrt").value,
    laufzeit_monate: parseInt($("aLaufzeit").value,10),
    start: $("aStart").value,
    ende: $("aEnde").value,
    verguetung_modell: $("aModell").value,
    verguetung: {
      gesamt: v("gesamt"), monat: v("monat"), monat_folge: v("monat_folge"),
      setup: v("setup"), raten_anzahl: v("raten_anzahl"), raten_betrag: v("raten_betrag"),
    },
    agb_stand: $("aAgbStand").value,
    freitext: $("aFreitext").value,
  };
}

let vorschauLauf = null;
function aktualisiere(){
  if(!paket) return;
  clearTimeout(vorschauLauf);
  vorschauLauf = setTimeout(async ()=>{
    let antwort;
    try{
      antwort = await hole("/api/vertrag/vorschau", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(sammle()),
      });
    }catch(e){ antwort = { fehler: String(e.message || e) }; }
    $("auftragVorschau").textContent = antwort.markdown || ("Fehler: " + antwort.fehler);
  }, 180);
}

/* ---------- Erzeugen ---------- */

async function erzeuge(){
  const daten = sammle();
  if(!daten.kunde_firma.trim()) return melde(false, "Firmenname fehlt.");

  // Die Schalter haben bewusst keinen Standardwert: Ein falsch gesetztes
  // Nutzungsrecht fällt niemandem auf, weil der Vertrag trotzdem plausibel
  // aussieht.
  const offen = Object.entries(daten.schalter).filter(([,w])=>!w).map(([k])=>k);
  if(offen.length){
    return melde(false, "Noch nicht gewählt: " + offen.join(", ")
      + ". Diese Klauseln setzt der Generator nicht von selbst.");
  }

  const knopf = $("auftragErzeugen");
  knopf.disabled = true;
  knopf.textContent = "Erzeuge …";
  let e;
  try{
    e = await hole("/api/vertrag/erzeugen", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify(daten),
    });
  }catch(err){ e = { erfolg:false, fehler:String(err.message || err) }; }
  knopf.disabled = false;
  knopf.textContent = "Vertrag erzeugen";

  if(ablage === "download") return meldeDownload(e);

  melde(e.erfolg, e.erfolg
    ? "Fertig.<br><code>" + escapeHtml(e.pdf_datei) + "</code>"
    : "Markdown liegt, PDF nicht erzeugt.<br><code>"
      + escapeHtml(e.markdown_datei || "") + "</code><br>" + escapeHtml(e.fehler || ""));
}

/* Gehostet gibt es keinen Vertragsordner, in den der Server schreiben könnte.
   Stattdessen kommen die Bytes zurück und werden hier zum Herunterladen
   angeboten — PDF zum Verschicken, Markdown zum Nachbearbeiten und Ablegen. */
function meldeDownload(e){
  if(!e.erfolg && !e.markdown){
    return melde(false, "Fehlgeschlagen: " + escapeHtml(e.fehler || "unbekannt"));
  }
  const kasten = $("auftragErgebnis");
  kasten.className = "auftrag-ergebnis " + (e.erfolg ? "ist-gut" : "ist-schlecht");
  kasten.innerHTML = e.erfolg
    ? "<strong>Fertig.</strong> "
    : "<strong>PDF nicht erzeugt</strong> (" + escapeHtml(e.fehler || "") + "). Markdown geht: ";
  kasten.hidden = false;

  if(e.pdf_base64){
    kasten.appendChild(ladeKnopf("PDF herunterladen",
      base64ZuBlob(e.pdf_base64, "application/pdf"), e.dateiname + ".pdf"));
  }
  if(e.markdown){
    kasten.appendChild(ladeKnopf("Markdown herunterladen",
      new Blob([e.markdown], {type:"text/markdown"}), e.dateiname + ".md"));
  }
}

function ladeKnopf(beschriftung, blob, dateiname){
  const a = document.createElement("a");
  a.className = "auftrag-download";
  a.href = URL.createObjectURL(blob);
  a.download = dateiname;
  a.textContent = beschriftung;
  return a;
}

function base64ZuBlob(b64, typ){
  const roh = atob(b64);
  const bytes = new Uint8Array(roh.length);
  for(let i=0; i<roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return new Blob([bytes], {type:typ});
}

function melde(gut, html){
  const el = $("auftragErgebnis");
  el.className = "auftrag-ergebnis " + (gut ? "ist-gut" : "ist-schlecht");
  el.innerHTML = html;
  el.hidden = false;
}

/* ---------- Anmeldung ---------- */
// Lazy: erst beim ersten Öffnen des Reiters. Vorher weder Server fragen noch
// das Formular bauen.
document.querySelector('.tab-btn[data-view="auftraege"]')
  ?.addEventListener("click", oeffne);
