#!/bin/bash
# Visueller Vergleich vor und nach einer CSS-Aenderung.
#
#   ./test/run-visual.sh baseline    # aktuellen Stand als Referenz festhalten
#   ./test/run-visual.sh check       # gegen die Referenz vergleichen
#
# Rendert alle Ansichten gleichzeitig (der Rauchtest-Stub blendet sie alle ein)
# und vergleicht die Screenshots Pixel fuer Pixel. Faengt genau das, was beim
# Umbau des Design-Systems passieren kann: unbeabsichtigte Layoutverschiebungen.
#
# Die Referenzbilder liegen unter test/baseline/ und gehoeren NICHT ins Git —
# sie sind ein lokales Hilfsmittel, kein Projektstand.

set -u
cd "$(dirname "$0")/.." || exit 1

MODE="${1:-check}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8130
TMP=".tmp-visual"

if [ ! -x "$CHROME" ]; then echo "Google Chrome nicht gefunden."; exit 2; fi

rm -rf "$TMP"; mkdir -p "$TMP"

python3 - <<'PY' || exit 3
stub = open('test/stub.html', encoding='utf-8').read()
# Alle Ansichten gleichzeitig sichtbar machen, damit ein Bild alles zeigt
stub += '\n<style>section.view{display:block !important;} #smokeResult{display:none;}</style>\n'
html = open('index.html', encoding='utf-8').read()
marker = '<script type="module" src="js/main.js"></script>'
open('_visualtest.html', 'w', encoding='utf-8').write(html.replace(marker, stub + '\n' + marker))
PY

( python3 -m http.server "$PORT" >/dev/null 2>&1 & echo $! > "$TMP/server.pid" )
sleep 1

shoot(){ # $1 = Breite, $2 = Zieldatei
  "$CHROME" --headless --disable-gpu --no-sandbox --no-first-run --disable-extensions \
    --virtual-time-budget=6000 --hide-scrollbars \
    --window-size="$1,4000" --screenshot="$2" \
    "http://localhost:$PORT/_visualtest.html" >/dev/null 2>&1
}

if [ "$MODE" = "baseline" ]; then
  mkdir -p test/baseline
  shoot 1440 "test/baseline/desktop.png"
  shoot 700  "test/baseline/mobil.png"
  echo "Referenzbilder gespeichert unter test/baseline/"
  STATUS=0
else
  if [ ! -f test/baseline/desktop.png ]; then
    echo "Keine Referenz vorhanden. Zuerst './test/run-visual.sh baseline' ausfuehren."
    STATUS=2
  else
    shoot 1440 "$TMP/desktop.png"
    shoot 700  "$TMP/mobil.png"
    python3 test/compare-images.py \
      "test/baseline/desktop.png" "$TMP/desktop.png" "Desktop 1440px" \
      "test/baseline/mobil.png"   "$TMP/mobil.png"   "Mobil 700px"
    STATUS=$?
  fi
fi

kill "$(cat "$TMP/server.pid")" 2>/dev/null
rm -rf "$TMP" _visualtest.html
exit $STATUS
