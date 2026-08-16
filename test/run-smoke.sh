#!/bin/bash
# Rauchtest fuer das Dashboard.
#
# Laedt index.html in einem Browser ohne Fenster, ersetzt Supabase durch feste
# Testdaten und prueft, ob alle Module laden und die erwarteten Zahlen im
# Ergebnis stehen. Faengt genau die Fehler, die beim Umbau entstehen:
# vergessene Imports, falsch benannte Felder, kaputte Rechnungen.
#
#   ./test/run-smoke.sh
#
# Braucht nur Python 3 und Google Chrome — beides ist auf den Macs vorhanden.

set -u
cd "$(dirname "$0")/.." || exit 1

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8129
TMP=".tmp-smoke"

if [ ! -x "$CHROME" ]; then
  echo "Google Chrome nicht gefunden unter: $CHROME"
  exit 2
fi

rm -rf "$TMP"; mkdir -p "$TMP"

# Testseite aus index.html erzeugen, damit sie nie veraltet
python3 - <<'PY' || exit 3
stub = open('test/stub.html', encoding='utf-8').read()
html = open('index.html', encoding='utf-8').read()
marker = '<script type="module" src="js/main.js"></script>'
if marker not in html:
    raise SystemExit('index.html bindet js/main.js nicht wie erwartet ein')
open('_smoketest.html', 'w', encoding='utf-8').write(html.replace(marker, stub + '\n' + marker))
PY

# In einer Subshell starten und die PID merken, damit der Test nicht auf den
# Server wartet.
( python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > "$TMP/server.pid" )
sleep 1

"$CHROME" --headless --disable-gpu --no-sandbox --no-first-run \
  --disable-extensions --virtual-time-budget=9000 \
  --dump-dom "http://localhost:$PORT/_smoketest.html" 2>/dev/null > "$TMP/dom.html"

python3 test/assert-smoke.py "$TMP/dom.html"
STATUS=$?

kill "$(cat "$TMP/server.pid")" 2>/dev/null
rm -rf "$TMP" _smoketest.html
exit $STATUS
