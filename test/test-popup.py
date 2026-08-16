#!/usr/bin/env python3
"""Prueft den Ablauf des Zeittracker-Popups, ohne Fenster zu oeffnen.

  python3 test/test-popup.py

Wichtigster Punkt: Die Auswahllisten kommen jetzt aus der Datenbank. Ein
Kundenname mit Anfuehrungszeichen oder Backslash wuerde ein unmaskiertes
AppleScript zerlegen — dann ginge das Popup gar nicht mehr auf und die Zeit
waere still verloren. Deshalb wird hier mit absichtlich fiesen Namen geprueft,
ob das erzeugte Skript noch kompiliert.
"""

import os
import subprocess
import sys
import tempfile
import types

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WURZEL, "time_tracker"))
os.environ.update(SUPABASE_URL="http://test", SUPABASE_ANON_KEY="k",
                  APP_SECRET="s", PERSON="tim")

import popup  # noqa: E402

fehler = []


def pruefe(name, bedingung, zusatz=""):
    if bedingung:
        print(f"  {name}: ok")
    else:
        fehler.append(name + (" — " + zusatz if zusatz else ""))
        print(f"  {name}: FEHLGESCHLAGEN {zusatz}")


# ---- 1) Erzeugtes AppleScript ----
ECHTES_FETCH = popup.fetch_options   # fuer Test 3 aufheben
popup.fetch_options = lambda kind: (
    ['Kunde "Müller" & Co', 'Back\\slash', 'XPO intern'] if kind == "zuordnung"
    else ['Deepwork', 'Sonstiges']
)

erzeugt = {}
popup.subprocess.run = lambda args, **kw: (
    erzeugt.__setitem__("script", args[-1]),
    types.SimpleNamespace(returncode=0, stdout="", stderr="")
)[1]
popup.run_flow()
skript = erzeugt["script"]

with tempfile.NamedTemporaryFile("w", suffix=".applescript", delete=False, encoding="utf-8") as f:
    f.write(skript)
    pfad = f.name
ergebnis = subprocess.run(["osacompile", "-o", "/dev/null", pfad],
                          capture_output=True, text=True)
os.unlink(pfad)
pruefe("AppleScript kompiliert (auch mit Anführungszeichen im Kundennamen)",
       ergebnis.returncode == 0, ergebnis.stderr.strip())

pruefe("Nur noch zwei Auswahlschritte", skript.count("choose from list") == 2,
       f"waren {skript.count('choose from list')}")
pruefe("Kundenfrage kommt zuerst", skript.index("Für wen?") < skript.index("Was für Arbeit"))
pruefe("Aktivität wird nicht mehr erfragt", "Aktivität" not in skript)

# ---- 2) Auswertung der Antwort ----
gespeichert = []
popup.post_entry = lambda state, zuordnung: gespeichert.append((state, zuordnung))
popup.acquire_lock = lambda: True
popup.release_lock = lambda: None

faelle = [
    ("XPO intern" + popup.SEP + "Deepwork", ("Deepwork", "XPO intern"), "Normalfall"),
    ("PAUSE", ("Pause", None), "Pause"),
    (popup.SEP + "Deepwork", ("Deepwork", None), "Zuordnung übersprungen"),
]
for antwort, erwartet, name in faelle:
    gespeichert.clear()
    popup.run_flow = lambda a=antwort: a
    popup.main()
    pruefe(name, bool(gespeichert) and gespeichert[0] == erwartet,
           f"war {gespeichert[0] if gespeichert else None}, erwartet {erwartet}")

for antwort, name in [("XPO intern" + popup.SEP, "Ohne State wird nichts gespeichert"),
                      ("CANCELLED", "Abbruch speichert nichts")]:
    gespeichert.clear()
    popup.run_flow = lambda a=antwort: a
    popup.main()
    pruefe(name, not gespeichert, f"hat {gespeichert} gespeichert")

# ---- 3) Rückfall, wenn die Datenbank nicht erreichbar ist ----
def netz_weg(*a, **k):
    raise OSError("kein Netz")
popup.fetch_options = ECHTES_FETCH        # nicht mehr die Attrappe aus Test 1
popup.urllib.request.urlopen = netz_weg
pruefe("Ohne Netz kommen die Rückfall-States", popup.fetch_options("state") == popup.STATES_FALLBACK)
pruefe("Ohne Netz kommt die Rückfall-Kundenliste", popup.fetch_options("zuordnung") == popup.ZUORDNUNG_FALLBACK)

print()
if fehler:
    print("FEHLGESCHLAGEN:")
    for f in fehler:
        print("  - " + f)
    sys.exit(1)
print("Popup-Test bestanden.")
