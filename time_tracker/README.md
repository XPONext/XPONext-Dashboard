# XPO Zeittracker

Läuft automatisch — einmal einrichten, danach startet er bei jeder Anmeldung von
selbst (rund eine Minute nach dem Hochfahren). Kein Icon zum Draufdrücken. Ab
dann poppt alle 30 Minuten ein natives macOS-Dialogfenster auf und fragt:

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

## Einrichtung (einmalig, pro Person)

1. `cp .env.example .env` und ausfüllen:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_SECRET` — bekommst du von Tim (dieselben Werte wie im KPI-Tracker)
   - `PERSON` — `tim` oder `simon`
2. `chmod +x install.sh && ./install.sh`

Das war's. Der Tracker läuft sofort los und ab dann bei jeder Anmeldung.

## Benutzung

- **Läuft von allein** im Hintergrund (kein Fenster, kein Dock-Icon)
- **Feierabend** im Popup → Schluss für heute; beim nächsten Anmelden läuft er wieder
- **Pause** im Popup → trackt eine Pause, der Loop läuft weiter

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
