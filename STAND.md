# Stand — 16.08.2026

Kurzer Zettel zum Wiedereinsteigen. Alles ist committet, nichts liegt lose herum.

## Wo wir stehen

Branch **`refactor/module-split`**, 13 Commits, Arbeitsverzeichnis sauber.
`main` ist unverändert — der Merge wartet auf deine Freigabe.

Rücksprungpunkt, falls etwas grundlegend schiefgeht: `git checkout vor-modul-split`

### Fertig

- **Phase 0 (Fundament).** `index.html` von 1911 auf 324 Zeilen; 20 Module unter
  `js/` und `styles/`. Design-Token-System, ein nativer `<dialog>` statt sechs
  handgebauter Modals, Diagramm-Modul, zwei Testskripte.
- **Review-Durchgang** und alle Befunde behoben.
- **Schritt 1: Hebel-Modul** überarbeitet.

### Nebenbei behobene Fehler

- Rückfrage beim Löschen zerstörte den Bearbeiten-Dialog darunter; ein
  fehlgeschlagenes Löschen sah aus wie ein erfolgreiches
- Speichern konnte fehlschlagen, während „Gespeichert ✓" erschien
- Schritte und Commitments ohne Zuweisung zeigten wörtlich „undefined"
- Bei Netzwerkproblemen kam man mit richtigem Passwort nie durch die Anmeldung
- Tracker-Kategorien gingen unmaskiert ins Markup

## Was du noch prüfen wolltest

`./serve.sh` → [http://localhost:8000](http://localhost:8000) → [CHECKLIST.md](CHECKLIST.md)
durchgehen. Besonders: Projekt bearbeiten → „Löschen" → **„Abbrechen"**.
Der Bearbeiten-Dialog muss offen bleiben und die Eingaben behalten.

## Wie es weitergeht

Nächster Schritt laut Plan ist **Schritt 2: Kunden-Datenbasis**. Dafür brauche
ich von dir zwei Dinge, sobald du wieder Zeit hast:

1. Das Ergebnis dieser Inventur-Abfrage aus dem Supabase-SQL-Editor — damit ich
   weiß, welche Zuordnungswerte real existieren:

   ```sql
   select zuordnung, count(*), min(ts)::date as erster, max(ts)::date as letzter
   from time_entries group by zuordnung order by count(*) desc;

   select policyname, cmd, qual, with_check
   from pg_policies where tablename in ('time_entries','daily_team');
   ```

2. Die Bestätigung, ob die Policy auf `daily_team` ein `with_check` hat. Davon
   hängt ab, ob die Passwortprüfung beim Anmelden wirklich schützt.

Danach liefere ich das vollständige SQL-Skript für `customers` und `revenues`,
das du im Editor ausführst.

## Kurzbefehle

```bash
./serve.sh                   # lokal öffnen (Doppelklick geht nicht mehr)
./test/run-smoke.sh          # laden alle Module? stimmen die Zahlen?
./test/run-visual.sh check   # hat sich das Aussehen ungewollt verändert?
```
