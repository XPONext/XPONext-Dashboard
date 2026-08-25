# Stand

Kurzer Zettel zum Wiedereinsteigen.

## Erledigt

**Fundament.** `index.html` von 1911 auf ~330 Zeilen, 20 Module unter `js/` und
`styles/`. Design-Tokens, ein nativer `<dialog>` statt sechs handgebauter
Modals, Diagramm-Modul, Rauchtest (27 Fälle) und Popup-Test.

**Von den fünf ursprünglichen Punkten:**

| | |
|---|---|
| ✅ Zeittracker → Kunden + Stundenlohn | Kunden-Reiter, `sql/001` ausgeführt |
| ✅ Zeittracking übersichtlicher, Popup entrümpelt | drei Fenster statt vier |
| ✅ Hebel-Modul | Wochenverlauf, Eingabe in Viertelstunden |
| ✅ Verlauf ansehnlicher | Diagramme, CSV-Export, gefaltete Tabellen |
| ✅ Projektmodul ausbauen | Fortschritt, Fristen, Auslastung, Kundenbezug |
| ✅ Board je Kunde und Projekt | Kunde → Projekte → eigenes Board; Schritte sind jetzt Karten |

**Zustand der Datenbank:** `customers`, `revenues`, `tracker_options` stehen
und sind abgesichert (ohne Team-Passwort liefert keine Tabelle Daten).
`zuordnung_optionen` ist jetzt eine Sicht auf `customers` — Kunden pflegst du
im Dashboard, das Popup zieht sie automatisch.

`main` ist aktuell und gepusht. Rücksprungpunkt: `git checkout vor-modul-split`.

## Offen

0. **`sql/004_boards.sql` ausführen** — Spalten für Beschreibung, Frist und
   Kundenbezug an den Aufgaben, und der Umzug der Projekt-Schritte in die
   Aufgaben. **`sql/002` muss NICHT separat laufen, 004 holt es nach.**
   Legt nur an und kopiert, löscht nichts; beliebig oft wiederholbar. Am Ende
   stehen vier Gegenproben — steht dort irgendwo „NEIN" oder „PRUEFEN":
   stoppen und nachsehen.
0b. **`sql/005` erst in ein paar Wochen** — benennt die dann leere Tabelle
   `project_steps` in `project_steps_alt` um. Nicht früher: ein Browser mit
   altem Cache liest sie sonst noch und zeigt leere Projekte.
1. **Simon:** `git pull` und `./install.sh` — Anleitung in
   [time_tracker/README.md](time_tracker/README.md).
2. **Kundennamen aufräumen:** `chuong`, `protours`, `wotka`,
   `kkk_architektur` stehen klein geschrieben in der Liste. Umbenennen im
   Kunden-Reiter ist gefahrlos — die Zeiteinträge hängen an der ID.
3. **Umsätze eintragen**, sonst bleibt der Stundenlohn leer.
4. **Durchklicken:** [CHECKLIST.md](CHECKLIST.md).

## Kurzbefehle

```bash
./serve.sh              # lokal öffnen (Doppelklick geht nicht mehr)
./test/run-smoke.sh     # laden alle Module? stimmen die Zahlen?
python3 test/test-popup.py
```
