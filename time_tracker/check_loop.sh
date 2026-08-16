#!/bin/bash
# Wächter — vom LaunchAgent aufgerufen, beim Anmelden (RunAtLoad) und danach alle
# paar Minuten (StartInterval). Entscheidet, ob der Loop laufen soll, und geht
# per exec in start_loop.sh über.
#
# Warum es das braucht: "Deckel aufklappen" ist kein Anmelden. RunAtLoad allein
# feuert nur beim Login — wer seinen Mac nie neu startet, sondern nur zuklappt,
# bekommt nach einem "Feierabend" nie wieder ein Popup. launchd holt verpasste
# StartInterval-Trigger direkt nach dem Aufwachen nach, deshalb greift dieser
# Weg auch beim Aufklappen.
#
# Es ist bewusst DERSELBE LaunchAgent wie für den Login-Start: launchd startet
# einen Job nie zweimal parallel, solange die erste Instanz noch läuft. Solange
# der Loop lebt, hängt dieses Skript per exec darin und alle Intervall-Trigger
# laufen ins Leere. Erst wenn der Loop endet (Feierabend, Abmelden, kill),
# kommt der nächste Trigger hier wieder an.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="$DIR/.tmp/loop.pid"
FEIERABEND_FILE="$DIR/.tmp/feierabend.date"

# Zeitfenster, in dem der Loop von selbst anspringen darf. Ohne das würde nach
# einem Feierabend um 22 Uhr um 00:05 (neuer Tag) sofort wieder ein Popup
# aufgehen, wenn der Rechner noch wach ist.
START_HOUR=6
END_HOUR=22

mkdir -p "$DIR/.tmp"

# 1. Läuft der Loop schon? Dann nichts tun. (Greift für Loops, die von Hand oder
#    von einer früheren Agent-Instanz gestartet wurden — die reguläre Instanz
#    kommt hier ohnehin nie an, siehe Kommentar oben.)
if [ -f "$PIDFILE" ]; then
  OLDPID="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$OLDPID" ] && ps -p "$OLDPID" -o command= 2>/dev/null | grep -q "start_loop.sh"; then
    exit 0
  fi
  rm -f "$PIDFILE"
fi

# 2. Heute schon Feierabend gedrückt? Dann bis morgen Ruhe.
if [ -f "$FEIERABEND_FILE" ] && [ "$(cat "$FEIERABEND_FILE" 2>/dev/null)" = "$(date +%F)" ]; then
  exit 0
fi

# 3. Außerhalb der Arbeitszeit nicht von selbst anspringen.
HOUR=$(date +%-H)
if [ "$HOUR" -lt "$START_HOUR" ] || [ "$HOUR" -ge "$END_HOUR" ]; then
  exit 0
fi

exec /bin/bash "$DIR/start_loop.sh" "$@"
