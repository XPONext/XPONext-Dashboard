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

## Aufgaben (Kanban)

- [ ] Alle Spalten sichtbar, Aufgaben in der richtigen Spalte
- [ ] Neue Aufgabe anlegen (Modal) → erscheint im Board
- [ ] Aufgabe anklicken → Modal öffnet mit den richtigen Werten
- [ ] Status ändern → Karte wandert in die andere Spalte
- [ ] Aufgabe löschen
- [ ] Woche vor/zurück blättern
- [ ] Aufgabe in die nächste Woche schieben

## Projekte

- [ ] Projektliste lädt, Fortschritt je Projekt sichtbar
- [ ] Projekt anlegen → erscheint in der Liste
- [ ] Projekt bearbeiten → geänderte Werte werden übernommen
- [ ] Projekt löschen
- [ ] Schritt hinzufügen → erscheint beim richtigen Projekt
- [ ] Schritt abhaken → Fortschrittsbalken bewegt sich
- [ ] Schritt löschen
- [ ] Leerer Zustand: Projekt ohne Schritte zeigt einen sinnvollen Hinweis

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
