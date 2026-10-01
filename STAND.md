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

**Kanal, Angebote, Kampagnen (seit 01.10.2026, nach dem ersten Push):**
`sql/012_leads_kanal.sql` und `sql/013_instantly_kampagnen.sql` im
Supabase-SQL-Editor ausführen (012 auch dann, wenn es schon einmal lief — es
ergänzt Spalten), dann das Workflow-Repo pushen (`tools/vertrieb_sync/leads.py`,
`instantly.py`). Bis dahin zeigt die Karte „Woher kommen Termine
und Aufträge?" einen Hinweis. Optional in Close beim Feld „Quelle" Auswahlwerte
anlegen (z. B. Empfehlung, Externer Setter, Cold Email, Cold Call) — gesetzt
schlägt es die automatische Zuordnung.

**Termine und Anrufe aus Close (seit 01.10.2026) — in dieser Reihenfolge:**

1. **`sql/010_termine_aus_kalender.sql` und `sql/011_anrufe_aus_close.sql`** im
   Supabase-SQL-Editor ausführen. Legen nur Tabellen an, löschen nichts.
2. **In Railway am Service `XPO_Agentic_Workflow`** (nicht `web`) drei Variablen
   eintragen: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_SECRET`. Werte und Gründe im
   README von `tools/vertrieb_sync/` im Workflow-Repo.
3. **Beide Repos pushen** — Workflow-Repo zuerst. Der erste Cron-Lauf holt alles ab
   13.07. und dauert rund 8 Minuten; danach stellt das Dashboard von selbst um.
4. **Prüfen:** Unter „Termine gebucht" und bei „Calls je Person" steht „Abgleich
   vor … Min.", nichts ist orange.
5. **Erst dann auf Tims Mac `./time_tracker/install.sh` erneut ausführen.** Es
   entfernt den alten Close-Abgleich (LaunchAgent `com.xpo.closesync`). Bei Simon
   schadet es nicht, es findet dort nur nichts zum Entfernen.
6. **Einmal durchklicken:** „ohne Spur – bestätigen" unter der Show-up-Kennzahl
   (seit Juli 8 Erstgespräche ohne Aufnahme oder Telefonat) und im
   Nachtragen-Dialog „Sebastian x XPO" (10.09.) auf Folgetermin stellen.

**Ticket-Board (seit 01.10.2026, Ticket MA-008 im Repo `xpo-mail-agent`):**

1. ~~**`sql/014_tickets.sql`** ausführen~~ — erledigt (Tim, 01.10.2026). Legt `sprints` und
   `tickets` an, löscht nichts. Die Gegenprobe am Ende muss zweimal „geschützt" zeigen.
2. Im Mail-Agent-Repo die Tickets aus `backlog/tickets/` importieren
   (`tools/tickets/run.py`, Aktion `importieren`), dann hier Sprint 1 planen.

0. **`sql/002_projekte.sql` ausführen** — drei zusätzliche Spalten für
   Fristen an Schritten, Aufgaben-Verknüpfung und Kundenbezug. Legt nur an,
   löscht nichts.
1. **Simon:** `git pull` und `./install.sh` — Anleitung in
   [time_tracker/README.md](time_tracker/README.md).
2. **Kundennamen aufräumen:** `chuong`, `protours`, `wotka`,
   `kkk_architektur` stehen klein geschrieben in der Liste. Umbenennen im
   Kunden-Reiter ist gefahrlos — die Zeiteinträge hängen an der ID.
3. **Umsätze eintragen**, sonst bleibt der Stundenlohn leer.
4. **Ersten echten Vertrag über den Auftrags-Reiter schreiben** und das PDF
   einmal ganz durchlesen. Der Generator ist gegen Zittrich geprüft, aber jede
   Kombination von Bausteinen ist neu — und die Formulierhilfe für individuelle
   Vereinbarungen hat noch nie einen echten Absatz erzeugt.
5. **Durchklicken:** [CHECKLIST.md](CHECKLIST.md).

**Erledigt am 28.09.2026:** `sql/009` ist ausgeführt — Monatsprojekt und Engpass
stehen. In Railway (Service `web`) liegen `APP_SECRET`, `GOOGLE_TOKEN_JSON` und
`ANTHROPIC_API_KEY`; der Auftrags-Reiter erzeugt damit Verträge, legt sie im
Drive-Kundenordner ab und formuliert Freitext aus.

## Aufbau seit 19.09.2026

Fünf Reiter, sortiert nach der Frage, die sie beantworten — nicht nach der
Datenquelle:

| Reiter | Frage | Enthält |
|---|---|---|
| Heute | Wo stehe ich jetzt? | Calls heute (Tim/Simon, 14-Tage-Verlauf), Termine heute, überfällige Call-Tasks, Zeit heute, Wochenprojekt, Commitments (Woche mit ‹ › blätterbar) |
| Vertrieb | Kommen wir ans Ziel? | Ein Zeitraum für die ganze Seite; Erstgespräche, Show-up-Rate, Aufträge, Anrufe; Tim & Simon; je Woche |
| Kunden | Wer lohnt sich? | Stundenlohn je Kunde, Umsätze, Zeiterfassung nach Kunde |
| Arbeit | Woran arbeiten wir? | Hebel-Stand, Aufgaben-Board und Projekte als Umschalter |
| Projekte | Wo steht der Sprint? | Erst Projektauswahl, dann Scrum-Board je Entwicklungsprojekt (zuerst Mail-Agent), ohne Fahrplan-Kopf: Sprintziel, Resttage, Tickets mit Story und Kriterien, Sprint Planning. Claude liest und schreibt über `tools/tickets/` im jeweiligen Repo. Braucht `sql/014` |
| Verlauf | Wie entwickelt es sich? | Umsatz gegen das Ziel, Stunden je Woche, Hebel je Woche, Hebel gesamt, Bestenliste, Tabellen, CSV |
| Angebote & Verträge | Was schicken wir dem Kunden? | Umschalter: Angebot aus dem Transkript, Vertrag aus Bausteinen |

**Seit 29.09.2026:** Angebote und Verträge in einem Reiter mit Umschalter statt
zwei Reitern. Reihenfolge links: oben die Reiter mit Umsatzbalken (Heute,
Vertrieb, Kunden, Verlauf), unten die Werkbänke ohne (Arbeit, Angebote &
Verträge). Der Angebots-Teil schreibt den Situationsteil mit einem
Sprachmodell, 10 bis 30 Cent je Entwurf — Details in
`tools/angebot_formular/README.md` im Workflow-Repo.

**Auf „Heute" seit 28.09.2026:** Monatsprojekt (das Vorhaben, auf das die
Wochenprojekte einzahlen — hängt am Monat des gewählten Tages) und der aktuelle
Engpass (ein Absatz, hängt an derselben Woche wie das Wochenprojekt, weil beides
im wöchentlichen Meeting besprochen wird). Braucht `sql/009`. Der Umsatzbalken
steht seither im Kopf über allen Reitern statt im Vertrieb-Reiter.

**Aufträge-Reiter seit 23.09.2026.** Paket wählen, Bausteine anhaken, Laufzeit
und Preise eintragen — heraus kommt die Leistungsvereinbarung als Markdown und
PDF in `vertraege/{Kunde}/` im Workflow-Repo. Es wird **nichts formuliert**:
Jeder Satz steht wortgleich in einem bereits geschlossenen Vertrag, bei jedem
Baustein steht die Quelle daneben und „Wortlaut" klappt den Volltext auf. Kein
Sprachmodell, kein API-Schlüssel.

Fünf Klauseln haben bewusst keinen Vorgabewert (Nutzungsrechte, Verlängerung,
Kostenträger, Datenschutz, Referenznennung) — ohne Auswahl wird kein Vertrag
erzeugt. Bei den Nutzungsrechten gibt es fünf einander ausschließende Fassungen
im Bestand, bei der Verlängerung steht es 6:5. Es gibt keinen Mehrheitsfall, der
als Standard taugt.

**Dafür ist `serve.sh` kein reiner Dateiserver mehr.** Ein PDF kann nicht im
Browser entstehen, deshalb liefert [serve.py](serve.py) jetzt beides aus: die
Dateien des Dashboards und unter `/api/vertrag/*` den Generator, der im
Workflow-Repo unter `tools/vertrag_formular/` liegt — dort, wo auch die
Verträge, die Vorlage und `md_to_pdf.py` sind. Fehlt das Repo, läuft das
Dashboard normal weiter und nur der Auftrags-Reiter erklärt, was fehlt. Liegt es
woanders: `XPO_WORKFLOW_REPO=/pfad ./serve.sh`.

**Im Kunden-Reiter seit 19.09.2026:** Stundensatz je Leistung (Webseite vs.
Ads vs. GEO), Stundenbudget je Auftrag (Betrag ÷ Ziel-Stundensatz, Warnung ab
80 %) und Zeit-Mix je Kunde (Anteil Kommunikation). Braucht `sql/006`.

**„+ Nachtragen"** in der Seitenleiste öffnet einen Dialog mit allem, was ein
verpasstes Popup nicht erfasst hat: Termine, Lead-Gen-Stunden, Hebel, Calls.

**Was automatisch kommt:** Zeit je Kunde, Hebel-Stunden und Lead-Gen-Stunden
(Zeit auf „Neukunden") aus dem Zeittracker-Popup. Calls, Tagesvorgabe und
Termine aus Close über den Abgleich auf Railway (siehe unten). Von Hand bleibt
nichts mehr außer Korrekturen.

**Calls seit 01.10.2026 einzeln aus Close** (`sql/011`, `tools/vertrieb_sync/anrufe.py`).
Die Person kommt aus der Leitung („Tim Business"/„Simon Business") — Simon hat
keinen eigenen Close-Nutzer, ruft aber mit seiner Leitung über Close an. Vorher
zählte `time_tracker/close_sync.py` abgehakte Tasks und schrieb alles Tim zu
(28.09.: 49 bei Tim, tatsächlich 10 Tim und 37 Simon); das Skript ist entfernt.
Kalt/warm nach dem Lead-Status vor dem Anruf; dazu je Person, wie viele der
erreichten kalten bzw. warmen Leads binnen 30 Tagen ein Erstgespräch bekamen
(Call-to-Termin) und binnen 180 Tagen einen Auftrag (Call-to-Close) —
`anrufKennzahlen()` in `js/state.js`, die Karte „Calls je Person" im
Vertrieb-Reiter. Gerechnet je Lead: Nach dem letzten Anruf vor der Buchung lag
„kalt → Termin" fast immer bei 0, weil erst ein Folgeanruf den Termin legt. Die Tagesvorgabe ist eine Teamzahl
(`daily_call_targets`), weil alle Tasks an Tims Close-Nutzer hängen.

**Vertrieb-Reiter neu seit 01.10.2026** (`js/views/vertrieb.js`): Tim fand die
Seite unübersichtlich (3.800 px, fünf Bauarten, jede Karte mit eigenem Zeitraum).
Jetzt ein Zeitraum-Schalter oben für alles, vier gleich gebaute Kennzahlen mit
Vergleich zum Vorzeitraum, „Tim & Simon" als ruhige Tabelle, der Verlauf je Woche.
Soll = Wochenziel aus `config.js` anteilig auf die Tage. Ampelfarben nur bei
Kennzahlen mit Soll. Die Bausteine (`.seiten-kopf`, `.segment`, `.kpi`,
`table.ruhig`, `.karten-kopf` in `views.css`) sind für die anderen Reiter gedacht.
Darin seit dem zweiten Durchgang: Vergleich im Klartext („▼ 139 Anrufe · −24 %
ggü. 10.08.–03.09."), „Woher kommen Termine und Aufträge?" (Kanal je Lead nach
der ersten Konversation, `leadKanal`/`kanalKennzahlen`/`wegZumAuftrag` in
`state.js`), Spalte „Termine" bei Tim & Simon und „Je Woche" als Tabelle mit
feinen Balken; das Säulendiagramm steht jetzt im Verlauf-Reiter. Im dritten
Durchgang: Trichter Termin → geführt → Angebot → Auftrag mit offenen Angeboten,
Wert und Aufwand je Termin je Kanal, „Cold Email nach Kampagne" (Instantly) und
„Beste Anrufzeit" als Wärmebild (`kohorte`, `trichter`, `kampagnenKennzahlen`,
`anrufzeiten` in `state.js`).
**Opportunitätskosten sind raus** (Cockpit, Kacheln, Kostentabelle, „Wert je
Call"): Die Vorgabe aus Close-Tasks kennt keine Kaltakquise — Tim: „komplett
rausnehmen". Die Einstellung `call_value_eur` steht noch in `settings`, wird aber
nicht mehr gelesen. Inhalt und Umsatz-Kopf sind jetzt gleich breit (1180 px).

**Seit 01.10.2026 lädt das Dashboard `time_entries` seitenweise.** Supabase
liefert je Abfrage höchstens 1000 Zeilen, ohne Fehlermeldung; die Tabelle hatte
an dem Tag 1014, die neuesten fehlten. Neue große Tabellen über `alleZeilen()`
in `js/data.js` laden.

**Termine seit 01.10.2026 aus dem Close-Kalender** (`sql/010`, Abgleich im
Workflow-Repo unter `tools/vertrieb_sync/`, läuft auf Railway). Als Termin zählt
nur das Erstgespräch, je Lead einmal am Tag der ersten Buchung. Was ein
Erstgespräch ist, rechnet `termineMitArt()` in `js/state.js`; der Abgleich
liefert nur Fakten und je Termin ein vorgeschlagenes Ergebnis. Korrigiert wird
je Termin im Nachtragen-Dialog (`js/views/termine.js`), nicht mehr mit Zahlen
pro Tag. Die alten Handeingaben (`daily_team`) und die Task-Zählung
(`daily_meetings`) bleiben in der Datenbank, zählen aber nicht mehr mit.
Vorher stand für 21.–30.09. „16 gebucht, 19 Show-ups" da — tatsächlich waren
es 6 und 6. Plan für die nächsten Schritte (Calls, Quelle je Kanal,
Kunden-Steckbrief): DECISIONS.md im Workflow-Repo, Eintrag vom 01.10.2026.

## Kurzbefehle

```bash
./serve.sh              # lokal öffnen (Doppelklick geht nicht mehr)
./test/run-smoke.sh     # laden alle Module? stimmen die Zahlen?
python3 test/test-popup.py
```
