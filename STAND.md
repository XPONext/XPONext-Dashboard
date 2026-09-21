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

**Zustand der Datenbank:** `customers`, `revenues`, `tracker_options` stehen
und sind abgesichert (ohne Team-Passwort liefert keine Tabelle Daten).
`zuordnung_optionen` ist jetzt eine Sicht auf `customers` — Kunden pflegst du
im Dashboard, das Popup zieht sie automatisch.

`main` ist aktuell und gepusht. Rücksprungpunkt: `git checkout vor-modul-split`.

## Offen

0. **`sql/002_projekte.sql` ausführen** — drei zusätzliche Spalten für
   Fristen an Schritten, Aufgaben-Verknüpfung und Kundenbezug. Legt nur an,
   löscht nichts.
1. **Simon:** `git pull` und `./install.sh` — Anleitung in
   [time_tracker/README.md](time_tracker/README.md).
2. **Kundennamen aufräumen:** `chuong`, `protours`, `wotka`,
   `kkk_architektur` stehen klein geschrieben in der Liste. Umbenennen im
   Kunden-Reiter ist gefahrlos — die Zeiteinträge hängen an der ID.
3. **Umsätze eintragen**, sonst bleibt der Stundenlohn leer.
4. **Durchklicken:** [CHECKLIST.md](CHECKLIST.md).

## Aufbau seit 19.09.2026

Fünf Reiter, sortiert nach der Frage, die sie beantworten — nicht nach der
Datenquelle:

| Reiter | Frage | Enthält |
|---|---|---|
| Heute | Wo stehe ich jetzt? | Opportunitätskosten, Calls heute, Zeit heute, Wochenprojekt, Commitments (Woche mit ‹ › blätterbar) |
| Vertrieb | Kommen wir ans Ziel? | Wochenkacheln, Umsatz gegen Ziel, Vertrieb je Woche, Calls, Kostentabelle, Bestenliste |
| Kunden | Wer lohnt sich? | Stundenlohn je Kunde, Umsätze, Zeiterfassung nach Kunde |
| Arbeit | Woran arbeiten wir? | Hebel-Stand, Aufgaben-Board und Projekte als Umschalter |
| Verlauf | Wie entwickelt es sich? | Stunden je Woche, Hebel je Woche, Tabellen, CSV |

**Im Kunden-Reiter seit 19.09.2026:** Stundensatz je Leistung (Webseite vs.
Ads vs. GEO), Stundenbudget je Auftrag (Betrag ÷ Ziel-Stundensatz, Warnung ab
80 %) und Zeit-Mix je Kunde (Anteil Kommunikation). Braucht `sql/006`.

**„+ Nachtragen"** in der Seitenleiste öffnet einen Dialog mit allem, was ein
verpasstes Popup nicht erfasst hat: Termine, Lead-Gen-Stunden, Hebel, Calls.

**Was automatisch kommt:** Zeit je Kunde, Hebel-Stunden und Lead-Gen-Stunden
(Zeit auf „Neukunden") aus dem Zeittracker; Calls und die Tagesvorgabe aus
Close. Von Hand bleiben nur Termine gebucht und Show-ups.

## Kurzbefehle

```bash
./serve.sh              # lokal öffnen (Doppelklick geht nicht mehr)
./test/run-smoke.sh     # laden alle Module? stimmen die Zahlen?
python3 test/test-popup.py
```
