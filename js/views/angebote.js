/* Ansicht: Angebote — Transkript rein, Angebot raus.

   Die Frage, die dieser Reiter beantwortet, ist "wie wird aus einem
   Erstgespräch ein Angebot, das nach uns klingt". Vier Schritte:

     1. Gespräch   — Transkript und die Dinge, die nie aus dem Transkript
                     kommen dürfen (Anrede, Leistung, eigene Messwerte, Heikles)
     2. Text       — das Modell entwirft Situationsteil und Lösungs-Intro;
                     alles in editierbaren Feldern
     3. Vorgehen   — Phasen aus bewährten Bausteinen oder aus dem Vorschlag
     4. Preis      — immer vom Menschen, nie aus dem Gespräch

   Rechts läuft bei jeder Änderung eine Prüfung mit: die Stilregeln, die sich
   ohne Urteil prüfen lassen, und wie voll Seite 2 ist. Sie ruft kein Modell
   und kostet nichts.

   Wie der Auftrags-Reiter bewusst NICHT bei onRender() angemeldet: Ein
   Reiterwechsel würde sonst einen fertigen Entwurf verwerfen, der eine halbe
   Minute und ein paar Cent gekostet hat. */

import { escapeHtml } from "../utils/format.js";
import { hole, sende, base64ZuBlob, ladeKnopf, IST_LOKAL } from "../utils/generator-api.js";

let katalog = null;
let aufgebaut = false;
let modellPhasen = null;    // der Phasenvorschlag aus dem Entwurf, falls vorhanden

const $ = id => document.getElementById(id);

/* ---------- Aufbau ---------- */

async function oeffne(){
  if(aufgebaut) return;
  aufgebaut = true;
  try{
    katalog = await hole("/api/angebot/katalog");
  }catch(e){
    const el = $("angebotHinweis");
    el.innerHTML = "<strong>Der Angebots-Reiter ist nicht einsatzbereit.</strong><p>"
      + escapeHtml(String(e.message || e)) + "</p>";
    el.hidden = false;
    return;
  }
  $("angebotRaster").hidden = false;
  baueFormular();
}

function baueFormular(){
  $("angebotFormular").innerHTML = `
    <div class="card">
      <h2>1 · Gespräch</h2>
      <div class="form-grid">
        <div class="field"><label for="anKunde">Kunde</label>
          <input type="text" id="anKunde" autocomplete="off" placeholder="NOESSER-PADBERG Architekten GmbH">
          <div class="auftrag-vorschlaege" id="anVorschlaege" hidden></div></div>
        <div class="field"><label for="anThema">Thema <small>für den Dateinamen</small></label>
          <input type="text" id="anThema" placeholder="Sichtbarkeit"></div>
      </div>
      <div class="form-grid form-grid-3">
        <div class="field"><label for="anAnrede">Anrede</label>
          <select id="anAnrede">
            <option value="Sie">Sie</option><option value="Ihr">Ihr</option><option value="Du">Du</option>
          </select></div>
        <div class="field"><label for="anLeistung">Leistung</label>
          <input type="text" id="anLeistung" placeholder="KI- und Google-Suche über 3 Monate"></div>
        <div class="field"><label for="anLaufzeit">Laufzeit <small>steht im PDF</small></label>
          <input type="text" id="anLaufzeit" placeholder="3 Monate"></div>
      </div>
      <div class="field">
        <label for="anTranskript">Transkript <small>komplett einfügen</small></label>
        <textarea id="anTranskript" rows="8" placeholder="Das ganze Gespräch, wie es aus der Transkription kommt."></textarea>
      </div>
      <details class="auftrag-freitext">
        <summary>Eigene Messwerte und heikle Punkte</summary>
        <div class="field" style="margin-top:.7rem">
          <label for="anZahlen">Eigene Messwerte <small>aus Analyse oder Live-Prüfung, nicht aus dem Gespräch</small></label>
          <textarea id="anZahlen" rows="3" placeholder="z. B.: Google-Profil Juli 156 Aufrufe, 15 davon auf der Website. 21 von 47 Bildern ohne Beschreibung."></textarea>
        </div>
        <div class="field">
          <label for="anHeikel">Heikel <small>kam im Gespräch vor, darf nicht benannt werden</small></label>
          <textarea id="anHeikel" rows="2" placeholder="z. B.: Mitarbeiterin ab September in Elternzeit"></textarea>
        </div>
      </details>
      <div class="auftrag-formulierzeile">
        <button type="button" class="btn" id="anEntwurf">Entwurf erstellen</button>
        <span class="auftrag-notiz" id="anEntwurfStatus">Dauert rund eine Minute und kostet 10 bis 30 Cent.</span>
      </div>
    </div>

    <div class="card" id="anCardText" hidden>
      <h2>2 · Text <small>Entwurf — bitte lesen und ändern</small></h2>
      <div class="angebot-unklar" id="anUnklar" hidden></div>
      <div class="field"><label>Untertitel <small>ohne „für [Kunde]" davor, das setzt die Vorlage</small></label>
        <input type="text" id="anSubtitle"></div>
      <label class="auftrag-formuliert-label" id="anSituationLabel">Ihre Situation</label>
      <textarea id="anSit1" rows="5"></textarea>
      <textarea id="anSit2" rows="5" style="margin-top:.5rem"></textarea>
      <textarea id="anSit3" rows="5" style="margin-top:.5rem"></textarea>
      <div class="field" style="margin-top:1rem"><label>Überschrift Seite 2</label>
        <input type="text" id="anHeadline"></div>
      <div class="field"><label>Lösungs-Intro</label>
        <textarea id="anIntro" rows="6"></textarea></div>
    </div>

    <div class="card" id="anCardVorgehen" hidden>
      <h2>3 · Vorgehen <small>drei Phasen</small></h2>
      <div class="auftrag-kacheln" id="anPhasenQuelle"></div>
      <div class="field" id="anDomainFeld" hidden style="margin-top:.8rem">
        <label for="anDomain">Domain <small>steht in den Bausteinen</small></label>
        <input type="text" id="anDomain" placeholder="beispiel-buero.de"></div>
      <div class="angebot-phasen" id="anPhasen"></div>
    </div>

    <div class="card" id="anCardPreis" hidden>
      <h2>4 · Preis <small>kommt nie aus dem Gespräch</small></h2>
      <div id="anPreise"></div>
      <div class="auftrag-formulierzeile">
        <select id="anPreisVorschlag"><option value="">+ Preiszeile aus Vorschlag …</option></select>
        <button type="button" class="btn btn-outline" id="anPreisLeer">+ leere Zeile</button>
      </div>
      <label class="auftrag-formuliert-label" style="margin-top:1.1rem">Preishinweis — Sätze anhaken</label>
      <div id="anHinweise"></div>
      <div class="field" style="margin-top:.6rem"><label>Eigener Zusatz <small>was der Betrag abdeckt, was nicht</small></label>
        <textarea id="anHinweisFrei" rows="3"></textarea></div>
      <label class="auftrag-option" style="margin-top:.4rem">
        <input type="checkbox" id="anOhneAuftrag">
        <span>Noch keine Beauftragung — Schlusssatz „Wir freuen uns auf Ihre Rückmeldung."</span>
      </label>
    </div>`;

  baueVorschlagsmenue();
  verdrahte();
}

/* ---------- Entwurf ---------- */

function angaben(){
  return {
    anrede: $("anAnrede").value,
    leistung: $("anLeistung").value.trim(),
    laufzeit: $("anLaufzeit").value.trim(),
    eigene_zahlen: $("anZahlen").value.trim(),
    heikles: $("anHeikel").value.trim(),
  };
}

async function erstelleEntwurf(){
  const transkript = $("anTranskript").value.trim();
  if(transkript.length < 200){
    $("anEntwurfStatus").textContent = "Das Transkript fehlt oder ist zu kurz.";
    return;
  }
  const knopf = $("anEntwurf");
  knopf.disabled = true;
  $("anEntwurfStatus").textContent = "Das Modell liest das Gespräch … rund eine Minute.";

  let e;
  try{ e = await sende("/api/angebot/entwurf", { transkript, angaben: angaben() }); }
  catch(err){ e = { erfolg:false, fehler:String(err.message || err) }; }
  knopf.disabled = false;

  if(!e.erfolg){
    $("anEntwurfStatus").textContent = e.fehler || "Hat nicht geklappt.";
    return;
  }
  const d = e.entwurf || {};
  const sit = d.situation_paragraphs || [];
  $("anSit1").value = sit[0] || "";
  $("anSit2").value = sit[1] || "";
  $("anSit3").value = sit[2] || "";
  $("anSubtitle").value = d.subtitle || "";
  $("anHeadline").value = d.solution_headline || "";
  $("anIntro").value = d.solution_intro || "";
  modellPhasen = d.phasen_vorschlag || null;

  const unklar = d.unklar || [];
  $("anUnklar").hidden = !unklar.length;
  $("anUnklar").innerHTML = unklar.length
    ? "<strong>Konnte das Modell nicht belegen</strong> — nachtragen oder weglassen:<ul>"
      + unklar.map(u=>"<li>" + escapeHtml(u) + "</li>").join("") + "</ul>"
    : "";

  $("anSituationLabel").textContent =
    { Sie:"Ihre Situation", Ihr:"Eure Situation", Du:"Deine Situation" }[$("anAnrede").value];
  ["anCardText","anCardVorgehen","anCardPreis"].forEach(id=>$(id).hidden = false);
  $("angebotErzeugen").disabled = false;

  baueQuellenKacheln();
  waehlePhasen(modellPhasen ? "modell" : Object.keys(katalog.phasen)[0]);
  if(!$("anPreise").children.length) vorbelegePreis();
  baueHinweise();

  const v = e.verbrauch || {};
  $("anEntwurfStatus").textContent =
    `Fertig — ${v.cent ?? "?"} Cent. Neu erstellen überschreibt die Felder unten.`;
  knopf.textContent = "Neu erstellen";
  pruefe();
}

/* ---------- Vorgehen ---------- */

function baueQuellenKacheln(){
  const ziel = $("anPhasenQuelle");
  ziel.innerHTML = "";
  const quellen = [];
  if(modellPhasen) quellen.push(["modell", "Vorschlag aus dem Gespräch", "neu formuliert"]);
  for(const [id, p] of Object.entries(katalog.phasen)) quellen.push([id, p.name, p.quelle]);
  for(const [id, name, sub] of quellen){
    const b = document.createElement("button");
    b.type = "button"; b.className = "auftrag-kachel"; b.dataset.quelle = id;
    b.innerHTML = `<b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small>`;
    b.addEventListener("click", ()=>waehlePhasen(id));
    ziel.appendChild(b);
  }
}

function fuelle(text){
  const a = { Sie:["Ihrer","Ihr","Ihnen"], Ihr:["eurer","euer","euch"], Du:["deiner","dein","dir"] }[$("anAnrede").value];
  return text.replace(/\{freigabe\}/g, a[0]).replace(/\{ihr\}/g, a[1]).replace(/\{ihnen\}/g, a[2])
             .replace(/\{domain\}/g, $("anDomain").value.trim() || "der bestehenden Adresse");
}

function waehlePhasen(quelle){
  document.querySelectorAll("#anPhasenQuelle .auftrag-kachel")
    .forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.quelle === quelle)));
  const baustein = katalog.phasen[quelle];
  $("anDomainFeld").hidden = !(baustein && (baustein.felder || []).includes("domain"));
  const phasen = quelle === "modell" ? modellPhasen : baustein.phasen;
  zeichnePhasen(phasen.map(p=>({ meta:p.meta, title:p.title, bullets:p.bullets.map(fuelle) })));
  pruefe();
}

function zeichnePhasen(phasen){
  $("anPhasen").innerHTML = phasen.map((p, i)=>`
    <div class="angebot-phase" data-i="${i}">
      <input type="text" class="an-meta" value="${escapeHtml(p.meta)}">
      <input type="text" class="an-titel" value="${escapeHtml(p.title)}">
      ${[0,1,2].map(j=>`<input type="text" class="an-bullet" value="${escapeHtml(p.bullets[j] || "")}">`).join("")}
    </div>`).join("");
  $("anPhasen").querySelectorAll("input").forEach(inp=>inp.addEventListener("input", pruefeGleich));
}

function phasen(){
  return [...document.querySelectorAll("#anPhasen .angebot-phase")].map(box=>({
    meta: box.querySelector(".an-meta").value.trim(),
    title: box.querySelector(".an-titel").value.trim(),
    bullets: [...box.querySelectorAll(".an-bullet")].map(i=>i.value.trim()).filter(Boolean),
  }));
}

/* ---------- Preis ---------- */

function baueVorschlagsmenue(){
  const sel = $("anPreisVorschlag");
  for(const [id, p] of Object.entries(katalog.preise)){
    const o = document.createElement("option");
    o.value = id; o.textContent = `${p.betrag} · ${p.label}`;
    sel.appendChild(o);
  }
}

function preisZeile(label = "", betrag = ""){
  const z = document.createElement("div");
  z.className = "angebot-preiszeile";
  z.innerHTML = `<input type="text" class="an-plabel" value="${escapeHtml(label)}" placeholder="Was genau">
                 <input type="text" class="an-pbetrag" value="${escapeHtml(betrag)}" placeholder="1.500 €">
                 <button type="button" class="angebot-weg" title="Zeile entfernen">✕</button>`;
  z.querySelector(".angebot-weg").addEventListener("click", ()=>{ z.remove(); pruefe(); });
  z.querySelectorAll("input").forEach(i=>i.addEventListener("input", pruefeGleich));
  $("anPreise").appendChild(z);
}

function vorbelegePreis(){
  // Aus der Leistung raten, welche Zeile passt — der Betrag bleibt ein Vorschlag.
  const l = $("anLeistung").value.toLowerCase();
  const p = katalog.preise;
  if(/website|webseite/.test(l)) preisZeile(p.website.label, p.website.betrag);
  if(/sichtbar|such|geo|ki-/.test(l)) preisZeile(p.sichtbarkeit.label, p.sichtbarkeit.betrag);
  if(/audit/.test(l)) preisZeile(p.audit.label, p.audit.betrag);
  if(!$("anPreise").children.length) preisZeile();
}

function baueHinweise(){
  const ziel = $("anHinweise");
  if(ziel.children.length) return;
  for(const [id, h] of Object.entries(katalog.preishinweise)){
    const z = document.createElement("label");
    z.className = "auftrag-option";
    z.innerHTML = `<input type="checkbox" data-hinweis="${id}" ${h.standard ? "checked" : ""}>
                   <span>${escapeHtml(fuelle(h.text))}</span>
                   <span class="auftrag-quelle">${escapeHtml(h.quelle)}</span>`;
    z.querySelector("input").addEventListener("change", pruefe);
    ziel.appendChild(z);
  }
}

function preisHinweis(){
  const saetze = [...document.querySelectorAll("#anHinweise input:checked")]
    .map(i=>fuelle(katalog.preishinweise[i.dataset.hinweis].text));
  const frei = $("anHinweisFrei").value.trim();
  // Der eigene Zusatz steht vorn: Er sagt, was der Betrag abdeckt. Die
  // angehakten Sätze sind die Standardklauseln dahinter.
  return [frei, ...saetze].filter(Boolean).join(" ");
}

/* ---------- Sammeln und Prüfen ---------- */

function sammle(){
  return {
    kunde: $("anKunde").value.trim(),
    thema: $("anThema").value.trim() || "Angebot",
    anrede: $("anAnrede").value,
    laufzeit: $("anLaufzeit").value.trim(),
    subtitle: $("anSubtitle").value.trim(),
    situation_paragraphs: [$("anSit1").value, $("anSit2").value, $("anSit3").value]
      .map(s=>s.trim()).filter(Boolean),
    solution_headline: $("anHeadline").value.trim(),
    solution_intro: $("anIntro").value.trim(),
    phases: phasen(),
    price_rows: [...document.querySelectorAll("#anPreise .angebot-preiszeile")]
      .map(z=>({ label: z.querySelector(".an-plabel").value.trim(),
                 betrag: z.querySelector(".an-pbetrag").value.trim() }))
      .filter(p=>p.label && p.betrag),
    price_note: preisHinweis(),
    ist_partnerschaft: !$("anOhneAuftrag").checked,
  };
}

let pruefLauf = null;
function pruefeGleich(){ clearTimeout(pruefLauf); pruefLauf = setTimeout(pruefe, 350); }

async function pruefe(){
  if($("anCardText").hidden) return;
  let r;
  try{ r = await sende("/api/angebot/pruefen", sammle()); }
  catch(e){ return; }

  const p = r.platz;
  const farbe = p.auslastung > 100 ? "low" : p.eng ? "mid" : "ok";
  $("angebotPlatz").innerHTML = `
    <div class="angebot-platz-kopf"><span>Platz auf Seite 2</span><b>${p.auslastung} %</b></div>
    <div class="bar-track"><div class="bar-fill ${farbe}" style="width:${Math.min(100, p.auslastung)}%"></div></div>
    <div class="auftrag-notiz">${p.auslastung > 100
      ? "Passt nicht auf zwei Seiten. Zuerst den Preishinweis kürzen, dann je einen Bullet pro Phase."
      : p.eng ? "Wird eng — noch einmal durchlesen, ob jeder Satz trägt." : "Genug Luft."}</div>`;

  const b = r.befunde || [];
  $("angebotBefunde").innerHTML = b.length
    ? `<div class="angebot-befunde"><strong>${b.length} ${b.length === 1 ? "Stelle" : "Stellen"} klingen nicht nach euch</strong><ul>`
      + b.map(x=>"<li>" + escapeHtml(x) + "</li>").join("") + "</ul></div>"
    : `<div class="angebot-sauber">Keine Regelverstöße gefunden. Wettbewerber im Text und
       ob die Fakten stimmen, sieht die Prüfung nicht — das bleibt Lesearbeit.</div>`;
}

/* ---------- Erzeugen ---------- */

async function erzeuge(){
  const d = sammle();
  const knopf = $("angebotErzeugen");
  if(!d.kunde) return melde(false, "Kundenname fehlt.");
  if(!d.price_rows.length && !confirm("Ohne Preis erzeugen? Der Investment-Abschnitt entfällt dann.")) return;

  knopf.disabled = true; knopf.textContent = "Erzeuge …";
  let e;
  try{ e = await sende("/api/angebot/erzeugen", d); }
  catch(err){ e = { erfolg:false, fehler:String(err.message || err) }; }
  knopf.disabled = false; knopf.textContent = "Angebot erzeugen";

  if(!e.erfolg) return melde(false, escapeHtml(e.fehler || "Hat nicht geklappt."));
  const kasten = $("angebotErgebnis");
  kasten.className = "auftrag-ergebnis ist-gut";
  kasten.hidden = false;
  kasten.innerHTML = "<strong>Fertig.</strong>"
    + (e.lokal ? `<br><code>${escapeHtml(e.lokal)}</code>` : "")
    + driveZeile(e.drive) + "<br>";
  if(e.pdf_base64){
    kasten.appendChild(ladeKnopf("PDF herunterladen",
      base64ZuBlob(e.pdf_base64, "application/pdf"), e.dateiname));
  }
}

function driveZeile(drive){
  if(!drive) return "";
  if(drive.erfolg){
    const link = drive.link ? ` <a href="${escapeHtml(drive.link)}" target="_blank" rel="noopener">öffnen</a>` : "";
    return `<br>In Drive: <strong>${escapeHtml(drive.ordner)}</strong>${drive.ordner_neu ? " (neu angelegt)" : ""}${link}`;
  }
  return `<br><span class="auftrag-drive-fehler">Nicht in Drive: ${escapeHtml(drive.fehler || "")}</span>`;
}

function melde(gut, html){
  const k = $("angebotErgebnis");
  k.className = "auftrag-ergebnis " + (gut ? "ist-gut" : "ist-schlecht");
  k.innerHTML = html; k.hidden = false;
}

/* ---------- Verdrahtung ---------- */

function verdrahte(){
  $("anEntwurf").addEventListener("click", erstelleEntwurf);
  $("angebotErzeugen").addEventListener("click", erzeuge);
  $("anPreisLeer").addEventListener("click", ()=>{ preisZeile(); });
  $("anPreisVorschlag").addEventListener("change", ev=>{
    const p = katalog.preise[ev.target.value];
    if(p) preisZeile(p.label, p.betrag);
    ev.target.value = ""; pruefe();
  });
  ["anSit1","anSit2","anSit3","anSubtitle","anHeadline","anIntro","anHinweisFrei"]
    .forEach(id=>$(id).addEventListener("input", pruefeGleich));
  $("anOhneAuftrag").addEventListener("change", pruefe);
  $("anDomain").addEventListener("input", ()=>{
    const aktiv = document.querySelector('#anPhasenQuelle [aria-pressed="true"]');
    if(aktiv && aktiv.dataset.quelle !== "modell") waehlePhasen(aktiv.dataset.quelle);
  });
  // Anrede wechselt: Bausteine und Preishinweise neu füllen
  $("anAnrede").addEventListener("change", ()=>{
    $("anHinweise").innerHTML = ""; baueHinweise();
    const aktiv = document.querySelector('#anPhasenQuelle [aria-pressed="true"]');
    if(aktiv && aktiv.dataset.quelle !== "modell") waehlePhasen(aktiv.dataset.quelle);
  });

  // Close-Vorschläge — derselbe Endpunkt wie im Auftrags-Reiter
  let suchLauf = null;
  $("anKunde").addEventListener("input", ev=>{
    clearTimeout(suchLauf);
    const begriff = ev.target.value.trim();
    const box = $("anVorschlaege");
    if(begriff.length < 3){ box.hidden = true; return; }
    suchLauf = setTimeout(async ()=>{
      let t = [];
      try{ t = await hole("/api/vertrag/kunden?q=" + encodeURIComponent(begriff)); }catch(e){}
      box.innerHTML = ""; box.hidden = !t.length;
      for(const x of t){
        const b = document.createElement("button");
        b.type = "button"; b.textContent = x.firma;
        b.addEventListener("click", ()=>{ $("anKunde").value = x.firma; box.hidden = true; });
        box.appendChild(b);
      }
    }, 350);
  });
}

/* Aufgebaut wird von js/views/dokumente.js aus, sobald dieser Teil im
   Reiter "Angebote & Verträge" zum ersten Mal sichtbar wird. */
export { oeffne as oeffneAngebot };
