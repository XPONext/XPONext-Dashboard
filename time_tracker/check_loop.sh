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

# Ab wann der Rechner als unbenutzt gilt. Dieselbe Grenze wie in popup.py: wer
# so lange nicht getippt und die Maus nicht bewegt hat, sitzt nicht davor.
LEERLAUF_GRENZE=600   # Sekunden

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

# 2. Heute schon Feierabend gedrückt? Dann bis morgen Ruhe. Der Vergleich ist
#    auf den Tag genau: um Mitternacht verfällt die Marke von selbst, der
#    Tracker steht ab 0 Uhr also wieder bereit. Die Datei bleibt liegen und
#    wird beim nächsten Feierabend überschrieben.
if [ -f "$FEIERABEND_FILE" ] && [ "$(cat "$FEIERABEND_FILE" 2>/dev/null)" = "$(date +%F)" ]; then
  exit 0
fi

# 3. Sitzt gerade jemand am Rechner? Wenn nicht, nicht anspringen.
#
#    Das steht hier statt eines festen Zeitfensters (früher 6–22 Uhr). Das
#    Fenster hat zwei Dinge verwechselt: "es ist Nacht" und "es arbeitet
#    niemand". Wer um 5 Uhr anfängt, bekam bis 6 Uhr kein Popup; wer nach einem
#    Feierabend um 22 Uhr den Laptop anließ, ab 00:05 sofort wieder eins.
#    Der Leerlauf beantwortet direkt, worum es geht — und läuft im Ruhezustand
#    weiter, ist nach dem Aufklappen also groß und fällt beim ersten
#    Tastendruck auf null.
#
#    Bewusst hier und nicht erst in popup.py: der Loop meldet sich beim Start
#    mit einer Notification. Die soll nachts nicht aufgehen, nur weil launchd
#    alle fünf Minuten nachsieht.
LEERLAUF=$(ioreg -c IOHIDSystem 2>/dev/null \
  | awk '/HIDIdleTime/ { print int($NF / 1000000000); exit }')
# Bei Unklarheit lieber starten als still bleiben — popup.py prüft den Leerlauf
# ohnehin noch einmal, bevor wirklich ein Fenster aufgeht.
if [ -n "$LEERLAUF" ] && [ "$LEERLAUF" -gt "$LEERLAUF_GRENZE" ]; then
  exit 0
fi

exec /bin/bash "$DIR/start_loop.sh" "$@"
