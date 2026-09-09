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

# Ohne "with timeout" raeumt System Events einen Dialog nach 120 Sekunden mit
# Fehler -1712 ab: Das Fenster verschwindet und der Klick geht ins Leere.
pruefe("Dialog hat ein langes Timeout",
       "with timeout of" in skript and "end timeout" in skript)
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

# ---- 2b) Einordnung der Close-Tasks ----
# An den tatsaechlich vorkommenden Texten geprueft. Der Fall "Karriere planen"
# ist der wichtigste: Das enthaelt "rr" und darf trotzdem kein Rueckruf sein.
for text, erwartet in [
    ("Follow up - Tim", "warm"), ("Follow up simon", "warm"),
    ("Rückruf Herr Meier", "warm"), ("RR Tim", "warm"), ("RR", "warm"),
    ("Re-Engagement — XPO Cold Email", "kalt"),
    ("Absage klären (Anruf) — XPO Cold Email", "kalt"),
    ("Meeting 08.09 10 Uhr", None), ("Konzept zuschicken", None),
    ("Video zusenden", None), ("Vertrag zuschicken", None),
    ("E-Mail schreiben", None), ("Lead Liste zusenden", None),
    ("Karriere planen", None), ("Herr Sperrmüll anrufen", None),
]:
    pruefe(f"Einordnung: {text[:34]}", popup.einordnen(text) == erwartet,
           f"war {popup.einordnen(text)}, erwartet {erwartet}")

# ---- 2c) Kein Fenster, wenn niemand am Rechner sitzt ----
# Ohne diese Pruefung feuert der Loop waehrend der Abwesenheit weiter, und beim
# Aufklappen stehen mehrere unbeantwortete Fenster uebereinander.
def idle(sekunden):
    popup.subprocess.run = lambda a, **k: types.SimpleNamespace(
        stdout=f'    "HIDIdleTime" = {int(sekunden * 1_000_000_000)}\n',
        returncode=0, stderr="")

idle(30 * 60)
pruefe("30 Minuten inaktiv gelten als abwesend",
       popup.leerlauf_sekunden() > popup.LEERLAUF_GRENZE)
idle(5)
pruefe("Wer gerade tippt, wird gefragt",
       popup.leerlauf_sekunden() <= popup.LEERLAUF_GRENZE)

popup.subprocess.run = lambda a, **k: (_ for _ in ()).throw(OSError("ioreg fehlt"))
pruefe("Ohne ioreg lieber fragen als verschlucken", popup.leerlauf_sekunden() == 0)

idle(30 * 60)
popup.acquire_lock = lambda: True
freigegeben = []
popup.release_lock = lambda: freigegeben.append(True)
try:
    popup.main()
    pruefe("Abwesenheit beendet mit Code 10", False, "main() lief durch")
except SystemExit as e:
    pruefe("Abwesenheit beendet mit Code 10", e.code == popup.EXIT_NIEMAND_DA,
           f"war {e.code}")
    pruefe("Sperre wird dabei freigegeben", bool(freigegeben))

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
