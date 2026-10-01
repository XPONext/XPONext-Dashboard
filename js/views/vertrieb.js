/* Ansicht: Vertrieb — die Kennzahlen, die steuern, fuer einen Zeitraum.

   Seit 01.10.2026 eine Seite mit EINEM Zeitraum-Schalter oben: Alle Zahlen
   darunter rechnen fuer denselben Ausschnitt und vergleichen mit dem
   Zeitraum davor. Vorher hatte jede Karte ihren eigenen Zeitraum (gesamt,
   diese Woche, letzte 30 Tage, 4 Wochen), dazu Opportunitaetskosten, eine
   Kostentabelle je Tag und doppelte Umsatz-Kacheln — gut 3.800 Pixel, die man
   durchscrollen musste. Tim: "viel uebersichtlicher, filigran, einheitlich".

   Von oben nach unten:
   - vier Kennzahlen, ein Aufbau: Bezeichnung, Wert (mit Soll, wo es eins
     gibt), schmaler Balken, Fusszeile, Vergleich im Klartext ("▼ 35 Anrufe
     · −7 % ggü. 01.–24.09.") — eine nackte "35" war nicht zu verstehen
   - vom Termin zum Auftrag: Trichter (Termin, gefuehrt, Angebot, Auftrag),
     offene Angebote, und je Kanal (Cold Email / Cold Call) mit Wert je
     Termin und Aufwand je Termin
   - Cold Email nach Kampagne (Instantly)
   - Tim und Simon
   - beste Anrufzeit fuer kalte Anrufe
   - die Wochen im Zeitraum als Tabelle mit feinen Balken — Zahlen statt
     Saeulen, die man an der Achse ablesen muss

   Soll im Zeitraum = Wochenziel aus config.js anteilig auf die Tage bis heute.
   Der Gesamtfortschritt zum Jahresziel steht im Kopf ueber allen Reitern. */

import { WEEKS, WEEKLY_TARGET, LEAD_GEN_PER_PERSON, PERSONS } from "../config.js";
import { num, euro, escapeHtml, todayIso, vorWieLange, fmtDate } from "../utils/format.js";
import { findCurrentWeekIndex, weekIndexForDate } from "../utils/weeks.js";
import { state, termineImZeitraum, showupQuote, auftraegeImZeitraum, anrufKennzahlen,
         leadGenStunden, callsAmTag, letzterTerminAbgleich, kanalKennzahlen,
         wegZumAuftrag, trichter, kampagnenKennzahlen, anrufzeiten } from "../state.js";
import { onRender } from "../ui/bus.js";
import { unklarDialog } from "./termine.js";

const ZEITRAUM_KEY = "xponext_vertrieb_zeitraum";
const ABGLEICH_WARNUNG_STD = 2;
const TAG = 86400000;

function lokal(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function tagPlus(tag, n){
  const d = new Date(tag + "T12:00:00");
  d.setDate(d.getDate() + n);
  return lokal(d);
}
function tageZwischen(von, bis){
  return Math.round((new Date(bis + "T12:00:00") - new Date(von + "T12:00:00")) / TAG) + 1;
}
function spanne(von, bis){
  return von === bis ? fmtDate(von) : fmtDate(von).replace(/\.$/, "") + "–" + fmtDate(bis);
}

/* ---------- Zeitraum ---------- */

function gewaehlt(){
  let wahl = null;
  try{ wahl = localStorage.getItem(ZEITRAUM_KEY); }catch(e){ /* privat/gesperrt */ }
  return ["woche", "4wochen", "alles"].includes(wahl) ? wahl : "4wochen";
}

/* { wahl, von, bis, tage, vor: {von, bis} | null } — Wochen beginnen montags
   wie in WEEKS. Verglichen wird mit denselben Wochentagen davor: "Diese
   Woche" bis Donnerstag mit Montag bis Donnerstag der Vorwoche, "4 Wochen"
   mit den vier Wochen davor. */
export function zeitraum(){
  const wahl = gewaehlt();
  const bis = todayIso();
  const wi = Math.max(0, findCurrentWeekIndex());
  let von;
  if(wahl === "woche") von = WEEKS[wi][0];
  else if(wahl === "4wochen") von = WEEKS[Math.max(0, wi - 3)][0];
  else von = WEEKS[0][0];
  if(von > bis) von = bis;
  const tage = tageZwischen(von, bis);
  const versatz = Math.ceil(tage / 7) * 7;
  const vor = wahl === "alles" || tagPlus(von, -versatz) < WEEKS[0][0]
    ? null
    : { von: tagPlus(von, -versatz), bis: tagPlus(bis, -versatz) };
  return { wahl, von, bis, tage, vor };
}

/* ---------- Bausteine ---------- */

function quote(teil, ganz){
  return ganz ? teil / ganz : null;
}

function prozent(q){
  return q == null ? "–" : num(q * 100, 0) + " %";
}

/* Vergleich mit dem Vorzeitraum, im Klartext: Pfeil, Menge mit Einheit und
   die relative Aenderung — dazu, womit verglichen wird. Die Richtung steht
   als Zeichen da, die Farbe kommt nur dazu. */
function vergleich(elId, jetzt, vorher, z, { einzahl, mehrzahl, punkte = false }){
  const el = document.getElementById(elId);
  if(!z.vor || vorher == null || jetzt == null){
    el.innerHTML = "";
    return;
  }
  const bezug = `<span class="vgl-bezug">ggü. ${escapeHtml(spanne(z.vor.von, z.vor.bis))}</span>`;
  const d = jetzt - vorher;
  if(Math.abs(d) < (punkte ? 0.005 : 0.5)){
    el.innerHTML = `<span class="delta is-gleich">± 0 ${punkte ? "Prozentpunkte" : mehrzahl}</span> ${bezug}`;
    return;
  }
  const menge = punkte
    ? num(Math.abs(d) * 100, 0) + " Prozentpunkte"
    : num(Math.abs(d), 0) + " " + (Math.abs(d) === 1 ? einzahl : mehrzahl);
  const relativ = !punkte && vorher > 0 ? " · " + (d > 0 ? "+" : "−") + num(Math.abs(d) / vorher * 100, 0) + " %" : "";
  el.innerHTML = `<span class="delta ${d > 0 ? "is-plus" : "is-minus"}">${d > 0 ? "▲" : "▼"} ${menge}${relativ}</span> ${bezug}`;
}

/* Ampelfarben nur, wo es ein Soll gibt (Termine, Auftraege). Eine
   Show-up-Rate von 82 % oder 53 % erreichte Anrufe sind ohne Ziel keine
   Warnung — dort bleibt der Balken in der Grundfarbe. */
function meter(id, q, mitAmpel = true){
  const el = document.getElementById(id);
  const pct = q == null ? 0 : Math.max(0, Math.min(1, q)) * 100;
  el.style.width = pct + "%";
  el.className = "kpi-fill" + (q == null || !mitAmpel || q >= 1 ? "" : q >= 0.6 ? " is-warn" : " is-low");
}

function anrufeImZeitraum(von, bis){
  if(state.salesCallsOk) return anrufKennzahlen(von, bis);
  // Vor sql/011: Tagessummen aus daily_calls
  let anwahlen = 0;
  for(let t = von; t <= bis; t = tagPlus(t, 1)) anwahlen += callsAmTag(t);
  return { anwahlen, erreicht: null };
}

/* Feiner Balken in einer Tabellenzelle: Zahl rechts, Balken darunter, Laenge
   relativ zum groessten Wert der Spalte. */
function zelleMitBalken(wert, max, text){
  const breite = max > 0 ? Math.max(wert > 0 ? 3 : 0, wert / max * 100) : 0;
  return `<span class="rate">${text}</span><span class="mini-balken"><span style="width:${breite}%"></span></span>`;
}

/* ---------- Stand der Abgleiche ----------
   Eine Zeile oben rechts statt drei Hinweisen verstreut ueber die Seite.
   Orange, wenn etwas haengt: alter Abgleich, Fehler, abgerissener Kalender. */
function renderStand(){
  const el = document.getElementById("vtStand");
  const st = state.syncStatus;
  const warnungen = ["kalender_tim", "kalender_simon", "termine", "anrufe", "leads"]
    .map(k=>st[k]).filter(z=>z && !z.ok).map(z=>z.detail || "Abgleich fehlgeschlagen");
  const zuletzt = letzterTerminAbgleich();
  const alt = !zuletzt || Date.now() - zuletzt.getTime() > ABGLEICH_WARNUNG_STD * 3600000;

  if(!state.salesMeetingsOk || !state.salesCallsOk){
    el.textContent = state.salesTabelleDa
      ? "Warte auf den ersten Close-Abgleich"
      : "Alte Zählung — sql/010 und sql/011 ausführen";
    el.className = "stand is-warn";
    return;
  }
  el.textContent = warnungen.length ? warnungen.join(" · ") : "Close-Abgleich " + vorWieLange(zuletzt) + " · alle 30 Min.";
  el.className = "stand" + (warnungen.length || alt ? " is-warn" : "");
}

/* ---------- Kennzahlen ---------- */

function renderKennzahlen(z){
  const soll = wochenziel => wochenziel * z.tage / 7;

  // Termine (Erstgespraeche) gebucht
  const t = termineImZeitraum(z.von, z.bis);
  const tVor = z.vor ? termineImZeitraum(z.vor.von, z.vor.bis) : null;
  const tSoll = soll(WEEKLY_TARGET.termineGebucht);
  document.getElementById("statTermineGebucht").textContent = num(t.gebucht, 0);
  document.getElementById("vtTermineSoll").textContent = " / " + num(tSoll, 0) + " Soll";
  meter("vtTermineBar", quote(t.gebucht, tSoll));
  document.getElementById("vtTermineFuss").textContent = "nur Erstgespräche · " + prozent(quote(t.gebucht, tSoll)) + " vom Soll";
  vergleich("vtTermineVgl", t.gebucht, tVor && tVor.gebucht, z, { einzahl: "Termin", mehrzahl: "Termine" });

  // Show-up-Rate
  const q = showupQuote(z.von, z.bis);
  const qVor = z.vor ? showupQuote(z.vor.von, z.vor.bis) : null;
  document.getElementById("vtShowupQuote").textContent = prozent(q.quote);
  meter("vtShowupBar", q.quote, false);
  document.getElementById("statTermineShowup").textContent = num(t.gefuehrt, 0);
  document.getElementById("vtShowupFuss").textContent = q.faellig ? ` von ${num(q.faellig, 0)} fälligen` : "";
  vergleich("vtShowupVgl", q.quote, qVor && qVor.quote, z, { punkte: true });
  document.getElementById("showupHinweis").innerHTML = q.unklar
    ? `<button type="button" class="link-btn" id="unklarBtn">${q.unklar} ohne Spur – bestätigen</button>`
    : "";

  // Auftraege
  const a = auftraegeImZeitraum(z.von, z.bis);
  const aVor = z.vor ? auftraegeImZeitraum(z.vor.von, z.vor.bis) : null;
  const aSoll = soll(WEEKLY_TARGET.closes);
  document.getElementById("statCloses").textContent = num(a.anzahl, 0);
  document.getElementById("vtAuftraegeSoll").textContent = " / " + num(aSoll, 1) + " Soll";
  meter("vtAuftraegeBar", quote(a.anzahl, aSoll));
  document.getElementById("vtAuftraegeFuss").textContent = euro(a.wert) + " Auftragswert";
  vergleich("vtAuftraegeVgl", a.anzahl, aVor && aVor.anzahl, z, { einzahl: "Auftrag", mehrzahl: "Aufträge" });

  // Anrufe
  const c = anrufeImZeitraum(z.von, z.bis);
  const cVor = z.vor ? anrufeImZeitraum(z.vor.von, z.vor.bis) : null;
  document.getElementById("vtAnrufe").textContent = num(c.anwahlen, 0);
  meter("vtAnrufeBar", c.erreicht == null ? null : quote(c.erreicht, c.anwahlen), false);
  document.getElementById("vtAnrufeFuss").textContent = c.erreicht == null
    ? "aus Close-Tasks"
    : `${num(c.erreicht, 0)} erreicht · ${prozent(quote(c.erreicht, c.anwahlen))}`;
  vergleich("vtAnrufeVgl", c.anwahlen, cVor && cVor.anwahlen, z, { einzahl: "Anruf", mehrzahl: "Anrufe" });
}

/* ---------- Vom Termin zum Auftrag ---------- */

function zelleAnteil(teil, ganz){
  return `<span class="rate">${num(teil, 0)}</span><span class="rate-basis">${ganz ? prozent(quote(teil, ganz)) : "–"}</span>`;
}

function renderTrichter(z){
  const el = document.getElementById("vtTrichter");
  if(!state.salesLeadsOk){ el.innerHTML = ""; return; }
  const t = trichter(z.von, z.bis);
  const stufen = [
    ["Termine", t.termine, null],
    ["geführt", t.gefuehrt, t.termine],
    ["Angebot", t.angebote, t.gefuehrt],
    ["Auftrag", t.auftraege, t.angebote]
  ];
  el.innerHTML = `<div class="trichter">${stufen.map(([name, wert, vorher], i)=>`
      ${i ? `<div class="trichter-pfeil"><span>${vorher ? prozent(quote(wert, vorher)) : "–"}</span></div>` : ""}
      <div class="trichter-stufe">
        <div class="kpi-lbl">${name}</div>
        <div class="trichter-zahl">${num(wert, 0)}</div>
      </div>`).join("")}
    <div class="trichter-offen">
      <div class="kpi-lbl">Offene Angebote</div>
      <div class="trichter-zahl">${euro(t.offenWert)}</div>
      <div class="kpi-fuss">${num(t.offenAnzahl, 0)} ${t.offenAnzahl === 1 ? "Angebot" : "Angebote"}, Stand heute</div>
    </div>
  </div>`;
}

function renderKanaele(z){
  const el = document.getElementById("vtKanaele");
  const weg = document.getElementById("vtWeg");
  renderTrichter(z);
  if(!state.salesLeadsOk){
    el.innerHTML = `<p class="leer-hinweis">${state.salesLeadsTabelleDa
      ? "Der Abgleich auf Railway hat die Leads noch nicht geliefert."
      : "Sobald sql/012 in Supabase ausgeführt ist, steht hier, ob Termine und Aufträge aus Cold Emails oder Cold Calls kommen."}</p>`;
    weg.innerHTML = "";
    return;
  }
  const zeilen = kanalKennzahlen(z.von, z.bis);
  const maxTermine = Math.max(...zeilen.map(r=>r.termine), 0);
  el.innerHTML = `<div class="table-wrap is-ruhig"><table class="ruhig">
    <thead><tr>
      <th></th><th class="zahl">Termine</th><th class="zahl">geführt</th><th class="zahl">Angebot</th>
      <th class="zahl">Auftrag</th><th class="zahl">Auftragswert</th><th class="zahl">€ je Termin</th>
      <th class="zahl">Aufwand je Termin</th>
    </tr></thead>
    <tbody>${zeilen.map(r=>`
      <tr>
        <th scope="row">${escapeHtml(r.kanal)}</th>
        <td class="zahl">${zelleMitBalken(r.termine, maxTermine, num(r.termine, 0))}</td>
        <td class="zahl">${zelleAnteil(r.gefuehrt, r.termine)}</td>
        <td class="zahl">${zelleAnteil(r.angebote, r.termine)}</td>
        <td class="zahl">${zelleAnteil(r.auftraege, r.termine)}</td>
        <td class="zahl"><span class="rate">${r.wert ? euro(r.wert) : "–"}</span>${r.auftraege ? `<span class="rate-basis">${euro(r.wert / r.auftraege)} je Auftrag</span>` : ""}</td>
        <td class="zahl"><span class="rate">${r.termine ? euro(r.wert / r.termine) : "–"}</span></td>
        <td class="zahl">${r.aufwand == null
          ? `<span class="rate">–</span>`
          : `<span class="rate">${r.termine ? num(r.aufwand / r.termine, 0) : "–"}</span><span class="rate-basis">${escapeHtml(r.einheit)} · ${num(r.aufwand, 0)} gesamt</span>`}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;

  // Weg zum Auftrag: im Zeitraum, sonst ueber alles — sonst stuende in einer
  // Woche ohne Auftrag nur ein Strich.
  let w = wegZumAuftrag(z.von, z.bis), bezug = "";
  if(!w){ w = wegZumAuftrag(WEEKS[0][0], z.bis); bezug = " seit 13.07."; }
  weg.innerHTML = w
    ? `<div>${num(w.gespraeche, 0)} <small>Gespräche bis zum Auftrag</small></div>
       <small>im Schnitt${bezug} · ${num(w.auftraege, 0)} ${w.auftraege === 1 ? "Auftrag" : "Aufträge"}${w.tage != null ? " · " + num(w.tage, 0) + " Tage vom ersten Termin" : ""}</small>`
    : "";
}

/* ---------- Cold Email nach Kampagne ---------- */

function kampagnenName(name){
  // "Architekten_Garantie_Google_AK/Sued" -> "Garantie Google AK/Sued"
  return String(name || "").replace(/^Architekten_/, "").replace(/_/g, " ");
}

function renderKampagnen(z){
  const el = document.getElementById("vtKampagnen");
  if(!state.instantlyDaily.length){
    el.innerHTML = `<p class="leer-hinweis">Sobald sql/013 in Supabase ausgeführt ist und der Abgleich gelaufen ist, stehen hier die Kampagnen aus Instantly.</p>`;
    return;
  }
  const zeilen = kampagnenKennzahlen(z.von, z.bis);
  if(!zeilen.length){
    el.innerHTML = `<p class="leer-hinweis">Im Zeitraum hat keine Kampagne versendet.</p>`;
    return;
  }
  const maxSent = Math.max(...zeilen.map(r=>r.sent), 0);
  el.innerHTML = `<div class="table-wrap is-ruhig"><table class="ruhig">
    <thead><tr>
      <th>Kampagne</th><th class="zahl">Mails</th><th class="zahl">Antworten</th><th class="zahl">Interessiert</th>
      <th class="zahl">Termine</th><th class="zahl">Aufträge</th><th class="zahl">Mails je Termin</th>
    </tr></thead>
    <tbody>${zeilen.map(r=>`
      <tr>
        <th scope="row" title="${escapeHtml(r.name)}">${escapeHtml(kampagnenName(r.name))}</th>
        <td class="zahl">${zelleMitBalken(r.sent, maxSent, num(r.sent, 0))}</td>
        <td class="zahl">${zelleAnteil(r.antworten, r.sent)}</td>
        <td class="zahl"><span class="rate">${num(r.interessiert, 0)}</span></td>
        <td class="zahl"><span class="rate">${num(r.termine, 0)}</span></td>
        <td class="zahl"><span class="rate">${num(r.auftraege, 0)}</span>${r.wert ? `<span class="rate-basis">${euro(r.wert)}</span>` : ""}</td>
        <td class="zahl"><span class="rate">${r.termine && r.sent ? num(r.sent / r.termine, 0) : "–"}</span></td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

/* ---------- Beste Anrufzeit ----------
   Waermebild Wochentag x Stunde, eine Farbe von hell nach dunkel
   (Erreichbarkeit). Zellen mit wenigen Anrufen bleiben leer — zwei Anrufe
   sagen nichts ueber eine Uhrzeit. */
const ANRUF_TAGE = [[1,"Mo"],[2,"Di"],[3,"Mi"],[4,"Do"],[5,"Fr"]];
const ANRUF_STUNDEN = [8,9,10,11,12,13,14,15,16,17,18];
const MIN_ANRUFE_ZELLE = 3;
const MIN_ANRUFE_BESTE = 8;

function renderAnrufzeiten(z){
  const el = document.getElementById("vtAnrufzeiten");
  const best = document.getElementById("vtAnrufzeitBest");
  if(!state.salesCallsOk){ el.innerHTML = ""; best.innerHTML = ""; return; }
  const r = anrufzeiten(z.von, z.bis);
  const zellen = Object.entries(r).filter(([, v])=>v.n >= MIN_ANRUFE_BESTE)
    .map(([k, v])=>({ k, q: v.erreicht / v.n, n: v.n }));
  if(zellen.length){
    const top = zellen.sort((a,b)=>b.q - a.q)[0];
    const [wt, h] = top.k.split("-").map(Number);
    best.innerHTML = `<div>${ANRUF_TAGE.find(([n])=>n === wt)[1]} ${h}–${h + 1} Uhr</div>
      <small>am besten erreicht · ${prozent(top.q)} von ${num(top.n, 0)} Anrufen</small>`;
  } else {
    best.innerHTML = "";
  }
  const maxQ = Math.max(0.01, ...Object.values(r).filter(v=>v.n >= MIN_ANRUFE_ZELLE).map(v=>v.erreicht / v.n));
  el.innerHTML = `<div class="waerme" role="table" aria-label="Erreichbarkeit kalter Anrufe nach Wochentag und Uhrzeit">
    <div class="waerme-zeile waerme-kopf" role="row"><span role="columnheader"></span>${ANRUF_STUNDEN.map(h=>`<span role="columnheader">${h}</span>`).join("")}</div>
    ${ANRUF_TAGE.map(([wt, name])=>`<div class="waerme-zeile" role="row"><span class="waerme-tag" role="rowheader">${name}</span>${ANRUF_STUNDEN.map(h=>{
      const v = r[wt + "-" + h];
      if(!v || v.n < MIN_ANRUFE_ZELLE){
        return `<span class="waerme-zelle is-leer" role="cell" title="${name} ${h}–${h + 1} Uhr: ${v ? v.n : 0} Anrufe">·</span>`;
      }
      const q = v.erreicht / v.n;
      const staerke = 0.12 + 0.88 * (q / maxQ);
      return `<span class="waerme-zelle${staerke > 0.55 ? " is-dunkel" : ""}" role="cell" style="--staerke:${staerke.toFixed(2)}"
        title="${name} ${h}–${h + 1} Uhr: ${v.erreicht} von ${v.n} erreicht">${num(q * 100, 0)}</span>`;
    }).join("")}</div>`).join("")}
  </div>
  <p class="tabellen-fuss">Prozent erreichte kalte Anrufe je Stunde · leer: weniger als ${MIN_ANRUFE_ZELLE} Anrufe im Zeitraum.</p>`;
}

/* ---------- Tim & Simon ---------- */

function rate(teil, ganz){
  return `<span class="rate">${prozent(quote(teil, ganz))}</span><span class="rate-basis">${num(teil, 0)} / ${num(ganz, 0)}</span>`;
}

function renderPersonen(z){
  const el = document.getElementById("anrufPersonen");
  if(!state.salesCallsOk){
    el.innerHTML = `<p class="leer-hinweis">Sobald die Anrufe einzeln aus Close kommen, stehen hier Tim und Simon getrennt.</p>`;
    return;
  }
  const leadSoll = LEAD_GEN_PER_PERSON * z.tage / 7;
  const zeilen = PERSONS.map(([k, l])=>({ name: l, k: anrufKennzahlen(z.von, z.bis, k), lead: leadGenStunden(z.von, z.bis, k) }));
  // Anrufe ueber eine Leitung ohne Namen (kommt selten vor) stehen als
  // Fussnote, nicht als eigene Zeile — eine Zeile mit "100 %" aus einem
  // einzigen Anruf waere nur Rauschen.
  const ohne = anrufKennzahlen(z.von, z.bis, null);

  el.innerHTML = `<div class="table-wrap is-ruhig"><table class="ruhig">
    <thead><tr>
      <th></th><th class="zahl">Lead-Gen</th><th class="zahl">Anrufe</th><th class="zahl">Erreicht</th>
      <th class="zahl">Termine</th><th class="zahl">Kalt → Termin</th><th class="zahl">Warm → Termin</th><th class="zahl">→ Close</th>
    </tr></thead>
    <tbody>${zeilen.map(({ name, k, lead })=>`
      <tr>
        <th scope="row">${escapeHtml(name)}</th>
        <td class="zahl"><span class="rate">${num(lead, 1)}</span><span class="rate-basis">/ ${num(leadSoll, 0)} Std.</span></td>
        <td class="zahl"><span class="rate">${num(k.anwahlen, 0)}</span></td>
        <td class="zahl">${rate(k.erreicht, k.anwahlen)}</td>
        <td class="zahl"><span class="rate">${num(k.termine, 0)}</span><span class="rate-basis">nach Anruf</span></td>
        <td class="zahl">${rate(k.terminKalt, k.kaltLeads)}</td>
        <td class="zahl">${rate(k.terminWarm, k.warmLeads)}</td>
        <td class="zahl">${rate(k.closes, k.leads)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>` + (ohne.anwahlen
    ? `<p class="tabellen-fuss">${num(ohne.anwahlen, 0)} ${ohne.anwahlen === 1 ? "Anruf lief" : "Anrufe liefen"} über eine Leitung ohne Namen und ${ohne.anwahlen === 1 ? "steht" : "stehen"} oben nicht dabei.</p>`
    : "");
}

/* ---------- Je Woche ---------- */

function renderWochen(z){
  const el = document.getElementById("vtWochen");
  const heute = todayIso();
  const erste = Math.max(0, weekIndexForDate(z.von));
  const letzte = Math.max(erste, findCurrentWeekIndex());
  const wochen = [];
  for(let i = letzte; i >= erste; i--){
    const [von, ende] = WEEKS[i];
    const bis = ende < heute ? ende : heute;
    const t = termineImZeitraum(von, bis);
    const q = showupQuote(von, bis);
    wochen.push({
      i, von, ende, laeuft: ende >= heute,
      anrufe: anrufeImZeitraum(von, bis).anwahlen,
      termine: t.gebucht, gefuehrt: t.gefuehrt, quote: q.quote,
      auftraege: auftraegeImZeitraum(von, bis).anzahl
    });
  }
  const max = feld => Math.max(...wochen.map(w=>w[feld] || 0), 0);
  const m = { anrufe: max("anrufe"), termine: max("termine"), gefuehrt: max("gefuehrt"), auftraege: max("auftraege") };

  el.innerHTML = `<div class="table-wrap is-ruhig"><table class="ruhig wochen">
    <thead><tr>
      <th>Woche</th><th class="zahl">Anrufe</th><th class="zahl">Termine</th>
      <th class="zahl">geführt</th><th class="zahl">Show-up</th><th class="zahl">Aufträge</th>
    </tr></thead>
    <tbody>${wochen.map(w=>`
      <tr${w.laeuft ? ' class="is-laufend"' : ""}>
        <th scope="row">KW ${w.i + 1}<span class="rate-basis">${escapeHtml(spanne(w.von, w.ende))}${w.laeuft ? " · läuft" : ""}</span></th>
        <td class="zahl">${zelleMitBalken(w.anrufe, m.anrufe, num(w.anrufe, 0))}</td>
        <td class="zahl">${zelleMitBalken(w.termine, m.termine, num(w.termine, 0))}</td>
        <td class="zahl">${zelleMitBalken(w.gefuehrt, m.gefuehrt, num(w.gefuehrt, 0))}</td>
        <td class="zahl"><span class="rate">${prozent(w.quote)}</span></td>
        <td class="zahl">${zelleMitBalken(w.auftraege, m.auftraege, num(w.auftraege, 0))}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

/* ---------- Zusammen ---------- */

function renderVertrieb(){
  const z = zeitraum();
  document.querySelectorAll("#vtZeitraum [data-zeitraum]").forEach(b=>{
    b.classList.toggle("active", b.dataset.zeitraum === z.wahl);
    b.setAttribute("aria-pressed", b.dataset.zeitraum === z.wahl ? "true" : "false");
  });
  renderStand();
  renderKennzahlen(z);
  renderKanaele(z);
  renderKampagnen(z);
  renderPersonen(z);
  renderAnrufzeiten(z);
  renderWochen(z);
}

document.getElementById("vtZeitraum").addEventListener("click", ev=>{
  const b = ev.target.closest("[data-zeitraum]");
  if(!b) return;
  try{ localStorage.setItem(ZEITRAUM_KEY, b.dataset.zeitraum); }catch(e){ /* dann eben nur fuer jetzt */ }
  renderVertrieb();
});

// Der Knopf wird bei jedem Zeichnen neu gebaut — am festen Elternelement lauschen.
document.getElementById("showupHinweis").addEventListener("click", ev=>{
  if(ev.target.closest("#unklarBtn")) unklarDialog();
});

onRender("vertrieb", renderVertrieb);
