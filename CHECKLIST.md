# Klick-Checkliste

Es gibt keine automatischen Tests. Diese Liste ist der Regressionsschutz —
nach **jedem** Umbauschritt einmal komplett durchgehen, bevor committet wird.

Dashboard über die URL öffnen (nicht per Doppelklick — seit dem Modul-Umbau
laden ES-Module nicht mehr über `file://`). Browser-Konsole offen lassen:
**keine roten Fehler**, sonst ist der Schritt nicht fertig.

## Start

- [ ] Seite lädt, Passwortabfrage erscheint beim ersten Mal
- [ ] Nach Eingabe des Team-Passworts erscheinen Zahlen (nicht nur Nullen)
- [ ] Neu laden: keine erneute Passwortabfrage
- [ ] Kein roter Fehlerbanner am oberen Rand

## Dashboard

- [ ] Umsatzbalken zeigt einen Wert, Prozentangabe passt zur Balkenbreite
- [ ] Alle vier KPI-Karten (Lead-Gen, Termine gebucht, Show-up, Closes) gefüllt
- [ ] Hebel-Gesamtbalken gefüllt
- [ ] Aktuelle Woche unten zeigt die richtige Kalenderwoche
- [ ] Leaderboard zeigt Tim und Simon

## Wochen-Eingabe

- [ ] Datum wechseln lädt die Werte des gewählten Tages ins Formular
- [ ] Person umschalten (Tim/Simon) lädt andere Werte
- [ ] Lead-Gen-Stunden eintragen und speichern → Bestätigung erscheint
- [ ] Seite neu laden → gespeicherter Wert ist noch da
- [ ] Termine/Show-up speichern funktioniert
- [ ] Close hinzufügen (mit Auftragswert) → erscheint in der Liste
- [ ] Close löschen funktioniert
- [ ] Wochenfokus setzen (Modal) → Banner zeigt den Text
- [ ] Commitment hinzufügen, abhaken, löschen
- [ ] Vorschau unten aktualisiert sich nach dem Speichern

## Boards (Kunde → Projekt → Board)

- [ ] Reiter „Projekte" zeigt eine Kachel je Kunde, interne getrennt darunter
- [ ] Kachel „Ohne Kunde" erscheint, solange Altaufgaben unzugeordnet sind
- [ ] Klick auf einen Kunden → seine Projekte plus „Allgemein"
- [ ] Klick auf ein Projekt → eigenes Board mit fünf Spalten
- [ ] Breadcrumb führt beide Ebenen zurück
- [ ] Reiter wechseln und zurück → man landet wieder auf derselben Ebene
- [ ] Projekt anlegen aus der Kundenebene → Kunde ist vorbelegt
- [ ] Projekt auf einen anderen Kunden umhängen → seine Aufgaben wandern mit
- [ ] Projekt löschen → Aufgaben liegen danach unter „Allgemein" des Kunden
- [ ] Fortschritt am Projekt bewegt sich, wenn eine Karte auf „Done" geht

## Aufgaben

- [ ] Alle Spalten sichtbar, Aufgaben in der richtigen Spalte
- [ ] Neue Aufgabe ohne Enddatum → Dialog bleibt offen und meldet sich
- [ ] Mit Enddatum → Karte erscheint, Frist steht auf der Karte
- [ ] Enddatum in der Vergangenheit → Frist wird rot
- [ ] Beschreibung eintragen, speichern, Dialog erneut öffnen → Text ist da
- [ ] Karte mit Beschreibung trägt das ✎-Zeichen
- [ ] Status ändern → Karte wandert in die andere Spalte
- [ ] Aufgabe löschen
- [ ] Wochen-Board: Kunde/Projekt zuordnen → Karte erscheint im richtigen Board
- [ ] Wochen-Board: Zähler „ohne Zuordnung" geht dabei um eins runter
- [ ] Wochen-Board: Woche vor/zurück blättern, Aufgabe in die nächste Woche schieben

## Dashboard — Fällig in 2 Tagen

- [ ] Karte „Fällig in den nächsten 2 Tagen" steht ganz oben
- [ ] Überfällige Aufgaben stehen zuoberst und sind rot
- [ ] Eine Aufgabe mit Frist in 5 Tagen steht **nicht** drin
- [ ] Erledigte Aufgaben stehen nicht drin
- [ ] Klick auf eine Zeile öffnet den Aufgabendialog
- [ ] Auf „Done" setzen → Zeile verschwindet sofort
- [ ] Ohne fällige Aufgaben bleibt die Karte stehen und sagt das auch

## Hebel

- [ ] Datum und Person wechseln lädt die passenden Werte
- [ ] Werte eintragen und speichern → Bestätigung
- [ ] Neu laden → Werte sind noch da
- [ ] Vorschau zeigt alle fünf Hebel

## Verlauf

- [ ] Team-Tabelle zeigt alle Wochen
- [ ] Personen-Tabelle zeigt Zeilen für Tim und Simon
- [ ] Laufende Woche ist hervorgehoben
- [ ] Wochen ohne Daten zeigen „–", nicht `NaN` oder `undefined`

## Zeittracking

- [ ] „Heute"-Karte zeigt Stunden (nur in der laufenden Woche sichtbar)
- [ ] Wochenkarte zeigt Stunden für Tim und Simon
- [ ] Woche vor/zurück blättern → Zahlen ändern sich, „Heute"-Karte verschwindet
- [ ] Aufteilungen (State / Zuordnung / Aktivität) zeigen Balken
- [ ] Woche ohne Daten zeigt einen Hinweis statt leerer Fläche

## Modals allgemein

- [ ] ESC schließt jedes Modal
- [ ] Klick auf den Hintergrund schließt jedes Modal
- [ ] Enter im Textfeld speichert
- [ ] Doppelklick auf Speichern erzeugt keinen doppelten Eintrag
- [ ] Erstes Feld ist beim Öffnen fokussiert

## Fehlerfälle

- [ ] DevTools → Netzwerk auf „Offline", dann speichern:
      sichtbare Fehlermeldung, keine stumme Aktion
- [ ] Wieder online: Speichern funktioniert erneut

## Darstellung

- [ ] Fenster auf unter 800 px ziehen: Sidebar und Karten bleiben brauchbar
- [ ] Keine horizontale Scrollleiste auf der Seite
- [ ] Keine abgeschnittenen Zahlen oder überlappenden Texte
