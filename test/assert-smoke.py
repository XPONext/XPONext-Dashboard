#!/usr/bin/env python3
"""Prueft das Ergebnis des Rauchtests.

Die erwarteten Werte ergeben sich aus den Testdaten in test/stub.html:

  Umsatz    2500 + 1800                        = 4.300 EUR
  Closes    zwei Eintraege im closes-Array     = 2
  Termine   5 + 2                              = 7
  Wochen    nur KW 5 zaehlt; der Eintrag vom
            05.01.2025 liegt ausserhalb von
            WEEKS und faellt bewusst heraus    = 1
  Zeit      2 x 30 Min, Pause zaehlt nicht     = 1 Std.
  Aufgaben  je eine in "In Arbeit" und "Done"

Wenn sich Testdaten oder Logik aendern, gehoeren die Erwartungen hier mit
angepasst — sonst prueft der Test nichts mehr.
"""

import html
import re
import sys

if len(sys.argv) < 2:
    print("Aufruf: assert-smoke.py <dom.html>")
    sys.exit(2)

dom = open(sys.argv[1], encoding="utf-8").read()


def text_of(element_id):
    m = re.search(r'id="' + re.escape(element_id) + r'"[^>]*>(.*?)<', dom, re.S)
    return html.unescape(m.group(1)).strip() if m else None


def count(pattern):
    return len(re.findall(pattern, dom))


failures = []


def check(name, actual, expected):
    if actual != expected:
        failures.append(f"{name}: erwartet {expected!r}, war {actual!r}")


# 1) Sind ueberhaupt Fehler aufgetreten?
banner = text_of("smokeResult")
if banner is None:
    print("FEHLGESCHLAGEN: Die Testseite hat kein Ergebnis geliefert.")
    print("Wahrscheinlich hat ein Modul nicht geladen — index.html direkt im")
    print("Browser oeffnen und die Konsole ansehen.")
    sys.exit(1)
if not banner.startswith("SMOKE: OK"):
    m = re.search(r'id="smokeResult"[^>]*>(.*?)</div>', dom, re.S)
    print("FEHLGESCHLAGEN: JavaScript-Fehler beim Rendern\n")
    print(html.unescape(m.group(1)).strip() if m else banner)
    sys.exit(1)

# 2) Stimmen die gerechneten Zahlen?
check("Umsatz gesamt", text_of("dashUmsatzIst"), "€4.300")
check("Closes", text_of("statCloses"), "2")
check("Termine gebucht", text_of("statTermineGebucht"), "7")
check("Termine Show-up", text_of("statTermineShowup"), "5")
check("Erfasste Wochen", text_of("streakWeeksLogged"), "1")
check("Zeittracking heute (Std.)", text_of("ztTodayHours"), "1")

# 3) Wurde ueberhaupt gerendert?
if count(r'class="bar-fill') < 10:
    failures.append("Zu wenige Fortschrittsbalken — das Dashboard wurde nicht gerendert.")
# Auf das Kartenelement selbst zielen, nicht auf seine Unterelemente
# (kanban-card-text, kanban-card-badges tragen ein aehnliches Praefix).
projects = count(r'class="project-card["\s]')
if projects != 1:
    failures.append(f"Projektkarten: erwartet 1, waren {projects}")
tasks = count(r'class="kanban-card["\s]')
if tasks != 2:
    failures.append(f"Aufgabenkarten: erwartet 2, waren {tasks}")
if count(r"<tr") < 25:
    failures.append("Verlaufstabelle hat zu wenige Zeilen.")

# 4) Werden Nutzertexte maskiert? (Der Testtask enthaelt absichtlich HTML.)
if "Angebot &lt;b&gt;schreiben&lt;/b&gt;" not in dom:
    failures.append("Aufgabentext wurde nicht maskiert — moegliche XSS-Luecke.")

if failures:
    print("FEHLGESCHLAGEN:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)

print("Rauchtest bestanden — Module laden, Zahlen stimmen, Texte werden maskiert.")
