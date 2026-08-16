# XPONext Dashboard

Das gemeinsame Tool von Tim und Simon: Wochenzahlen, Aufgaben, Projekte und
Zeittracking an einem Ort. Reines HTML, CSS und JavaScript — kein npm, kein
Build-Schritt, keine Installation.

## Öffnen

**Nicht mehr per Doppelklick.** Seit der Aufteilung in Module lädt der Browser
die Dateien nur über eine echte Adresse, nicht über `file://`. Zwei Wege:

**Im Alltag:** die gehostete Adresse aufrufen und das Team-Passwort eingeben.
Das Passwort wird im Browser gespeichert und danach nicht mehr abgefragt.

**Zum Entwickeln auf dem eigenen Rechner:**

```bash
./serve.sh
```

Dann [http://localhost:8000](http://localhost:8000) öffnen. Beenden mit `Ctrl+C`.

## Aufbau

```
index.html          Markup — sonst nichts
styles/
  tokens.css        Farben, Abstände, Radien, Schriftgrößen  ← hier ändern
  base.css          Reset, Typografie, Formulare, Tabellen
  components.css    Karten, Balken, Badges, Knöpfe, Dialog, Diagramme
  views.css         Layout je Reiter
js/
  main.js           Einstiegspunkt
  config.js         Wochen, Ziele, Kategorien           ← Zielwerte ändern
  supabase.js       Verbindung und Passwortschutz
  data.js           Laden und Speichern
  state.js          Daten im Speicher + Wochenaggregate
  router.js         Reiterwechsel
  ui/               modal, chart, bus, components
  utils/            format, weeks
  views/            dashboard, eingabe, aufgaben, projekte,
                    hebel, verlauf, zeittracking
time_tracker/       macOS-Popup, das die Zeiten erfasst (eigenes README)
test/               Rauchtest und visueller Vergleich
```

**Wo man was ändert:** Farben und Abstände nur in `styles/tokens.css`. Zielwerte
und Kategorien in `js/config.js`. Alles, was einen Reiter betrifft, in der
passenden Datei unter `js/views/`.

## Prüfen vor dem Committen

Es gibt keine klassischen Tests, aber zwei Skripte, die den größten Teil abdecken.
Beide brauchen nur Python 3 und Google Chrome.

```bash
./test/run-smoke.sh   # laden alle Module? stimmen die Zahlen? gehen die Dialoge?
```

Der Rauchtest lädt die echte `index.html`, ersetzt Supabase durch feste Testdaten
und prüft Ergebnis, Dialoge und Fehlerfälle.

Danach [CHECKLIST.md](CHECKLIST.md) einmal von Hand durchgehen — alles Interaktive
(speichern, blättern, löschen) fangen die Skripte nicht ab.

[REVIEW.md](REVIEW.md) ist die Liste, gegen die jedes fertige Modul geprüft wird.

## Daten

Alles liegt in einer geteilten Supabase-Instanz. Der Anon-Key steht im Klartext im
Code — das ist Absicht und kein Leck: Der Schutz sind RLS-Policies, die auf den
Header `x-app-secret` prüfen. **Das Team-Passwort selbst gehört nirgends ins Repo.**

Schemaänderungen macht Tim im Supabase-SQL-Editor. Wichtig dabei: Eine neue
Tabelle ohne Policy liefert eine **leere Liste ohne Fehlermeldung** — nach jedem
`create table` sofort die Policy anlegen und mit echtem Header testen.

## Fallstricke

- **Der Zeittracker läuft aus `~/.xpo-time-tracker/`, nicht aus diesem Ordner.**
  Nach Änderungen an `time_tracker/` muss `./install.sh` auf **beiden** Macs neu
  laufen, sonst schreibt die alte Version weiter alte Kategorienamen.
- **`WEEKS` in `config.js` endet am 31.12.2026.** Daten außerhalb dieses Zeitraums
  fallen still aus allen Wochenauswertungen heraus. Kalendarische Auswertungen
  dürfen sich deshalb nicht auf `WEEKS` stützen.
- **Zeitzone:** `time_entries.ts` ist UTC, die Auswertung denkt in lokalen Tagen.
  Dafür gibt es `localDateStr()` in `utils/format.js`.
- **Browser-Cache:** Beim Entwickeln in den DevTools „Disable cache" anschalten,
  sonst hältst du eine alte Version für kaputt.
