#!/bin/bash
# Startet das Dashboard lokal.
#
# Seit der Aufteilung in ES-Module laesst sich die index.html NICHT mehr per
# Doppelklick oeffnen — Module laden nicht ueber file://. Stattdessen:
#
#   ./serve.sh
#
# und dann http://localhost:8000 im Browser oeffnen. Beenden mit Ctrl+C.
#
# Seit dem Auftrags-Reiter ist das kein reiner Dateiserver mehr: serve.py
# liefert daneben den Vertragsgenerator aus dem Workflow-Repo aus, weil ein
# PDF nicht im Browser entstehen kann. Details in serve.py.

cd "$(dirname "$0")" || exit 1
exec python3 serve.py "${1:-8000}"
