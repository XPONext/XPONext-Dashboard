/* Ansicht: Vertrieb — die Kennzahlen, die steuern, fuer einen Zeitraum.

   Seit 01.10.2026 eine Seite mit EINEM Zeitraum-Schalter oben: Alle Zahlen
   darunter rechnen fuer denselben Ausschnitt und vergleichen mit dem gleich
   langen Zeitraum davor. Vorher hatte jede Karte ihren eigenen Zeitraum
   (gesamt, diese Woche, letzte 30 Tage, 4 Wochen), dazu Opportunitaetskosten,
   eine Kostentabelle je Tag und doppelte Umsatz-Kacheln — gut 3.800 Pixel,
   die man durchscrollen musste. Tim: "viel uebersichtlicher, filigran,
   einheitlich".

   Vier Kennzahlen, ein Aufbau: Bezeichnung, Wert (mit Soll, wo es eins gibt),
   schmaler Balken, Fusszeile mit Vergleich. Darunter Tim und Simon als ruhige
   Tabelle und der Verlauf je Woche (das Diagramm zeichnet views/verlauf.js).

   Soll im Zeitraum = Wochenziel aus config.js anteilig auf die Tage bis heute.
   Der Gesamtfortschritt zum Jahresziel steht im Kopf ueber allen Reitern. */

import { WEEKS, WEEKLY_TARGET, LEAD_GEN_PER_PERSON, PERSONS } from "../config.js";
import { num, euro, escapeHtml, todayIso, vorWieLange } from "../utils/format.js";
import { findCurrentWeekIndex } from "../utils/weeks.js";
import { state, termineImZeitraum, showupQuote, auftraegeImZeitraum, anrufKennzahlen,
         leadGenStunden, callsAmTag, letzterTerminAbgleich } from "../state.js";
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

/* ---------- Zeitraum ---------- */

function gewaehlt(){
  let wahl = null;
  try{ wahl = localStorage.getItem(ZEITRAUM_KEY); }catch(e){ /* privat/gesperrt */ }
  return ["woche", "4wochen", "alles"].includes(wahl) ? wahl : "4wochen";
}

/* { von, bis, tage, vor: {von, bis} | null, name } — Wochen beginnen montags
   wie in WEEKS. Verglichen wird mit genauso vielen Tagen direkt davor. */
export function zeitraum(){
  const wahl = gewaehlt();
  const bis = todayIso();
  const wi = Math.max(0, findCurrentWeekIndex());
  let von, name;
  if(wahl === "woche"){ von = WEEKS[wi][0]; name = "diese Woche"; }
  else if(wahl === "4wochen"){ von = WEEKS[Math.max(0, wi - 3)][0]; name = "4 Wochen"; }
  else { von = WEEKS[0][0]; name = "seit 13.07."; }
  if(von > bis) von = bis;
  const tage = tageZwischen(von, bis);
  const vor = wahl === "alles" || tagPlus(von, -tage) < WEEKS[0][0]
    ? null
    : { von: tagPlus(von, -tage), bis: tagPlus(von, -1) };
  return { wahl, von, bis, tage, vor, name };
}

/* ---------- Bausteine ---------- */

function quote(teil, ganz){
  return ganz ? teil / ganz : null;
}

function prozent(q){
  return q == null ? "–" : num(q * 100, 0) + " %";
}

/* Vergleich mit dem Vorzeitraum: Pfeil + Zahl, Farbe nur zusaetzlich —
   die Richtung steht als Zeichen da, nicht nur als Farbe. */
function delta(jetzt, vorher, einheit){
  if(vorher == null || jetzt == null) return "";
  const d = jetzt - vorher;
  const text = einheit === "pp" ? num(Math.abs(d) * 100, 0) + " Pp." : num(Math.abs(d), 0);
  if(Math.abs(d) < (einheit === "pp" ? 0.005 : 0.5)){
    return `<span class="delta is-gleich" title="gegenüber dem Zeitraum davor">± 0</span>`;
  }
  return `<span class="delta ${d > 0 ? "is-plus" : "is-minus"}" title="gegenüber dem Zeitraum davor">${d > 0 ? "▲" : "▼"} ${text}</span>`;
}

/* Ampelfarben nur, wo es ein Soll gibt (Erstgespraeche, Auftraege). Eine
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

/* ---------- Stand der Abgleiche ----------
   Eine Zeile oben rechts statt drei Hinweisen verstreut ueber die Seite.
   Orange, wenn etwas haengt: alter Abgleich, Fehler, abgerissener Kalender. */
function renderStand(){
  const el = document.getElementById("vtStand");
  const st = state.syncStatus;
  const warnungen = ["kalender_tim", "kalender_simon", "termine", "anrufe"]
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
  el.textContent = warnungen.length ? warnungen.join(" · ") : "Close-Abgleich " + vorWieLange(zuletzt);
  el.className = "stand" + (warnungen.length || alt ? " is-warn" : "");
}

/* ---------- Kennzahlen ---------- */

function renderKennzahlen(z){
  const soll = wochenziel => wochenziel * z.tage / 7;

  // Erstgespraeche gebucht
  const t = termineImZeitraum(z.von, z.bis);
  const tVor = z.vor ? termineImZeitraum(z.vor.von, z.vor.bis) : null;
  const tSoll = soll(WEEKLY_TARGET.termineGebucht);
  document.getElementById("statTermineGebucht").textContent = num(t.gebucht, 0);
  document.getElementById("vtTermineSoll").textContent = " / " + num(tSoll, 0);
  meter("vtTermineBar", quote(t.gebucht, tSoll));
  document.getElementById("vtTermineFuss").innerHTML =
    `${prozent(quote(t.gebucht, tSoll))} vom Soll ${delta(t.gebucht, tVor && tVor.gebucht)}`;

  // Show-up-Rate
  const q = showupQuote(z.von, z.bis);
  const qVor = z.vor ? showupQuote(z.vor.von, z.vor.bis) : null;
  document.getElementById("vtShowupQuote").textContent = prozent(q.quote);
  meter("vtShowupBar", q.quote, false);
  document.getElementById("statTermineShowup").textContent = num(t.gefuehrt, 0);
  document.getElementById("vtShowupFuss").innerHTML =
    (q.faellig ? ` von ${num(q.faellig, 0)}` : "") + " " + delta(q.quote, qVor && qVor.quote, "pp");
  document.getElementById("showupHinweis").innerHTML = q.unklar
    ? `<button type="button" class="link-btn" id="unklarBtn">${q.unklar} ohne Spur – bestätigen</button>`
    : "";

  // Auftraege
  const a = auftraegeImZeitraum(z.von, z.bis);
  const aVor = z.vor ? auftraegeImZeitraum(z.vor.von, z.vor.bis) : null;
  const aSoll = soll(WEEKLY_TARGET.closes);
  document.getElementById("statCloses").textContent = num(a.anzahl, 0);
  document.getElementById("vtAuftraegeSoll").textContent = " / " + num(aSoll, 1);
  meter("vtAuftraegeBar", quote(a.anzahl, aSoll));
  document.getElementById("vtAuftraegeFuss").innerHTML =
    `${euro(a.wert)} Auftragswert ${delta(a.anzahl, aVor && aVor.anzahl)}`;

  // Anrufe
  const c = anrufeImZeitraum(z.von, z.bis);
  const cVor = z.vor ? anrufeImZeitraum(z.vor.von, z.vor.bis) : null;
  document.getElementById("vtAnrufe").textContent = num(c.anwahlen, 0);
  meter("vtAnrufeBar", c.erreicht == null ? null : quote(c.erreicht, c.anwahlen), false);
  document.getElementById("vtAnrufeFuss").innerHTML = c.erreicht == null
    ? `aus Close-Tasks ${delta(c.anwahlen, cVor && cVor.anwahlen)}`
    : `${num(c.erreicht, 0)} erreicht · ${prozent(quote(c.erreicht, c.anwahlen))} ${delta(c.anwahlen, cVor && cVor.anwahlen)}`;
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
      <th class="zahl">Kalt → Termin</th><th class="zahl">Warm → Termin</th><th class="zahl">→ Close</th>
    </tr></thead>
    <tbody>${zeilen.map(({ name, k, lead })=>`
      <tr>
        <th scope="row">${escapeHtml(name)}</th>
        <td class="zahl"><span class="rate">${num(lead, 1)}</span><span class="rate-basis">/ ${num(leadSoll, 0)} Std.</span></td>
        <td class="zahl"><span class="rate">${num(k.anwahlen, 0)}</span></td>
        <td class="zahl">${rate(k.erreicht, k.anwahlen)}</td>
        <td class="zahl">${rate(k.terminKalt, k.kaltLeads)}</td>
        <td class="zahl">${rate(k.terminWarm, k.warmLeads)}</td>
        <td class="zahl">${rate(k.closes, k.leads)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>` + (ohne.anwahlen
    ? `<p class="tabellen-fuss">${num(ohne.anwahlen, 0)} ${ohne.anwahlen === 1 ? "Anruf lief" : "Anrufe liefen"} über eine Leitung ohne Namen und ${ohne.anwahlen === 1 ? "steht" : "stehen"} oben nicht dabei.</p>`
    : "");
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
  renderPersonen(z);
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
