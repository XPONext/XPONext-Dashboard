#!/bin/bash
# Installiert den XPO-Zeittracker so, dass er beim Anmelden automatisch startet.
# Kein Doppelklick, keine Icons auf dem Schreibtisch — einmal einrichten, fertig.
# Vorher: time_tracker/.env ausfüllen (siehe .env.example).
#
# Kopiert popup.py + .env + Loop-Skripte nach ~/.xpo-time-tracker/ (ausserhalb
# von Desktop/Dokumente/Downloads), damit macOS' TCC-Schutz für Hintergrund-
# prozesse nicht greift (kein "Vollständiger Festplattenzugriff" für python3
# nötig). Der LaunchAgent startet den Loop bei jeder Anmeldung und prüft danach
# alle paar Minuten, ob er noch läuft — so kommt er auch nach dem Aufklappen des
# Laptops zurück, ohne dass man sich neu anmelden muss.
# Bei Aenderungen am Skript: dieses install.sh einfach erneut ausfuehren.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$HOME/.xpo-time-tracker"
LABEL="com.xpo.timetracker"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
START_DELAY=60     # Sekunden nach dem Anmelden/Aufwachen, bevor das erste Popup kommt
CHECK_INTERVAL=300 # wie oft geprüft wird, ob der Loop (noch) laufen soll

if [ ! -f "$DIR/.env" ]; then
  echo "Fehler: $DIR/.env fehlt. Erst .env.example kopieren und ausfüllen."
  exit 1
fi

# Laufenden Loop und alte Version des LaunchAgents sauber beenden. "--for-restart",
# weil das hier kein Feierabend ist — der Loop soll gleich wieder anlaufen.
if [ -f "$DEPLOY_DIR/stop_loop.sh" ]; then
  bash "$DEPLOY_DIR/stop_loop.sh" --for-restart >/dev/null 2>&1 || true
fi
# Eine Feierabend-Marke von heute wuerde check_loop.sh sofort wieder aussteigen
# lassen. Wer neu installiert, will ihn jetzt laufen sehen.
rm -f "$DEPLOY_DIR/.tmp/feierabend.date"
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || launchctl unload "$PLIST_DEST" 2>/dev/null || true

mkdir -p "$DEPLOY_DIR/.tmp" "$HOME/Library/LaunchAgents"
cp "$DIR/popup.py" "$DEPLOY_DIR/popup.py"
cp "$DIR/.env" "$DEPLOY_DIR/.env"
cp "$DIR/start_loop.sh" "$DEPLOY_DIR/start_loop.sh"
cp "$DIR/stop_loop.sh" "$DEPLOY_DIR/stop_loop.sh"
cp "$DIR/check_loop.sh" "$DEPLOY_DIR/check_loop.sh"
chmod +x "$DEPLOY_DIR/start_loop.sh" "$DEPLOY_DIR/stop_loop.sh" "$DEPLOY_DIR/check_loop.sh"

# Alte Doppelklick-Icons einer früheren Version wegräumen — braucht es nicht mehr.
# Darf nicht hart fehlschlagen: auf den Desktop kommt nicht jeder Prozess drauf
# (macOS TCC), und daran soll wegen "set -e" nicht die ganze Installation
# scheitern — die Icons sind nur Kosmetik.
rm -rf "$HOME/Desktop/Start Tracking.app" "$HOME/Desktop/Stop Tracking.app" 2>/dev/null || true

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
    <string>$DEPLOY_DIR/check_loop.sh</string>
    <string>--delay</string>
    <string>$START_DELAY</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <!-- Deckel aufklappen ist kein Anmelden: RunAtLoad allein feuert nur beim
       Login. StartInterval-Trigger, die waehrend des Ruhezustands faellig
       waren, holt launchd direkt nach dem Aufwachen nach — dadurch kommt der
       Tracker auch ohne Neuanmeldung zurueck. Solange der Loop laeuft, haengt
       check_loop.sh per exec darin und launchd startet den Job nicht doppelt;
       die Trigger laufen dann einfach ins Leere. -->
  <key>StartInterval</key>
  <integer>$CHECK_INTERVAL</integer>
  <key>StandardOutPath</key>
  <string>$DEPLOY_DIR/.tmp/tracker.log</string>
  <key>StandardErrorPath</key>
  <string>$DEPLOY_DIR/.tmp/tracker_error.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID" "$PLIST_DEST" 2>/dev/null || launchctl load "$PLIST_DEST"

echo "Installiert nach $DEPLOY_DIR."
echo "Der Zeittracker läuft ab jetzt automatisch beim Anmelden (erstes Popup nach $START_DELAY Sek.)"
echo "und kommt nach dem Aufklappen des Laptops von selbst zurück (Prüfung alle $((CHECK_INTERVAL / 60)) Min)."
echo "Stoppen für heute: im Popup auf 'Feierabend' — am nächsten Morgen läuft er wieder."
echo "Zum Testen sofort: python3 $DEPLOY_DIR/popup.py"
