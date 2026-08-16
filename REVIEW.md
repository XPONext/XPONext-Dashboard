# Review-Checkliste

Nach jedem fertigen Modul prüft ein unabhängiger Review-Durchgang gegen diese
Liste. Der Review liefert **Befunde, keine Änderungen** — was davon umgesetzt
wird, entscheidet Tim.

Jeder Befund nennt: Datei + Zeile, was konkret falsch ist, und was stattdessen
gelten sollte. Vermutungen werden als solche gekennzeichnet.

## 1. Design

- Werden ausschließlich Tokens aus `styles/tokens.css` verwendet? Keine
  hartkodierten Farben (`#…`, `rgb(…)`), keine losen px-Abstände.
- Sind Abstände aus der Spacing-Skala (`--sp-1…8`), Radien aus der Radius-Skala?
- Sind Schriftgrößen aus der Typo-Skala? Kein neues `1.35rem` nebenher.
- Werden bestehende Komponenten wiederverwendet (`.card` + Modifier, `.badge`,
  `.bar-track`/`.bar-fill`, `.t-label`) statt neue erfunden?
- Ampelfarben (rot/amber/grün) **nur** für Status, **nie** zum Einfärben von
  Kategorien. Kategorien nutzen `--series-1…6`.
- Gibt es für jede Liste und jede Auswertung einen Empty-State über
  `emptyState()`? Kein nacktes „–" und keine leere Fläche.
- Hält das Layout unter 800 px Breite?
- Ist der Fokus sichtbar (`:focus-visible`)? Sind klickbare Elemente per
  Tastatur erreichbar (keine `div`s mit Click-Handler)?

## 2. Übersichtlichkeit

- Welche **eine** Frage beantwortet dieser Screen? Steht die Antwort oben und
  ist sie die größte Zahl auf der Seite?
- Wieviele Klicks bis zur häufigsten Aktion? Geht es mit weniger?
- Gibt es Eingabefelder, Optionen oder Kennzahlen, die niemand benutzt oder die
  keine Entscheidung beeinflussen? Kandidaten benennen.
- Sind Zahlen ohne Kontext dargestellt (kein Ziel, kein Vergleich, kein
  Zeitraum)? Jede Kennzahl braucht einen Bezugspunkt.
- Ist beschriftet, **was** eine Zahl bedeutet — insbesondere dort, wo zwei
  ähnliche Größen nebeneinander stehen (Auftragswert vs. realisierter Umsatz)?
- Werden geschätzte oder unvollständige Werte als solche gekennzeichnet
  (z. B. Stundenlohn immer mit Abdeckungsgrad)?

## 3. Code

- Werden bestehende Utils genutzt statt neu geschrieben: `num`, `euro`,
  `fmtDate`, `weekLabel`, `barClass`, `weekIndexForDate`, `localDateStr`,
  `escapeHtml`?
- Landen Nutzereingaben ungeprüft in `innerHTML`? Jeder eingesetzte Wert muss
  durch `escapeHtml()`.
- Führt jede Datenänderung zuverlässig zu einem Re-Render? Kein Zustand, der
  nur nach manuellem Neuladen stimmt.
- Werden Event-Listener bei jedem Render neu registriert (Mehrfachauslösung)?
  Events gehören in `mount()`, nicht in `render()`.
- Ist `render()` idempotent — zweimal aufgerufen dasselbe Ergebnis, keine
  Nebenwirkungen?
- Gibt es tote Funktionen, ungenutzte IDs oder verwaiste CSS-Klassen aus dem
  alten Stand?
- Sind Zahlen und Datumsangaben lokal korrekt (Zeitzone: `ts` ist UTC,
  Perioden sind reine Dates)?

## 4. Daten und Fehler

- Wird jeder Supabase-Fehler **sichtbar** gemeldet (Banner/Toast), nicht nur
  `console.error`? Kein `alert()`.
- Division durch Null abgefangen? Anzeige „—" statt `NaN` oder `Infinity`.
- Werden unbekannte Werte aus alten Popup-Versionen angezeigt statt verschluckt?
- Wird beim Tab-Wechsel unnötig neu geladen? Refetch nur bei Erst-Mount oder
  expliziter Invalidierung.
- Rechnet der Code an einer Stelle mit `WEEKS`, wo er kalendarisch rechnen
  müsste? `weekIndexForDate()` liefert außerhalb des Zeitraums `-1` und Einträge
  fallen dann still aus allen Aggregaten.
- Neue Tabelle in Supabase ohne RLS-Policy liefert eine **leere Liste, keinen
  Fehler**. Wurde jede neue Tabelle mit echtem `x-app-secret`-Header getestet?

## 5. Tracker-Kopplung (nur bei Änderungen an `time_tracker/`)

- Bleibt `popup.py` abwärtskompatibel, solange Simon die alte Version laufen hat?
- Wurde `install.sh` auf beiden Macs neu ausgeführt?
- Steht in der Auswertung noch etwas Sinnvolles, wenn ein Eintrag eine
  unbekannte Kategorie enthält?
