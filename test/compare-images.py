#!/usr/bin/env python3
"""Vergleicht Screenshots paarweise und meldet, wo sie sich unterscheiden.

Aufruf: compare-images.py <referenz> <neu> <name> [<referenz> <neu> <name> ...]

Ausgabe ist bewusst grob: es geht nicht um einzelne Pixel, sondern um die
Frage "hat sich das Layout verschoben?". Bei Unterschieden wird ein Bild mit
den markierten Stellen unter test/diff/*.png abgelegt.
"""

import os
import sys
from PIL import Image, ImageChops

# Ab wie vielen abweichenden Pixeln gilt eine Seite als veraendert.
# Nicht 0, weil Schrift-Antialiasing zwischen Laeufen minimal schwankt.
TOLERANZ_PIXEL = 200
# Ab welchem Farbabstand ein Pixel ueberhaupt als abweichend zaehlt (0-255).
TOLERANZ_FARBE = 12

args = sys.argv[1:]
if not args or len(args) % 3 != 0:
    print(__doc__)
    sys.exit(2)

problems = []

for i in range(0, len(args), 3):
    ref_path, new_path, name = args[i], args[i + 1], args[i + 2]
    try:
        ref = Image.open(ref_path).convert("RGB")
        new = Image.open(new_path).convert("RGB")
    except FileNotFoundError as e:
        problems.append(f"{name}: Bild fehlt ({e.filename})")
        continue

    if ref.size != new.size:
        problems.append(
            f"{name}: Seitengroesse geaendert — vorher {ref.size[0]}x{ref.size[1]}, "
            f"jetzt {new.size[0]}x{new.size[1]}. "
            "Das heisst fast immer: etwas ist hoeher oder breiter geworden."
        )
        continue

    diff = ImageChops.difference(ref, new).convert("L")
    maske = diff.point(lambda p: 255 if p > TOLERANZ_FARBE else 0)
    abweichend = sum(maske.histogram()[1:])

    if abweichend > TOLERANZ_PIXEL:
        kasten = maske.getbbox()
        os.makedirs("test/diff", exist_ok=True)
        out = f"test/diff/{name.split()[0].lower()}.png"
        try:
            ueberlagert = new.copy()
            rot = Image.new("RGB", new.size, (255, 0, 0))
            ueberlagert.paste(rot, (0, 0), maske)
            ueberlagert.save(out)
            hinweis = f" Markierte Stellen: {out}"
        except Exception:
            hinweis = ""
        problems.append(
            f"{name}: {abweichend} abweichende Pixel, betroffener Bereich "
            f"y={kasten[1]}–{kasten[3]}, x={kasten[0]}–{kasten[2]}.{hinweis}"
        )
    else:
        print(f"  {name}: unveraendert ({abweichend} Pixel Abweichung)")

if problems:
    print("\nVISUELLE ABWEICHUNG:")
    for p in problems:
        print("  - " + p)
    print("\nWenn die Aenderung gewollt ist, neue Referenz aufnehmen:")
    print("  ./test/run-visual.sh baseline")
    sys.exit(1)

print("Visuell unveraendert.")
