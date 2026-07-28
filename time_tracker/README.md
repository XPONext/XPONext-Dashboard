# XPO Zeittracker

Läuft nicht automatisch nach der Uhr, sondern nur wenn du ihn manuell startest —
per Doppelklick auf **"Start Tracking"** auf dem Schreibtisch. Ab dann poppt
alle 30 Minuten ein natives macOS-Dialogfenster auf und fragt:

1. **Pause** oder **Jetzt eintragen** — bei Pause wird alles andere übersprungen
2. **State**: Deepwork, Kommunikation, Abarbeiten, Planung, Strategie, Weiterbilden, Sonstiges
3. **Zuordnung**: Kunde (z.B. chuong, protours), XPO (intern), Neukunden, Sonstiges — Liste kommt live aus Supabase
4. **Aktivität**: Vertrieb, Copywriting, Admin, Techsetup, Beratung, Meeting — oder überspringen

Die Antworten landen direkt in der geteilten Supabase-Datenbank und tauchen im
XPONext-Dashboard (`index.html` eine Ebene höher) im Zeittracking-Tab auf. Wenn
sich hier die Kategorien ändern, muss die Auswertung im Dashboard mitziehen.

Es kann immer nur ein Fenster gleichzeitig offen sein — bist du länger weg, stapeln
sich keine verpassten Popups, die Zeit bleibt einfach ungetrackt.

## Einrichtung (einmalig, pro Person)

1. `cp .env.example .env` und ausfüllen:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_SECRET` — bekommst du von Tim (dieselben Werte wie im KPI-Tracker)
   - `PERSON` — `tim` oder `simon`
2. `chmod +x install.sh && ./install.sh`

Danach liegen zwei Icons auf dem Schreibtisch: **Start Tracking** und **Stop Tracking**.

## Benutzung

- **Start Tracking.app** doppelklicken → läuft im Hintergrund (kein Fenster, kein Dock-Icon), bis gestoppt
- **Stop Tracking.app** doppelklicken → beendet den Loop sofort, auch ein gerade offenes Popup wird geschlossen

## Testen (einzelner Durchlauf, ohne Loop)

```bash
python3 ~/.xpo-time-tracker/popup.py
```

## Bei Änderungen am Skript

`./install.sh` einfach erneut ausführen — kopiert die neueste Version nach `~/.xpo-time-tracker/`.
