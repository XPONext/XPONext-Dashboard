#!/usr/bin/env python3
"""Prueft das Ergebnis des Rauchtests.

Die erwarteten Werte ergeben sich aus den Testdaten in test/stub.html:

  Umsatz    2500 + 1800                        = 4.300 EUR
  Closes    zwei Eintraege im closes-Array     = 2
  Termine   5 + 2                              = 7
  Wochen    nur KW 5 zaehlt; der Eintrag vom
            05.01.2025 liegt ausserhalb von
            WEEKS und faellt bewusst heraus    = 1
  Zeit      45 x 30 Min, Pause zaehlt nicht    = 22,5 Std.
  Aufgaben  je eine in "In Arbeit" und "Done"
  Verlauf   Diagramme gezeichnet, leere Wochen zusammengefasst

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
# Der Dialogteil muss wirklich gelaufen sein — sonst prueft der Test die
# Popups gar nicht und meldet trotzdem "bestanden".
ERWARTETE_DIALOGPRUEFUNGEN = 42

if not banner.startswith("SMOKE: OK"):
    m = re.search(r'id="smokeResult"[^>]*>(.*?)</div>', dom, re.S)
    print("FEHLGESCHLAGEN: JavaScript-Fehler beim Rendern\n")
    print(html.unescape(m.group(1)).strip() if m else banner)
    sys.exit(1)

m = re.search(r"Dialog: (\d+) Pruefungen bestanden", banner)
if not m:
    print("FEHLGESCHLAGEN: Die Dialogpruefung ist gar nicht gelaufen.")
    sys.exit(1)
if int(m.group(1)) != ERWARTETE_DIALOGPRUEFUNGEN:
    print(f"FEHLGESCHLAGEN: {m.group(1)} Dialogpruefungen statt {ERWARTETE_DIALOGPRUEFUNGEN} — "
          "es wurde eine uebersprungen.")
    sys.exit(1)

# 2) Stimmen die gerechneten Zahlen?
check("Umsatz gesamt", text_of("dashUmsatzIst"), "€4.300")
check("Closes", text_of("statCloses"), "2")
check("Termine gebucht", text_of("statTermineGebucht"), "7")
check("Termine Show-up", text_of("statTermineShowup"), "5")
check("Erfasste Wochen", text_of("streakWeeksLogged"), "1")
check("Zeittracking heute (Std.)", text_of("ztTodayHours"), "22,5")

# 3) Wurde ueberhaupt gerendert?
if count(r'class="bar-fill') < 10:
    failures.append("Zu wenige Fortschrittsbalken — das Dashboard wurde nicht gerendert.")
# Auf das Kartenelement selbst zielen, nicht auf seine Unterelemente
# (kanban-card-text, kanban-card-badges tragen ein aehnliches Praefix).
projects = count(r'class="project-card["\s]')
if projects != 2:
    failures.append(f"Projektkarten: erwartet 2 (Filter steht am Ende auf alle), waren {projects}")
# Wieder 2: Die Dialogpruefung legt zwar eine dritte Aufgabe an, danach
# erzwingt sie aber einen Speicherfehler. Der laedt den Stand aus der
# Datenbank neu — und damit verschwindet die nur lokal gehaltene Aufgabe.
# Genau das soll passieren: nach einem Fehlschlag darf im Speicher nichts
# stehen, was die Datenbank nicht hat.
tasks = count(r'class="kanban-card["\s]')
if tasks != 2:
    failures.append(f"Aufgabenkarten: erwartet 2 nach dem Neuladen, waren {tasks}")
# Der Verlauf fasst Wochen ohne Eintrag zusammen, statt 25 Zeilen mit
# Gedankenstrichen zu zeigen — geprueft wird deshalb die Faltung selbst.
if count(r'class="leerzeile"') < 1:
    failures.append("Verlauf faltet die leeren Wochen nicht zusammen.")
if count(r"<tr") < 8:
    failures.append("Verlaufstabellen sind leer.")
# Die Diagramme muessen tatsaechlich gezeichnet worden sein
gezeichnet = count(r'class="ch-svg"')
if gezeichnet < 3:
    failures.append(f"Zu wenige Diagramme gezeichnet ({gezeichnet}) — erwartet mindestens 3.")

# 4) Werden Nutzertexte maskiert? (Der Testtask enthaelt absichtlich HTML.)
if "Angebot &lt;b&gt;schreiben&lt;/b&gt;" not in dom:
    failures.append("Aufgabentext wurde nicht maskiert — moegliche XSS-Luecke.")

if failures:
    print("FEHLGESCHLAGEN:")
    for f in failures:
        print("  - " + f)
    sys.exit(1)

print("Rauchtest bestanden — Module laden, Zahlen stimmen, Texte werden maskiert.")
