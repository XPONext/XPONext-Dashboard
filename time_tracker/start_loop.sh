#!/bin/bash
# Startet den Zeittracker-Loop: alle 30 Min ein Popup, bis "Tracking stoppen"
# gedrückt wird oder der Loop-Prozess anderweitig beendet wird.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DIR/.tmp/loop.pid"
mkdir -p "$DIR/.tmp"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  osascript -e 'display notification "Läuft schon." with title "XPO Zeittracker"'
  exit 0
fi

# Reste von einem vorherigen, nicht sauber beendeten Lauf entfernen.
rm -f "$DIR/.tmp/popup.lock"

echo $$ > "$PIDFILE"
osascript -e 'display notification "Zeittracking gestartet — alle 30 Min ein Popup." with title "XPO Zeittracker"'

while true; do
  python3 "$DIR/popup.py"
  sleep 1800
done
