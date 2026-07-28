#!/bin/bash
# Beendet den Zeittracker-Loop (und ein gerade offenes Popup, falls vorhanden).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DIR/.tmp/loop.pid"

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  pkill -P "$PID" 2>/dev/null   # aktuell laufendes popup.py (Kind des Loops) beenden
  kill "$PID" 2>/dev/null
  rm -f "$PIDFILE"
fi
pkill -f "$DIR/popup.py" 2>/dev/null   # Sicherheitsnetz, falls oben nichts traf
rm -f "$DIR/.tmp/popup.lock"

osascript -e 'display notification "Zeittracking gestoppt." with title "XPO Zeittracker"'
