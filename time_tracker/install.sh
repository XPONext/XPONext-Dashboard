#!/bin/bash
# Installiert den XPO-Zeittracker als manuell startbaren Loop (kein Auto-Start
# nach der Uhr mehr — du entscheidest per Doppelklick, wann er läuft).
# Vorher: time_tracker/.env ausfüllen (siehe .env.example).
#
# Kopiert popup.py + .env + Loop-Skripte nach ~/.xpo-time-tracker/ (ausserhalb
# von Desktop/Dokumente/Downloads), damit macOS' TCC-Schutz für Hintergrund-
# prozesse nicht greift (kein "Vollständiger Festplattenzugriff" für python3
# nötig). Die beiden Doppelklick-Icons landen auf dem Schreibtisch.
# Bei Aenderungen am Skript: dieses install.sh einfach erneut ausfuehren.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$HOME/.xpo-time-tracker"
PLIST_DEST="$HOME/Library/LaunchAgents/com.xpo.timetracker.plist"

if [ ! -f "$DIR/.env" ]; then
  echo "Fehler: $DIR/.env fehlt. Erst .env.example kopieren und ausfüllen."
  exit 1
fi

# Alte automatische Tagesplanung entfernen, falls von einer früheren Version vorhanden.
if [ -f "$PLIST_DEST" ]; then
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  rm -f "$PLIST_DEST"
fi

mkdir -p "$DEPLOY_DIR/.tmp"
cp "$DIR/popup.py" "$DEPLOY_DIR/popup.py"
cp "$DIR/.env" "$DEPLOY_DIR/.env"
cp "$DIR/start_loop.sh" "$DEPLOY_DIR/start_loop.sh"
cp "$DIR/stop_loop.sh" "$DEPLOY_DIR/stop_loop.sh"
chmod +x "$DEPLOY_DIR/start_loop.sh" "$DEPLOY_DIR/stop_loop.sh"

rm -rf "$HOME/Desktop/Start Tracking.app" "$HOME/Desktop/Stop Tracking.app"
cp -R "$DIR/app_bundles/Start Tracking.app" "$HOME/Desktop/"
cp -R "$DIR/app_bundles/Stop Tracking.app" "$HOME/Desktop/"
chmod +x "$HOME/Desktop/Start Tracking.app/Contents/MacOS/Start Tracking"
chmod +x "$HOME/Desktop/Stop Tracking.app/Contents/MacOS/Stop Tracking"

echo "Installiert nach $DEPLOY_DIR."
echo "Auf dem Schreibtisch: 'Start Tracking.app' und 'Stop Tracking.app' zum manuellen Starten/Stoppen."
echo "Zum Testen sofort: python3 $DEPLOY_DIR/popup.py"
