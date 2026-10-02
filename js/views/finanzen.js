/* Ansicht: Finanzen — Einnahmen, Ausgaben, Gewinn, was zurueckzulegen ist und
   was sich jeder auszahlen kann.

   Seit 01.10.2026. Die Ausgaben kommen aus den Rechnungs-Mails (Abgleich
   tools/finanzen/ im Workflow-Repo), nicht vom Geschaeftskonto — das bindet
   Tim bewusst nicht an. Gerechnet wird in state.js (finanzen, ausgabenNachLieferant);
   hier steht nur, was man sieht und anklickt. Aufbau wie der Vertrieb-Reiter:
   ein Zeitraum oben, vier Kennzahlen, ruhige Tabellen. */

import { euro, num, escapeHtml, todayIso, fmtDate, vorWieLange } from "../utils/format.js";
import { state, finanzen, ausgabenNachLieferant, monatsStart, letzterTagDesMonats } from "../state.js";
import { ausgabeSpeichern } from "../data.js";
import { openModal } from "../ui/modal.js";
import { onRender, renderAll, showErrorBanner, flashSaved } from "../ui/bus.js";

const ZEITRAUM_KEY = "xponext_finanzen_zeitraum";
const MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const KATEGORIEN = ["Software & Tools", "Leads & Daten", "Werbung", "Hardware",
                    "Beratung & Steuer", "Büro & Kommunikation", "Reise & Bewirtung", "Sonstiges"];

function monatsName(m){
  const [j, mo] = m.split("-").map(Number);
  return MONATE[mo - 1] + " " + j;
}

function vormonat(m){
  const [j, mo] = m.split("-").map(Number);
  return mo === 1 ? (j - 1) + "-12-01" : j + "-" + String(mo - 1).padStart(2, "0") + "-01";
}

function gewaehlt(){
  let wahl = null;
  try{ wahl = localStorage.getItem(ZEITRAUM_KEY); }catch(e){ /* privat/gesperrt */ }
  return ["monat", "vormonat", "jahr"].includes(wahl) ? wahl : "monat";
}

function zeitraum(){
  const wahl = gewaehlt();
  const heute = todayIso();
  if(wahl === "vormonat"){
    const m = vormonat(monatsStart(heute));
    return { wahl, von: m, bis: letzterTagDesMonats(m), name: monatsName(m) };
  }
  if(wahl === "jahr") return { wahl, von: heute.slice(0, 4) + "-01-01", bis: heute, name: heute.slice(0, 4) };
  const m = monatsStart(heute);
  return { wahl, von: m, bis: letzterTagDesMonats(m), name: monatsName(m) };
}

function eur(n){
  return (n < 0 ? "−" : "") + euro(Math.abs(n));
}

/* Nach dem Speichern den Speicher nachziehen und neu zeichnen, statt alles
   neu zu laden — die Ansicht stimmt dann sofort. */
function uebernehmen(zeile){
  const i = state.expenses.findIndex(x=>x.id === zeile.id);
  if(i >= 0) state.expenses[i] = { ...state.expenses[i], ...zeile };
  else state.expenses.push(zeile);
  renderAll();
}

/* ---------- Zeichnen ---------- */

function renderStand(){
  const el = document.getElementById("fiStand");
  const st = state.syncStatus.rechnungen;
  if(!state.finanzenTabelleDa){
    el.textContent = "sql/014 ausführen";
    el.className = "stand is-warn";
    return;
  }
  if(st && !st.ok){
    el.textContent = "Rechnungsabgleich fehlgeschlagen: " + (st.detail || "unbekannt");
    el.className = "stand is-warn";
    return;
  }
  el.textContent = st ? "Rechnungen: Abgleich " + vorWieLange(new Date(st.updated_at)) : "Rechnungsabgleich noch nicht gelaufen";
  el.className = "stand" + (st ? "" : " is-warn");
}

function renderFinanzen(){
  const z = zeitraum();
  document.querySelectorAll("#fiZeitraum [data-zeitraum]").forEach(b=>{
    b.classList.toggle("active", b.dataset.zeitraum === z.wahl);
    b.setAttribute("aria-pressed", b.dataset.zeitraum === z.wahl ? "true" : "false");
  });
  renderStand();

  const { monate, gesamt: g, einstellungen: e } = finanzen(z.von, z.bis);
  const geschaetzt = monate.flatMap(m=>m.fehlend);
  const fehlt = geschaetzt.filter(f=>f.status === "fehlt").length;
  const erwartet = geschaetzt.length - fehlt;

  document.getElementById("fiEinnahmen").textContent = eur(g.einnahmen);
  // Die Auftraege sind netto gebucht; aufs Konto kommt der Betrag mit Umsatzsteuer.
  document.getElementById("fiEinnahmenFuss").textContent = g.einnahmen > 0
    ? `netto · mit ${num(e.ust * 100, 0)} % USt ${eur(g.einnahmen * (1 + e.ust))} aufs Konto`
    : "netto, aus den Aufträgen";
  document.getElementById("fiAusgaben").textContent = eur(g.ausgaben);
  const offen = [erwartet ? `${erwartet}× erwartet` : "", fehlt ? `${fehlt}× Rechnung fehlt` : ""].filter(Boolean);
  document.getElementById("fiAusgabenFuss").textContent = "netto" +
    (offen.length ? ` · ${offen.join(", ")}, geschätzt` : "") +
    (g.pruefen ? ` · ${g.pruefen} zu prüfen` : "");
  const vorzeichen = n=>n >= 0 ? " is-plus" : " is-minus";
  const gewinnEl = document.getElementById("fiGewinn");
  gewinnEl.textContent = eur(g.gewinn);
  gewinnEl.className = "kpi-wert" + vorzeichen(g.gewinn);
  document.getElementById("fiGewinnFuss").textContent = g.einnahmen > 0
    ? "Marge " + num(g.gewinn / g.einnahmen * 100, 0) + " %"
    : "noch keine Einnahmen";
  const auszahlbarEl = document.getElementById("fiAuszahlbar");
  auszahlbarEl.textContent = eur(Math.min(g.tim, g.simon));
  auszahlbarEl.className = "kpi-wert" + vorzeichen(Math.min(g.tim, g.simon));
  document.getElementById("fiAuszahlbarFuss").textContent = e.anteilTim === 0.5
    ? `je Tim und Simon · zusammen ${eur(g.auszahlbar)}`
    : `Tim ${eur(g.tim)} · Simon ${eur(g.simon)}`;

  // Zuruecklegen — als kleine Rechnung, damit jeder Schritt nachvollziehbar ist
  document.getElementById("fiZuruecklegen").innerHTML =
    `<div>${eur(g.zuruecklegen)}</div><small>${escapeHtml(z.name)}</small>`;
  const zeile = (name, betrag, art = "")=>
    `<div class="rechnung-zeile ${art}"><span>${name}</span><span>${eur(betrag)}</span></div>`;
  document.getElementById("fiRechnung").innerHTML = `<div class="rechnung">
    ${zeile(`Umsatzsteuer auf die Einnahmen (${num(e.ust * 100, 0)} %)`, g.einnahmen * e.ust)}
    ${zeile("minus Vorsteuer aus euren Rechnungen", -g.vorsteuer)}
    ${zeile("Umsatzsteuer ans Finanzamt", Math.max(0, g.ustZahllast), "is-zwischen")}
    ${zeile(`Einkommen- und Gewerbesteuer (${num(e.ruecklage * 100, 0)} % auf den Jahresgewinn über ${eur(e.freibetrag)} · bisher ${eur(g.gewinnJahr)})`, g.steuer, "is-zwischen")}
    ${zeile(`Puffer auf ${num(e.pufferMonate, 0)} Monatsausgaben (Ziel ${eur(g.pufferZiel)}, steht ${eur(g.pufferBestand)})`, g.puffer, "is-zwischen")}
    ${zeile("Zurücklegen", g.zuruecklegen, "is-summe")}
    ${zeile("Auszahlbar nach Rücklage und Puffer", g.auszahlbar, vorzeichen(g.auszahlbar).trim())}
    ${zeile(`davon Tim (${num(e.anteilTim * 100, 0)} %)`, g.tim, "is-leise")}
    ${zeile(`davon Simon (${num((1 - e.anteilTim) * 100, 0)} %)`, g.simon, "is-leise")}
  </div>`;

  // Ausgaben nach Lieferant
  const lieferanten = ausgabenNachLieferant(z.von, z.bis);
  document.getElementById("fiLieferanten").innerHTML = lieferanten.length
    ? `<div class="table-wrap is-ruhig"><table class="ruhig">
        <thead><tr><th></th><th>Kategorie</th><th class="zahl">netto</th></tr></thead>
        <tbody>${lieferanten.map(l=>`
          <tr>
            <th scope="row">${escapeHtml(l.name)}${l.fehlt ? `<span class="rate-basis is-minus">Rechnung fehlt</span>` : ""}${l.erwartet && !l.fehlt ? `<span class="rate-basis">erwartet${l.tag ? ` am ${l.tag}.` : ""}</span>` : ""}${l.pruefen ? `<span class="rate-basis is-warn">${l.pruefen} zu prüfen</span>` : ""}</th>
            <td>${escapeHtml(l.kategorie || "–")}</td>
            <td class="zahl"><span class="rate">${eur(l.netto)}</span><span class="rate-basis">${l.rechnungen ? `${l.rechnungen} ${l.rechnungen === 1 ? "Rechnung" : "Rechnungen"}` : "geschätzt"}</span></td>
          </tr>`).join("")}
        </tbody></table></div>`
    : `<p class="leer-hinweis">${state.finanzenTabelleDa ? "Im Zeitraum noch keine Ausgaben." : "Sobald sql/014 ausgeführt ist und der Rechnungsabgleich läuft, stehen hier die Ausgaben."}</p>`;

  // Je Monat (bei "Dieser/Letzter Monat" alle Monate des Jahres bis heute — sonst stuende nur eine Zeile da)
  const jahr = z.wahl === "jahr" ? monate : finanzen(todayIso().slice(0, 4) + "-01-01", todayIso()).monate;
  const sichtbar = jahr.filter(m=>m.einnahmen || m.ausgaben).reverse();
  document.getElementById("fiMonate").innerHTML = sichtbar.length
    ? `<div class="table-wrap is-ruhig"><table class="ruhig kompakt">
        <thead><tr><th>Monat</th><th class="zahl">Einnahmen</th><th class="zahl">Ausgaben</th><th class="zahl">Gewinn</th>
          <th class="zahl">USt ans Finanzamt</th><th class="zahl">Steuer-Rücklage</th><th class="zahl">Puffer</th><th class="zahl">Auszahlbar je Person</th></tr></thead>
        <tbody>${sichtbar.map(m=>`
          <tr${m.monat === monatsStart(todayIso()) ? ' class="is-laufend"' : ""}>
            <th scope="row">${escapeHtml(monatsName(m.monat))}${m.monat === monatsStart(todayIso()) ? '<span class="rate-basis">läuft</span>' : ""}</th>
            <td class="zahl"><span class="rate">${eur(m.einnahmen)}</span></td>
            <td class="zahl"><span class="rate">${eur(m.ausgaben)}</span>${m.fehlend.length ? `<span class="rate-basis">${m.fehlend.length}× geschätzt</span>` : ""}</td>
            <td class="zahl"><span class="rate${vorzeichen(m.gewinn)}">${eur(m.gewinn)}</span>${m.einnahmen > 0 ? `<span class="rate-basis">Marge ${num(m.gewinn / m.einnahmen * 100, 0)} %</span>` : ""}</td>
            <td class="zahl"><span class="rate">${eur(Math.max(0, m.ustZahllast))}</span></td>
            <td class="zahl"><span class="rate">${eur(m.steuer)}</span></td>
            <td class="zahl"><span class="rate">${m.puffer ? eur(m.puffer) : "–"}</span></td>
            <td class="zahl"><span class="rate${vorzeichen(m.auszahlbar)}">${eur(m.auszahlbar * Math.min(e.anteilTim, 1 - e.anteilTim))}</span></td>
          </tr>`).join("")}
        </tbody></table></div>`
    : `<p class="leer-hinweis">Noch keine Monate mit Einnahmen oder Ausgaben.</p>`;
}

/* ---------- Dialoge ---------- */

function ausgabeFelder(x){
  return [
    { name:"lieferant", label:"Lieferant", type:"text", required:true, value: x ? x.lieferant || "" : "" },
    { name:"rechnungsdatum", label:"Rechnungsdatum", type:"date", required:true, value: x ? x.rechnungsdatum || "" : todayIso() },
    { name:"netto_eur", label:"Netto in Euro", type:"number", step:"0.01", required:true, value: x && x.netto_eur != null ? String(x.netto_eur) : "" },
    { name:"ust_eur", label:"Umsatzsteuer in Euro", type:"number", step:"0.01", value: x && x.ust_eur != null ? String(x.ust_eur) : "0",
      hint:"0 bei ausländischen Anbietern (Reverse Charge) und ohne Umsatzsteuer" },
    { name:"kategorie", label:"Kategorie", type:"select", options: KATEGORIEN.map(k=>[k, k]), value: x ? x.kategorie || "Sonstiges" : "Software & Tools" },
    { name:"status", label:"Zählt als Ausgabe?", type:"select",
      options:[["ok","Ja"],["verworfen","Nein, keine Ausgabe von XPONext"],["doppelt","Nein, doppelt"]], value:"ok" }
  ];
}

function nachSpeichern(w){
  const netto = Number(w.netto_eur) || 0, ust = Number(w.ust_eur) || 0;
  return {
    lieferant: w.lieferant, rechnungsdatum: w.rechnungsdatum, kategorie: w.kategorie, status: w.status,
    waehrung: "EUR", netto: netto, ust: ust, brutto: netto + ust,
    netto_eur: netto, ust_eur: ust, brutto_eur: netto + ust, grund: null
  };
}

async function neuDialog(){
  const ergebnis = await openModal({
    title: "Ausgabe ohne Rechnung",
    submitLabel: "Speichern",
    fields: ausgabeFelder(null).filter(f=>f.name !== "status"),
    onSubmit: async w=>{
      uebernehmen(await ausgabeSpeichern(nachSpeichern({ ...w, status: "ok" }), null));
      renderAll();
    }
  });
  if(ergebnis) flashSaved("fiMsg");
}

/* Alle Rechnungen, die der Abgleich nicht sicher lesen konnte, eine nach der
   anderen — mit Link zum Beleg in Drive. */
async function pruefenDialog(){
  const offen = state.expenses.filter(x=>x.status === "pruefen")
    .sort((a, b)=>String(a.rechnungsdatum || "").localeCompare(String(b.rechnungsdatum || "")));
  if(!offen.length){
    showErrorBanner("Keine Rechnung zu prüfen — alles sicher erkannt.");
    return;
  }
  const x = offen[0];
  const ergebnis = await openModal({
    title: `Rechnung prüfen (${offen.length} offen)`,
    submitLabel: "Übernehmen",
    fields: [
      { name:"hinweis", label:"Aus der Mail", type:"textarea", rows:3,
        value: [x.absender, x.betreff, x.grund ? "Hinweis: " + x.grund : "", x.drive_link ? "Beleg: " + x.drive_link : ""].filter(Boolean).join("\n") },
      ...ausgabeFelder(x)
    ],
    onSubmit: async w=>{
      uebernehmen(await ausgabeSpeichern(nachSpeichern(w), x.id));
      renderAll();
    }
  });
  if(ergebnis && state.expenses.some(e=>e.status === "pruefen")) pruefenDialog();
}

document.getElementById("fiZeitraum").addEventListener("click", ev=>{
  const b = ev.target.closest("[data-zeitraum]");
  if(!b) return;
  try{ localStorage.setItem(ZEITRAUM_KEY, b.dataset.zeitraum); }catch(e){ /* nur fuer jetzt */ }
  renderFinanzen();
});
document.getElementById("fiNeuBtn").addEventListener("click", neuDialog);
document.getElementById("fiPruefenBtn").addEventListener("click", pruefenDialog);

onRender("finanzen", renderFinanzen);
