#!/bin/bash
# Startet den Zeittracker-Loop: alle 30 Min ein Popup, bis "Tracking stoppen"
# gedrückt wird oder der Loop-Prozess anderweitig beendet wird.
#
# Wird beim Anmelden automatisch vom LaunchAgent gestartet (mit --delay, damit
# nicht mitten im Hochfahren schon ein Dialog aufgeht) und zusätzlich per
# Doppelklick auf "Start Tracking.app", falls man ihn zwischendurch von Hand
# wieder anwerfen will.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DIR/.tmp/loop.pid"
mkdir -p "$DIR/.tmp"

DELAY=0
if [ "$1" = "--delay" ] && [ -n "$2" ]; then
  DELAY="$2"
fi

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  osascript -e 'display notification "Läuft schon." with title "XPO Zeittracker"'
  exit 0
fi

# Reste von einem vorherigen, nicht sauber beendeten Lauf entfernen.
rm -f "$DIR/.tmp/popup.lock"

echo $$ > "$PIDFILE"
rm -f "$DIR/.tmp/stop.flag"

if [ "$DELAY" -gt 0 ]; then
  sleep "$DELAY"
fi

osascript -e 'display notification "Zeittracking läuft — alle 30 Min ein Popup." with title "XPO Zeittracker"'

while true; do
  python3 "$DIR/popup.py"
  # "Feierabend" im Popup legt diese Datei an — dann für heute Schluss,
  # beim nächsten Anmelden startet der LaunchAgent den Loop wieder.
  if [ -f "$DIR/.tmp/stop.flag" ]; then
    rm -f "$DIR/.tmp/stop.flag" "$PIDFILE"
    osascript -e 'display notification "Zeittracking gestoppt. Läuft beim nächsten Anmelden wieder." with title "XPO Zeittracker"'
    exit 0
  fi
  sleep 1800
done
