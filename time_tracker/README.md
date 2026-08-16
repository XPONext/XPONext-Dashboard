# XPO Zeittracker

Läuft automatisch — einmal einrichten, danach startet er von selbst: bei jeder
Anmeldung (rund eine Minute nach dem Hochfahren) und auch, wenn du den Laptop
morgens einfach nur aufklappst. Kein Icon zum Draufdrücken. Ab dann poppt alle
30 Minuten ein natives macOS-Dialogfenster auf und fragt:

1. **Feierabend**, **Pause** oder **Jetzt eintragen** — bei Pause wird alles andere übersprungen und eine Pause getrackt, bei Feierabend hört er für heute auf
2. **Für wen?** — die Kundenliste
3. **Was für Arbeit war das?** — Deepwork, Kommunikation, Abarbeiten, Planung, Sonstiges

Die Antworten landen direkt in der geteilten Supabase-Datenbank und tauchen im
XPONext-Dashboard (`index.html` eine Ebene höher) im Zeittracking-Tab auf.

## Kategorien ändern

**Beide Listen kommen aus der Datenbank, nicht aus dem Skript.** Kategorien
ändern heißt deshalb: eine Zeile in Supabase ändern — kein erneutes
`install.sh` auf beiden Macs.

- **Kunden** pflegst du im Dashboard unter „Kunden". Sie tauchen sofort im
  Popup auf.
- **Arbeitsarten** stehen in der Tabelle `tracker_options` (`kind = 'state'`).

Ist die Datenbank nicht erreichbar, greifen die Rückfall-Listen oben in
`popup.py` — das Popup geht dann trotzdem auf, statt die Zeit verfallen zu
lassen.

Der frühere vierte Schritt **Aktivität** ist entfallen: Er überschnitt sich mit
der Arbeitsart („Kommunikation" vs. „Meeting", „Abarbeiten" vs. „Admin") und
ist mit einer echten Kundenzuordnung redundant. Alte Einträge behalten ihre
Aktivität, das Dashboard zeigt sie unter „Nach Art der Arbeit" weiterhin an.

Es kann immer nur ein Fenster gleichzeitig offen sein — bist du länger weg, stapeln
sich keine verpassten Popups, die Zeit bleibt einfach ungetrackt.

## Update auf die neue Version (August 2026)

Für Simon — Schritt für Schritt, im Terminal:

```bash
cd ~/Desktop/XPONext/XPONext-Dashboard
git pull
cd time_tracker
./install.sh
```

Dann einmal testen, ohne auf das nächste Fenster zu warten:

```bash
python3 ~/.xpo-time-tracker/popup.py
```

Es müssen **drei** Fenster kommen statt vier:
Start → „Für wen?" → „Was für Arbeit war das?".
Bei „Für wen?" stehen die echten Kunden.

Falls `cd` nicht klappt, weil der Ordner woanders liegt: In den Ordner
`XPONext-Dashboard` im Finder gehen, rechte Maustaste → „Neues Terminal
beim Ordner" — und dort weitermachen.

Bis du das gemacht hast, läuft deine alte Version einfach weiter. Es geht
nichts verloren, die Einträge sehen nur noch nach dem alten Muster aus.

## Einrichtung (einmalig, pro Person)

1. `cp .env.example .env` und ausfüllen:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_SECRET` — bekommst du von Tim (dieselben Werte wie im KPI-Tracker)
   - `PERSON` — `tim` oder `simon`
2. `chmod +x install.sh && ./install.sh`

Das war's. Der Tracker läuft sofort los und ab dann bei jeder Anmeldung.

## Benutzung

- **Läuft von allein** im Hintergrund (kein Fenster, kein Dock-Icon)
- **Feierabend** im Popup → Schluss für heute; am nächsten Morgen läuft er wieder
- **Pause** im Popup → trackt eine Pause, der Loop läuft weiter

## Wie das "von selbst" funktioniert

Aufklappen ist für macOS kein Anmelden — ein LaunchAgent mit `RunAtLoad` allein
würde also nur beim Login starten. Wer seinen Mac nie neu startet, sondern nur
zuklappt, bekäme nach einem Feierabend nie wieder ein Popup. Deshalb hat der
Agent zusätzlich ein `StartInterval` von 5 Minuten: solche Trigger holt launchd
direkt nach dem Aufwachen nach.

Jeder Trigger landet in `check_loop.sh`, das drei Dinge prüft, bevor es den Loop
anwirft:

1. Läuft der Loop schon? (dann nichts tun)
2. Wurde heute schon Feierabend gedrückt? (`.tmp/feierabend.date`)
3. Ist gerade Arbeitszeit? (6–22 Uhr, `START_HOUR`/`END_HOUR` in `check_loop.sh`)

Ohne Punkt 3 würde nach einem Feierabend um 22 Uhr um 00:05 sofort wieder ein
Popup aufgehen, sobald der Tag wechselt und der Rechner noch wach ist. Wer
früher anfängt oder später aufhört, ändert die beiden Werte und führt
`./install.sh` erneut aus.

Es ist bewusst **ein** Agent für beides: launchd startet einen Job nie doppelt,
solange die erste Instanz läuft — während der Loop läuft, laufen die
Intervall-Trigger einfach ins Leere.

## Ganz abschalten

```bash
launchctl bootout gui/$UID/com.xpo.timetracker
rm ~/Library/LaunchAgents/com.xpo.timetracker.plist
```

Wieder anschalten: `./install.sh` erneut ausführen.

## Testen (einzelner Durchlauf, ohne Loop)

```bash
python3 ~/.xpo-time-tracker/popup.py
```

## Bei Änderungen am Skript

`./install.sh` einfach erneut ausführen — kopiert die neueste Version nach
`~/.xpo-time-tracker/` und lädt den LaunchAgent neu.
