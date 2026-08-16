#!/bin/bash
# Beendet den Zeittracker-Loop (und ein gerade offenes Popup, falls vorhanden).
#
# Mit --for-restart nur beenden, ohne es als "Feierabend" zu werten: das braucht
# install.sh, um einen laufenden Loop abzuräumen, bevor es die neue Version
# ausrollt und gleich wieder startet. Ohne den Schalter ist es der bewusste
# Stopp durch den Menschen — dann für heute Ruhe.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DIR/.tmp/loop.pid"
FOR_RESTART=""
[ "$1" = "--for-restart" ] && FOR_RESTART=1

if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  pkill -P "$PID" 2>/dev/null   # aktuell laufendes popup.py (Kind des Loops) beenden
  kill "$PID" 2>/dev/null
  rm -f "$PIDFILE"
fi
pkill -f "$DIR/popup.py" 2>/dev/null   # Sicherheitsnetz, falls oben nichts traf
rm -f "$DIR/.tmp/popup.lock"

if [ -n "$FOR_RESTART" ]; then
  exit 0
fi

# Wie ein "Feierabend" behandeln, sonst wirft check_loop.sh den Loop beim
# nächsten Intervall-Trigger in ein paar Minuten einfach wieder an.
mkdir -p "$DIR/.tmp"
date +%F > "$DIR/.tmp/feierabend.date"

osascript -e 'display notification "Zeittracking gestoppt. Läuft morgen früh wieder." with title "XPO Zeittracker"'
