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

# Doppelstart verhindern — aber nur, wenn hinter der gemerkten PID auch wirklich
# noch unser Loop steckt. Wird der Rechner heruntergefahren, während der Loop
# läuft, bleibt die PID-Datei liegen; nach dem Neustart gehört dieselbe (niedrige)
# PID fast sicher einem fremden Systemprozess. Ein reines "kill -0" hielte den
# Tracker dann für laufend und würde sich bei jedem Anmelden sofort beenden.
if [ -f "$PIDFILE" ]; then
  OLDPID="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$OLDPID" ] && ps -p "$OLDPID" -o command= 2>/dev/null | grep -q "start_loop.sh"; then
    osascript -e 'display notification "Läuft schon." with title "XPO Zeittracker"'
    exit 0
  fi
  rm -f "$PIDFILE"
fi

# Reste von einem vorherigen, nicht sauber beendeten Lauf entfernen.
rm -f "$DIR/.tmp/popup.lock"

echo $$ > "$PIDFILE"
# Egal wie der Loop endet (Feierabend, Abmelden, kill) — die PID-Datei nicht
# als Leiche zurücklassen.
trap 'rm -f "$PIDFILE"' EXIT
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
