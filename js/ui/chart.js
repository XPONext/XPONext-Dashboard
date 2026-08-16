/* ============================================================
   Diagramme als Inline-SVG — ohne Bibliothek.

   Warum selbst gezeichnet: gebraucht werden Linie, Balken und Sparkline
   ueber hoechstens 25 Wochen. Eine Bibliothek waere ohne Build-Schritt ein
   CDN-Tag von 100-300 kB, und Canvas-Renderer erben die CSS-Tokens nicht —
   jede Farbe muesste doppelt gepflegt werden. SVG erbt sie direkt.

   Regeln, an die sich alle Diagramme hier halten:
   - Kategorien bekommen Farben aus --series-1..8, immer von Slot 1 an und
     nie durchgewechselt. Die Reihenfolge haelt sie auch bei Farbsehschwaeche
     auseinander und darf nicht geaendert werden.
   - Die Ampelfarben (rot/gelb/gruen) faerben NIE Kategorien. Sie bedeuten
     eine Bewertung; als Kategoriefarbe wuerde man eine Wertung hineinlesen.
   - Ab zwei Reihen gibt es immer eine Legende. Eine einzelne Reihe braucht
     keine — die Ueberschrift sagt schon, was gezeigt wird.
   - Beschriftungen tragen nie die Datenfarbe, sondern Texttoken.
   - Nur einzelne Werte beschriften (Ende, Ausreisser), nicht jeden Punkt.
   - Nie zwei Y-Achsen. Zwei Groessen unterschiedlicher Skala = zwei Diagramme.
   ============================================================ */

import { escapeHtml } from "../utils/format.js";

const NS = "http://www.w3.org/2000/svg";

/* Farbe fuer Kategorie-Index i (0-basiert). */
export function serienFarbe(i){
  return `var(--series-${(i % 8) + 1})`;
}

/* Eine runde Schrittweite oberhalb des Rohwerts: 1, 2, 2,5 oder 5 mal
   eine Zehnerpotenz. */
function netteSchrittweite(roh){
  if(!(roh > 0)) return 1;
  const stufe = Math.pow(10, Math.floor(Math.log10(roh)));
  const rest = roh / stufe;
  const faktor = rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 2.5 ? 2.5 : rest <= 5 ? 5 : 10;
  return faktor * stufe;
}

/* Y-Achse: runde Obergrenze, die sich glatt durch die Strichanzahl teilt.
   Ohne das stehen dort Werte wie 13 / 25 / 38 / 50 — rechnerisch richtig,
   aber unlesbar.

   Die Strichanzahl wird mitgewaehlt: Bei 4 Strichen liefe die Achse fuer den
   Hoechstwert 4.300 bis 8.000 und das halbe Diagramm bliebe leer; mit 5
   Strichen sind es 5.000. Genommen wird, was am wenigsten Luft laesst. */
function achse(max){
  if(!(max > 0)) return { maxY: 1, yTicks: 4 };
  let beste = null;
  [4, 5].forEach(yTicks=>{
    const maxY = netteSchrittweite(max / yTicks) * yTicks;
    // Bei gleicher Obergrenze die feinere Teilung: 0 / 0,2 / 0,4 …
    // liest sich besser als 0 / 0,25 / 0,5, das als "0,3" beschriftet wuerde.
    if(!beste || maxY <= beste.maxY) beste = { maxY, yTicks };
  });
  return beste;
}

/* Achsenbeschriftung: Nachkommastelle nur, wenn die Schrittweite sie braucht. */
function fmtAchse(n, schritt){
  const stellen = schritt != null && Math.abs(schritt % 1) > 1e-9 ? 1 : 0;
  return Number(n).toLocaleString("de-DE", { maximumFractionDigits: stellen });
}

/* Einzelwerte (Endpunktbeschriftung, Tabelle) behalten ihre Nachkommastelle.
   Vorher lief das ueber fmtAchse ohne Schrittweite — aus 22,5 Std. wurde
   dort "23", und die Tabelle widersprach damit dem Diagramm. */
function fmtWert(n){
  return Number(n).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/* Gemeinsames Geruest: Rahmen, Hilfslinien, Y-Beschriftung, Grundlinie. */
function geruest({ breite, hoehe, padL, padR, padT, padB, maxY, yTicks = 4 }){
  const plotB = breite - padL - padR;
  const plotH = hoehe - padT - padB;
  let g = "";
  for(let i = 0; i <= yTicks; i++){
    const wert = (maxY / yTicks) * i;
    const y = padT + plotH - (plotH * i) / yTicks;
    g += `<line x1="${padL}" y1="${y}" x2="${padL + plotB}" y2="${y}" class="ch-grid"/>`;
    g += `<text x="${padL - 8}" y="${y + 4}" class="ch-axis" text-anchor="end">${escapeHtml(fmtAchse(wert, maxY / yTicks))}</text>`;
  }
  g += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotB}" y2="${padT + plotH}" class="ch-base"/>`;
  return { g, plotB, plotH };
}

function legende(reihen){
  // Eine einzelne Reihe braucht keine Legende — die Ueberschrift benennt sie.
  if(reihen.length < 2) return "";
  return `<div class="ch-legend">` + reihen.map((r,i)=>
    `<span class="ch-legend-item"><span class="ch-swatch" style="background:${serienFarbe(i)}"></span>${escapeHtml(r.name)}</span>`
  ).join("") + `</div>`;
}

function rahmen(inhalt, beschreibung, legendeHtml, hoehe){
  return `<figure class="ch">
    ${legendeHtml}
    <svg viewBox="0 0 720 ${hoehe}" class="ch-svg"
         role="img" aria-label="${escapeHtml(beschreibung)}">${inhalt}</svg>
  </figure>`;
}

/* ------------------------------------------------------------
   Liniendiagramm mit optionaler Flaeche und Ziellinie.

   reihen: [{name, werte:[Zahl|null], ziel?:boolean}]
   labels: Beschriftung der X-Achse (nur jede n-te wird gezeigt)
   ------------------------------------------------------------ */
export function linienChart({ reihen, labels, hoehe = 240, flaeche = false, beschreibung = "", einheit = "" }){
  const B = 720, padL = 56, padR = 16, padT = 12, padB = 28;
  const alleWerte = reihen.flatMap(r=>r.werte).filter(v=>Number.isFinite(v));
  const { maxY, yTicks } = achse(Math.max(1, ...alleWerte));
  const { g, plotB, plotH } = geruest({ breite:B, hoehe, padL, padR, padT, padB, maxY, yTicks });

  const n = Math.max(1, labels.length - 1);
  const x = i => padL + (plotB * i) / n;
  const y = v => padT + plotH - (plotH * v) / maxY;

  let inhalt = g;

  // X-Beschriftung ausduennen, damit sich nichts ueberlappt
  const schritt = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i)=>{
    if(i % schritt !== 0 && i !== labels.length - 1) return;
    inhalt += `<text x="${x(i)}" y="${hoehe - 8}" class="ch-axis" text-anchor="middle">${escapeHtml(l)}</text>`;
  });

  reihen.forEach((r, si)=>{
    const punkte = r.werte.map((v,i)=> v == null ? null : [x(i), y(v)]).filter(Boolean);
    if(!punkte.length) return;

    // Luecken bleiben Luecken: Bei jedem fehlenden Wert beginnt ein neues
    // Teilstueck (M statt L). Vorher wurden die Nullwerte nur herausgefiltert
    // und die Linie lief durch — eine Woche ohne Eintrag sah dann aus wie eine
    // erfasste Woche mit demselben Verlauf.
    let d = "", offen = false;
    r.werte.forEach((v, i)=>{
      if(v == null){ offen = false; return; }
      d += (offen ? " L" : " M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
      offen = true;
    });
    d = d.trim();

    if(r.ziel){
      // Ziellinie: gestrichelt und in Grau — sie ist Kontext, keine Datenreihe
      inhalt += `<path d="${d}" class="ch-ziel"/>`;
      return;
    }
    if(flaeche && si === 0){
      // Nur fuellen, wenn die Reihe keine Luecke hat — sonst wuerde die
      // Flaeche ueber die Luecke hinweg suggerieren, dort seien Daten.
      const ersterWert = r.werte.findIndex(v=>v != null);
      const letzterIdx = r.werte.length - 1 - [...r.werte].reverse().findIndex(v=>v != null);
      const luecke = r.werte.slice(ersterWert, letzterIdx + 1).some(v=>v == null);
      if(!luecke){
        const unten = padT + plotH;
        inhalt += `<path d="${d} L ${punkte[punkte.length-1][0].toFixed(1)} ${unten} L ${punkte[0][0].toFixed(1)} ${unten} Z"
                    fill="${serienFarbe(si)}" opacity="0.1"/>`;
      }
    }
    inhalt += `<path d="${d}" fill="none" stroke="${serienFarbe(si)}" class="ch-linie"/>`;

    // Nur den letzten Punkt markieren und beschriften — nicht jeden.
    const letzter = punkte[punkte.length - 1];
    const letzterWert = [...r.werte].reverse().find(v=>v != null);
    inhalt += `<circle cx="${letzter[0].toFixed(1)}" cy="${letzter[1].toFixed(1)}" r="4"
                fill="${serienFarbe(si)}" class="ch-dot"/>`;
    // Liegt der letzte Punkt weit links, wuerde eine rechtsbuendige
    // Beschriftung aus der Zeichenflaeche laufen — dann links ausrichten.
    const nahAmRand = letzter[0] < padL + 90;
    inhalt += `<text x="${(letzter[0] + (nahAmRand ? 8 : -8)).toFixed(1)}" y="${(letzter[1] - 10).toFixed(1)}"
                class="ch-wert" text-anchor="${nahAmRand ? "start" : "end"}">${escapeHtml(fmtWert(letzterWert) + einheit)}</text>`;
  });

  return rahmen(inhalt, beschreibung, legende(reihen.filter(r=>!r.ziel)), hoehe);
}

/* ------------------------------------------------------------
   Gruppierte Balken.
   reihen: [{name, werte:[Zahl]}]  labels: X-Beschriftung
   ------------------------------------------------------------ */
export function balkenChart({ reihen, labels, hoehe = 240, beschreibung = "", einheit = "" }){
  const B = 720, padL = 56, padR = 16, padT = 12, padB = 28;
  const alleWerte = reihen.flatMap(r=>r.werte).filter(v=>Number.isFinite(v));
  const { maxY, yTicks } = achse(Math.max(1, ...alleWerte));
  const { g, plotB, plotH } = geruest({ breite:B, hoehe, padL, padR, padT, padB, maxY, yTicks });

  const gruppen = labels.length;
  const gruppenB = plotB / gruppen;
  const LUECKE = 2;                                   // Flaechenspalt zwischen Balken
  const balkenB = Math.min(24, (gruppenB * 0.7 - LUECKE * (reihen.length - 1)) / reihen.length);
  const basis = padT + plotH;

  let inhalt = g;
  const schritt = Math.max(1, Math.ceil(gruppen / 12));
  labels.forEach((l, i)=>{
    if(i % schritt !== 0) return;
    inhalt += `<text x="${padL + gruppenB * (i + 0.5)}" y="${hoehe - 8}" class="ch-axis" text-anchor="middle">${escapeHtml(l)}</text>`;
  });

  labels.forEach((_, gi)=>{
    const gesamtB = balkenB * reihen.length + LUECKE * (reihen.length - 1);
    const start = padL + gruppenB * (gi + 0.5) - gesamtB / 2;
    reihen.forEach((r, si)=>{
      const v = Number(r.werte[gi]) || 0;
      if(v <= 0) return;
      const h = (plotH * v) / maxY;
      const bx = start + si * (balkenB + LUECKE);
      // Oben abgerundet, an der Grundlinie eckig
      const rr = Math.min(4, h);
      inhalt += `<path d="M ${bx} ${basis} L ${bx} ${basis-h+rr} Q ${bx} ${basis-h} ${bx+rr} ${basis-h}
                 L ${bx+balkenB-rr} ${basis-h} Q ${bx+balkenB} ${basis-h} ${bx+balkenB} ${basis-h+rr}
                 L ${bx+balkenB} ${basis} Z" fill="${serienFarbe(si)}"/>`;
    });
  });

  return rahmen(inhalt, beschreibung, legende(reihen), hoehe);
}

/* ------------------------------------------------------------
   Sparkline fuer Kennzahl-Karten: nur der Verlauf, keine Achsen.
   ------------------------------------------------------------ */
export function sparkline(werte, { hoehe = 40, farbe = "var(--accent)" } = {}){
  const gefiltert = werte.filter(v=>v != null);
  if(gefiltert.length < 2) return "";
  const B = 160, pad = 4;
  const max = Math.max(...gefiltert), min = Math.min(...gefiltert, 0);
  const spanne = max - min || 1;
  const n = werte.length - 1;
  const d = werte.map((v,i)=>{
    const x = pad + ((B - pad*2) * i) / n;
    const y = hoehe - pad - ((hoehe - pad*2) * ((v||0) - min)) / spanne;
    return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
  // preserveAspectRatio="none" zieht die Linie auf die volle Breite;
  // non-scaling-stroke haelt sie dabei 2px dick statt sie mitzustauchen.
  return `<svg viewBox="0 0 ${B} ${hoehe}" preserveAspectRatio="none" class="ch-spark" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${farbe}" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"
          vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ------------------------------------------------------------
   Tabellenansicht zu einem Diagramm — die Textalternative.
   Charts mit schwachem Kontrast brauchen sie laut Pruefskript ohnehin,
   und niemand will die Rohzahlen verlieren.
   ------------------------------------------------------------ */
export function chartTabelle({ reihen, labels, spaltenTitel = "Woche" }){
  return `<details class="ch-table">
    <summary>Zahlen anzeigen</summary>
    <div class="table-wrap"><table>
      <thead><tr><th>${escapeHtml(spaltenTitel)}</th>${reihen.map(r=>`<th>${escapeHtml(r.name)}</th>`).join("")}</tr></thead>
      <tbody>${labels.map((l,i)=>
        `<tr><td>${escapeHtml(l)}</td>${reihen.map(r=>`<td>${r.werte[i] == null ? "–" : escapeHtml(fmtWert(r.werte[i]))}</td>`).join("")}</tr>`
      ).join("")}</tbody>
    </table></div>
  </details>`;
}
