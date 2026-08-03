#!/bin/bash
# Installiert den XPO-Zeittracker so, dass er beim Anmelden automatisch startet.
# Kein Doppelklick, keine Icons auf dem Schreibtisch — einmal einrichten, fertig.
# Vorher: time_tracker/.env ausfüllen (siehe .env.example).
#
# Kopiert popup.py + .env + Loop-Skripte nach ~/.xpo-time-tracker/ (ausserhalb
# von Desktop/Dokumente/Downloads), damit macOS' TCC-Schutz für Hintergrund-
# prozesse nicht greift (kein "Vollständiger Festplattenzugriff" für python3
# nötig). Der LaunchAgent startet den Loop bei jeder Anmeldung.
# Bei Aenderungen am Skript: dieses install.sh einfach erneut ausfuehren.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$HOME/.xpo-time-tracker"
LABEL="com.xpo.timetracker"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
START_DELAY=60   # Sekunden nach dem Anmelden, bevor das erste Popup kommt

if [ ! -f "$DIR/.env" ]; then
  echo "Fehler: $DIR/.env fehlt. Erst .env.example kopieren und ausfüllen."
  exit 1
fi

# Laufenden Loop und alte Version des LaunchAgents sauber beenden.
if [ -f "$DEPLOY_DIR/stop_loop.sh" ]; then
  bash "$DEPLOY_DIR/stop_loop.sh" >/dev/null 2>&1 || true
fi
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DEST" 2>/dev/null || true

mkdir -p "$DEPLOY_DIR/.tmp" "$HOME/Library/LaunchAgents"
cp "$DIR/popup.py" "$DEPLOY_DIR/popup.py"
cp "$DIR/.env" "$DEPLOY_DIR/.env"
cp "$DIR/start_loop.sh" "$DEPLOY_DIR/start_loop.sh"
cp "$DIR/stop_loop.sh" "$DEPLOY_DIR/stop_loop.sh"
chmod +x "$DEPLOY_DIR/start_loop.sh" "$DEPLOY_DIR/stop_loop.sh"

# Alte Doppelklick-Icons einer früheren Version wegräumen — braucht es nicht mehr.
rm -rf "$HOME/Desktop/Start Tracking.app" "$HOME/Desktop/Stop Tracking.app"

cat > "$PLIST_DEST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$DEPLOY_DIR/start_loop.sh</string>
    <string>--delay</string>
    <string>$START_DELAY</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$DEPLOY_DIR/.tmp/tracker.log</string>
  <key>StandardErrorPath</key>
  <string>$DEPLOY_DIR/.tmp/tracker_error.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID" "$PLIST_DEST" 2>/dev/null || launchctl load "$PLIST_DEST"

echo "Installiert nach $DEPLOY_DIR."
echo "Der Zeittracker läuft ab jetzt automatisch bei jeder Anmeldung (erstes Popup nach $START_DELAY Sek.)."
echo "Stoppen für heute: im Popup auf 'Feierabend' — beim nächsten Anmelden läuft er wieder."
echo "Zum Testen sofort: python3 $DEPLOY_DIR/popup.py"
