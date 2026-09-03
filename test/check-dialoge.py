#!/usr/bin/env python3
"""Prueft statisch, dass jeder Dialog nach dem Speichern die Ansicht auffrischt.

  python3 test/check-dialoge.py

Hintergrund: Ein Umsatz liess sich anlegen, landete in der Datenbank — und die
Ansicht blieb stehen. Man traegt ihn dann ein zweites Mal ein. Ursache war ein
einzelner `await openModal(...)` ohne anschliessendes Neuladen.

Im Browser laesst sich das schlecht pruefen: Ob ein Neuzeichnen schon
stattgefunden hat, haengt an der Ablaufsteuerung, und entsprechende
Zeitschranken haben wiederholt Fehler gemeldet, die keine waren. Die Struktur
dagegen ist eindeutig nachlesbar.

Regel: Jeder `openModal`-Aufruf mit `onSubmit` muss danach entweder
  - das Ergebnis auswerten und neu laden (`if(ergebnis) await neuLaden()`), oder
  - innerhalb von onSubmit selbst neu zeichnen (`renderX()`).
"""

import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIEWS = os.path.join(WURZEL, "js", "views")

fehler = []
geprueft = 0

for datei in sorted(os.listdir(VIEWS)):
    if not datei.endswith(".js"):
        continue
    pfad = os.path.join(VIEWS, datei)
    quelle = open(pfad, encoding="utf-8").read()

    for treffer in re.finditer(r"await openModal\(\{", quelle):
        start = treffer.start()
        zeile = quelle[:start].count("\n") + 1

        # Ende des Aufrufs: die erste Zeile, die genau "  });" ist
        ende = quelle.find("\n  });", start)
        if ende == -1:
            fehler.append(f"{datei}:{zeile} — Ende des openModal-Aufrufs nicht gefunden")
            continue
        aufruf = quelle[start:ende]
        danach = quelle[ende:ende + 300]

        if "onSubmit" not in aufruf:
            continue                      # reiner Auswahldialog, nichts zu speichern
        geprueft += 1

        # Variante 1: Ergebnis auswerten und neu laden
        laedt_danach = re.search(r"if\s*\(\s*\w+\s*\)\s*await\s+(neuLaden|fetchAllData)", danach)
        # Variante 2: onSubmit zeichnet selbst
        zeichnet_selbst = re.search(r"render[A-Z]\w*\(\)", aufruf)

        if not (laedt_danach or zeichnet_selbst):
            fehler.append(
                f"{datei}:{zeile} — speichert, frischt aber nicht auf. "
                "Nach dem Dialog `if(ergebnis) await neuLaden();` ergaenzen "
                "oder in onSubmit selbst neu zeichnen."
            )

print(f"{geprueft} speichernde Dialoge geprueft.")
if fehler:
    print("\nFEHLGESCHLAGEN:")
    for f in fehler:
        print("  - " + f)
    sys.exit(1)
print("Alle speichernden Dialoge frischen die Ansicht auf.")
