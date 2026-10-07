/* Ansicht: Finanzen — Einnahmen, Ausgaben, Gewinn, was zurueckzulegen ist und
   was sich jeder auszahlen kann.

   Seit 01.10.2026. Die Ausgaben kommen aus den Rechnungs-Mails (Abgleich
   tools/finanzen/ im Workflow-Repo), nicht vom Geschaeftskonto — das bindet
   Tim bewusst nicht an. Gerechnet wird in state.js (finanzen, ausgabenNachLieferant);
   hier steht nur, was man sieht und anklickt. Aufbau wie der Vertrieb-Reiter:
   ein Zeitraum oben, vier Kennzahlen, ruhige Tabellen.

   Seit 07.10.2026 dazu: Auszahlungen (Retainer aus config.js, bisher
   insgesamt) und Kontostaende, die Tim einmal die Woche von Hand eintraegt
   (sql/015). Die Herleitung von "Zuruecklegen" ist eingeklappt — offen
   stehen nur die beiden Ergebnisse. */

import { euro, num, escapeHtml, todayIso, fmtDate, vorWieLange } from "../utils/format.js";
import { state, finanzen, ausgabenNachLieferant, monatsStart, letzterTagDesMonats,
         auszahlungsStand, kontoStaende, geschaeftskontoAm, kontoVorschau } from "../state.js";
import { ausgabeSpeichern, kontostaendeSpeichern } from "../data.js";
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

function folgemonat(m){
  const [j, mo] = m.split("-").map(Number);
  return mo === 12 ? (j + 1) + "-01-01" : j + "-" + String(mo + 1).padStart(2, "0") + "-01";
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

const vorzeichen = n=>n >= 0 ? " is-plus" : " is-minus";
const mitVorzeichen = n=>(n > 0 ? "+" : "") + eur(n);

/* Eine Zeile der kleinen Rechnung. betrag als Zahl wird zu Euro, Text bleibt stehen. */
function zeile(name, betrag, art = ""){
  return `<div class="rechnung-zeile ${art}"><span>${name}</span><span>${typeof betrag === "number" ? eur(betrag) : betrag}</span></div>`;
}

/* "12.340,50", "12340.5", "−1.200" -> Zahl; leer -> null; Unlesbares -> NaN.
   Bewusst ein Textfeld statt eines Zahlenfelds: Dort wird aus "12.340" je
   nach Browser und Sprache 12,34 — ein Kontostand waere still um den Faktor
   tausend falsch. */
function betragLesen(text){
  let s = String(text == null ? "" : text).replace(/[€\s]/g, "").replace(/[−–]/g, "-");
  if(!s) return null;
  if(s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function tageHer(datum){
  return Math.round((new Date(todayIso() + "T12:00:00") - new Date(datum + "T12:00:00")) / 86400000);
}

/* Gespeicherte Kontostaende in den Speicher uebernehmen — derselbe Tag ersetzt
   den alten Eintrag, wie in der Datenbank. */
function staendeUebernehmen(zeilen){
  zeilen.forEach(z=>{
    const i = state.kontostaende.findIndex(x=>x.konto === z.konto && String(x.datum).slice(0, 10) === z.datum);
    if(i >= 0) state.kontostaende[i] = { ...state.kontostaende[i], ...z };
    else state.kontostaende.push(z);
  });
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
  document.getElementById("fiEinnahmen").textContent = eur(g.einnahmen);
  // Die Auftraege sind netto gebucht; aufs Konto kommt der Betrag mit Umsatzsteuer.
  document.getElementById("fiEinnahmenFuss").textContent = g.einnahmen > 0
    ? `netto · mit ${num(e.ust * 100, 0)} % USt ${eur(g.einnahmen * (1 + e.ust))} aufs Konto`
    : "netto, aus den Aufträgen";
  document.getElementById("fiAusgaben").textContent = eur(g.ausgaben);
  document.getElementById("fiAusgabenFuss").textContent =
    `netto · ${g.rechnungen} ${g.rechnungen === 1 ? "Rechnung" : "Rechnungen"}` +
    (g.pruefen ? ` · ${g.pruefen} zu prüfen` : "");
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

  // Zuruecklegen und auszahlbar — offen nur die Ergebnisse, die Rechnung dahinter
  // ist eingeklappt (Tim, 07.10.2026)
  document.getElementById("fiRuecklageSub").textContent =
    z.name + " · Steuern und Puffer bleiben auf dem Konto, der Rest darf raus";
  document.getElementById("fiZuruecklegen").textContent = eur(g.zuruecklegen);
  document.getElementById("fiZuruecklegenFuss").textContent =
    `USt ${eur(Math.max(0, g.ustZahllast))} · ESt/GewSt ${eur(g.steuer)} · Puffer ${eur(g.puffer)}`;
  const summeEl = document.getElementById("fiAuszahlbarSumme");
  summeEl.textContent = eur(g.auszahlbar);
  summeEl.className = "fp-wert" + vorzeichen(g.auszahlbar);
  const retainer = g.ausgezahlt + g.geplant;
  document.getElementById("fiAuszahlbarSummeFuss").textContent =
    (e.anteilTim === 0.5 ? `je Person ${eur(g.tim)}` : `Tim ${eur(g.tim)} · Simon ${eur(g.simon)}`) +
    (retainer ? ` · Retainer ${eur(retainer)}` : "");
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
            <th scope="row">${escapeHtml(l.name)}${l.pruefen ? `<span class="rate-basis is-warn">${l.pruefen} zu prüfen</span>` : ""}</th>
            <td>${escapeHtml(l.kategorie || "–")}</td>
            <td class="zahl"><span class="rate">${eur(l.netto)}</span><span class="rate-basis">${l.rechnungen} ${l.rechnungen === 1 ? "Rechnung" : "Rechnungen"}</span></td>
          </tr>`).join("")}
        </tbody></table></div>`
    : `<p class="leer-hinweis">${state.finanzenTabelleDa ? "Im Zeitraum noch keine Ausgaben." : "Sobald sql/014 ausgeführt ist und der Rechnungsabgleich läuft, stehen hier die Ausgaben."}</p>`;

  // Je Monat (bei "Dieser/Letzter Monat" alle Monate des Jahres bis heute — sonst stuende nur eine Zeile da)
  const jahr = z.wahl === "jahr" ? monate : finanzen(todayIso().slice(0, 4) + "-01-01", todayIso()).monate;
  const sichtbar = jahr.filter(m=>m.einnahmen || m.ausgaben || m.ausgezahlt || m.geplant).reverse();
  document.getElementById("fiMonate").innerHTML = sichtbar.length
    ? `<div class="table-wrap is-ruhig"><table class="ruhig kompakt">
        <thead><tr><th>Monat</th><th class="zahl">Einnahmen</th><th class="zahl">Ausgaben</th><th class="zahl">Gewinn</th>
          <th class="zahl">USt ans Finanzamt</th><th class="zahl">Steuer-Rücklage</th><th class="zahl">Puffer</th><th class="zahl">Auszahlbar je Person</th><th class="zahl">Ausgezahlt je Person</th></tr></thead>
        <tbody>${sichtbar.map(m=>`
          <tr${m.monat === monatsStart(todayIso()) ? ' class="is-laufend"' : ""}>
            <th scope="row">${escapeHtml(monatsName(m.monat))}${m.monat === monatsStart(todayIso()) ? '<span class="rate-basis">läuft</span>' : ""}</th>
            <td class="zahl"><span class="rate">${eur(m.einnahmen)}</span></td>
            <td class="zahl"><span class="rate">${eur(m.ausgaben)}</span>${m.rechnungen ? `<span class="rate-basis">${m.rechnungen} ${m.rechnungen === 1 ? "Rechnung" : "Rechnungen"}</span>` : ""}</td>
            <td class="zahl"><span class="rate${vorzeichen(m.gewinn)}">${eur(m.gewinn)}</span>${m.einnahmen > 0 ? `<span class="rate-basis">Marge ${num(m.gewinn / m.einnahmen * 100, 0)} %</span>` : ""}</td>
            <td class="zahl"><span class="rate">${eur(Math.max(0, m.ustZahllast))}</span></td>
            <td class="zahl"><span class="rate">${eur(m.steuer)}</span></td>
            <td class="zahl"><span class="rate">${m.puffer ? eur(m.puffer) : "–"}</span></td>
            <td class="zahl"><span class="rate${vorzeichen(m.auszahlbar)}">${eur(m.auszahlbar * Math.min(e.anteilTim, 1 - e.anteilTim))}</span></td>
            <td class="zahl"><span class="rate">${m.ausgezahlt || m.geplant ? eur(m.ausgezahlt + m.geplant) : "–"}</span>${m.geplant ? `<span class="rate-basis">am ${fmtDate(m.auszahlungstag)} geplant</span>` : ""}</td>
          </tr>`).join("")}
        </tbody></table></div>`
    : `<p class="leer-hinweis">Noch keine Monate mit Einnahmen oder Ausgaben.</p>`;

  renderAuszahlungen();
  renderKonten();
}

/* Bisher insgesamt, unabhaengig vom Zeitraum oben: Tims Frage war, wie viel
   schon raus ist — nicht, wie viel in diesem Monat. */
function renderAuszahlungen(){
  const a = auszahlungsStand();
  const kopf = document.getElementById("fiAusgezahlt");
  const box = document.getElementById("fiAuszahlungen");
  if(!a.regel){
    document.getElementById("fiAuszahlungSub").textContent = "Noch keine Auszahlungen hinterlegt";
    kopf.innerHTML = box.innerHTML = "";
    return;
  }
  document.getElementById("fiAuszahlungSub").textContent = a.regel.jePerson > 0
    ? `Retainer je Person ${eur(a.regel.jePerson)} am ${a.regel.tag}. jedes Monats, seit ${monatsName(a.seit)}`
    : `Ausgesetzt — Retainer seit ${monatsName(a.seit)}`;
  kopf.innerHTML = `<div>${eur(a.jePerson)}</div><small>je Person bisher</small>`;
  box.innerHTML = `<div class="rechnung">
    ${zeile(`Tim und Simon zusammen` + (a.anzahl ? ` · ${a.anzahl} ${a.anzahl === 1 ? "Monat" : "Monate"}` : ""), a.zusammen)}
    ${a.naechste ? zeile(`Nächste Auszahlung am ${fmtDate(a.naechste.datum)}`, "je " + eur(a.naechste.jePerson)) : ""}
    ${zeile("Noch auszahlbar je Person", a.spielraum, "is-summe" + vorzeichen(a.spielraum))}
  </div>
  <p class="tabellen-fuss${a.spielraum < 0 ? " is-minus" : ""}">${a.spielraum < 0
    ? `Mehr ausgezahlt, als nach Rücklage und Puffer verdient war (${eur(a.verdient)} je Person) — das geht vom Puffer ab.`
    : `Verdient nach Rücklage und Puffer seit dem ersten Umsatz: ${eur(a.verdient)} je Person, abzüglich der Auszahlungen.`}</p>`;
}

/* Konten — keins ist angebunden. Das Geschaeftskonto schreibt
   geschaeftskontoAm() ab dem letzten eingetragenen Stand fort; die Herleitung
   und was als Naechstes kommt, stehen eingeklappt darunter. Die anderen tragt
   ihr von Hand ein: je Konto der neueste Stand und die Veraenderung seit dem
   Eintrag davor, gelb ab zehn Tagen ohne neuen Stand. */
function renderKonten(){
  const box = document.getElementById("fiKonten");
  const auf = document.getElementById("fiKontoAuf");
  document.getElementById("fiKontenBtn").hidden = !state.kontenTabelleDa;
  auf.hidden = true;
  if(!state.kontenTabelleDa){
    box.innerHTML = `<p class="leer-hinweis">Für die Kontostände einmal sql/015_kontostaende.sql im Supabase-SQL-Editor ausführen.</p>`;
    return;
  }
  const heute = todayIso();
  const gk = geschaeftskontoAm(heute);
  const konten = kontoStaende().map(k=>({ ...k, wert: k.gerechnet ? (gk ? gk.betrag : null) : (k.aktuell ? k.aktuell.betrag : null) }));
  if(!konten.some(k=>k.wert != null)){
    box.innerHTML = `<p class="leer-hinweis">Noch kein Stand eingetragen — oben rechts auf „Stände eintragen".</p>`;
    return;
  }
  const vorschauBis = letzterTagDesMonats(folgemonat(monatsStart(heute)));
  const vorschau = kontoVorschau(vorschauBis);

  const zeilen = konten.map(k=>{
    if(k.wert == null){
      return `<tr><th scope="row">${escapeHtml(k.name)}<span class="rate-basis">noch kein Stand</span></th>
        <td class="zahl"><span class="rate">–</span></td></tr>`;
    }
    const minus = k.wert < 0 ? " is-minus" : "";
    if(k.gerechnet){
      const naechste = vorschau[0];
      const basis = gk.anker.datum === heute ? "Stand heute" : `gerechnet ab Stand ${fmtDate(gk.anker.datum)}`;
      return `<tr>
        <th scope="row">${escapeHtml(k.name)}<span class="rate-basis">${basis}</span></th>
        <td class="zahl"><span class="rate${minus}">${eur(k.wert)}</span>${naechste
          ? `<span class="rate-basis">${mitVorzeichen(naechste.betrag)} am ${fmtDate(naechste.datum)}</span>` : ""}</td>
      </tr>`;
    }
    const alt = tageHer(k.aktuell.datum);
    const stand = alt === 0 ? "Stand heute" : `Stand ${fmtDate(k.aktuell.datum)}` + (alt > 10 ? ` · vor ${alt} Tagen` : "");
    const diff = k.vorher ? k.aktuell.betrag - k.vorher.betrag : null;
    const veraenderung = diff === null ? ""
      : `<span class="rate-basis">${diff === 0 ? "unverändert" : (diff > 0 ? "▲ " : "▼ ") + euro(Math.abs(diff))} seit ${fmtDate(k.vorher.datum)}</span>`;
    return `<tr>
      <th scope="row">${escapeHtml(k.name)}<span class="rate-basis${alt > 10 ? " is-warn" : ""}">${stand}</span></th>
      <td class="zahl"><span class="rate${minus}">${eur(k.wert)}</span>${veraenderung}</td>
    </tr>`;
  });
  const mitWert = konten.filter(k=>k.wert != null);
  const summe = mitWert.reduce((s, k)=>s + k.wert, 0);
  box.innerHTML = `<div class="table-wrap is-ruhig"><table class="ruhig">
    <tbody>${zeilen.join("")}${mitWert.length > 1
      ? `<tr class="is-summe"><th scope="row">Zusammen</th><td class="zahl"><span class="rate${summe < 0 ? " is-minus" : ""}">${eur(summe)}</span></td></tr>` : ""}
    </tbody></table></div>`;

  if(!gk) return;
  // Herleitung: vom eingetragenen Stand bis heute, dann was sicher kommt
  auf.hidden = false;
  const titel = t=>`<p class="rechnung-titel">${t}</p>`;
  let stand = gk.betrag;
  document.getElementById("fiKontoRechnung").innerHTML =
    titel(`Seit dem letzten Stand`) + `<div class="rechnung">
      ${zeile(`Eingetragen am ${fmtDate(gk.anker.datum)}`, gk.anker.betrag)}
      ${zeile(`Zahlungseingänge (${gk.zahlungen}, brutto)`, mitVorzeichen(gk.ein))}
      ${zeile(`Rechnungen (${gk.rechnungen}, brutto)`, mitVorzeichen(-gk.raus))}
      ${zeile("Auszahlungen an Tim und Simon", mitVorzeichen(-gk.ausgezahlt))}
      ${gk.umbuchungen.map(u=>zeile(u.betrag > 0 ? `Aufs ${escapeHtml(u.name)} umgebucht` : `Vom ${escapeHtml(u.name)} zurück`,
                                    mitVorzeichen(-u.betrag))).join("")}
      ${zeile("Geschäftskonto heute", gk.betrag, "is-summe")}
    </div>` +
    (vorschau.length ? titel(`Als Nächstes, bis ${fmtDate(vorschauBis)}`) + `<div class="rechnung">
      ${vorschau.map(v=>{
        stand += v.betrag;
        return zeile(`${fmtDate(v.datum)} · ${escapeHtml(v.was.join(", "))}`, mitVorzeichen(v.betrag));
      }).join("")}
      ${zeile(`Stand am ${fmtDate(vorschauBis)}, ohne neue Rechnungen`, stand, "is-summe")}
    </div>` : "");
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

/* Alle Konten in einem Dialog — eingetragen wird einmal die Woche, meist alle
   zusammen. Leere Felder bleiben, wie sie sind: Ein vorausgefuellter alter
   Wert bekaeme sonst still das neue Datum und saehe frisch aus. */
async function kontenDialog(){
  const konten = kontoStaende();
  const feld = k=>"konto_" + k.key;
  const ergebnis = await openModal({
    title: "Kontostände eintragen",
    submitLabel: "Speichern",
    fields: [
      { name:"datum", label:"Stand vom", type:"date", required:true, value: todayIso(),
        hint:"Steht für den Tag schon ein Stand, wird er überschrieben." },
      ...konten.map((k, i)=>{
        const gk = k.gerechnet ? geschaeftskontoAm(todayIso()) : null;
        return {
          name: feld(k), label: k.name + " in Euro", type:"text",
          placeholder: gk ? `gerechnet ${eur(gk.betrag)}`
            : k.aktuell ? `zuletzt ${eur(k.aktuell.betrag)} am ${fmtDate(k.aktuell.datum)}` : "noch kein Stand",
          hint: k.gerechnet ? "Rechnet das Dashboard selbst weiter — nur eintragen, wenn es nicht stimmt."
            : i === konten.length - 1 ? "Leer lassen, was sich nicht geändert hat." : ""
        };
      })
    ],
    validate: w=>{
      if(w.datum > todayIso()) return "Der Stand kann nicht in der Zukunft liegen.";
      const unlesbar = konten.find(k=>Number.isNaN(betragLesen(w[feld(k)])));
      if(unlesbar) return `„${unlesbar.name}" bitte als Betrag eintragen, z. B. 12.340,50.`;
      if(!konten.some(k=>betragLesen(w[feld(k)]) != null)) return "Bitte mindestens einen Kontostand eintragen.";
      return null;
    },
    onSubmit: async w=>{
      const zeilen = konten.filter(k=>betragLesen(w[feld(k)]) != null)
        .map(k=>({ konto: k.key, datum: w.datum, betrag: betragLesen(w[feld(k)]) }));
      await kontostaendeSpeichern(zeilen);
      staendeUebernehmen(zeilen);
      renderAll();
    }
  });
  if(ergebnis) flashSaved("fiKontenMsg");
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
document.getElementById("fiKontenBtn").addEventListener("click", kontenDialog);

onRender("finanzen", renderFinanzen);
