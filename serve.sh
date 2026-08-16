#!/bin/bash
# Startet das Dashboard lokal.
#
# Seit der Aufteilung in ES-Module laesst sich die index.html NICHT mehr per
# Doppelklick oeffnen — Module laden nicht ueber file://. Stattdessen:
#
#   ./serve.sh
#
# und dann http://localhost:8000 im Browser oeffnen. Beenden mit Ctrl+C.

cd "$(dirname "$0")" || exit 1
echo "Dashboard laeuft auf http://localhost:8000  (beenden mit Ctrl+C)"
python3 -m http.server 8000
