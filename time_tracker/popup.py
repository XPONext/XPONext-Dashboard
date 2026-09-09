#!/usr/bin/env python3
"""
Zeittracking-Popup via osascript (native macOS Dialoge).
Wird alle 30 Minuten vom Loop aufgerufen, den der LaunchAgent beim Anmelden startet.

Der komplette Ablauf läuft in EINEM osascript-Aufruf (kein Python-Zwischenschritt
zwischen den Dialogen), damit es sich beim Durchklicken flüssig anfühlt:

  1. Startdialog: "Feierabend" (beendet den Loop für heute), "Pause"
     (überspringt alles) oder "Jetzt eintragen"
  2. Für wen? — die Kundenliste, live aus Supabase
  3. Was? — der State, ebenfalls live aus Supabase
  4. POST an Supabase

Beide Listen kommen aus der Datenbank, nicht aus diesem Skript. Kategorien
ändern heißt deshalb: eine Zeile in Supabase ändern — kein erneutes install.sh
auf beiden Macs.

Der frühere vierte Schritt "Aktivität" ist entfallen. Er überschnitt sich mit
dem State ("Kommunikation" vs. "Meeting", "Abarbeiten" vs. "Admin") und ist mit
einer echten Kundenzuordnung ohnehin redundant. Aus vier Fenstern alle 30
Minuten werden drei.

Die Kundenfrage steht jetzt VOR der State-Frage: Für wen gearbeitet wurde,
weiß man sofort; was für eine Art Arbeit es war, muss man kurz überlegen.
"""

import base64
import json
import re
import sys
import os
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
SEP = "\x1f"  # ASCII Unit Separator — trennt die Rückgabewerte aus AppleScript


def _load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())


_load_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
APP_SECRET = os.environ.get("APP_SECRET", "")
PERSON = os.environ.get("PERSON", "")  # "tim" oder "simon"

# ─── Kategorien ────────────────────────────────────────────────────────────

# Beide Listen werden live aus Supabase geladen. Die Konstanten hier greifen
# nur, wenn die Datenbank nicht erreichbar ist — dann soll das Popup trotzdem
# etwas Sinnvolles anbieten statt gar nicht aufzugehen.
STATES_FALLBACK = ["Deepwork", "Kommunikation", "Abarbeiten", "Planung", "Sonstiges"]
ZUORDNUNG_FALLBACK = ["XPO intern", "Neukunden", "Sonstiges"]

SKIP_LABEL = "Überspringen"

# Ein "tell application"-Block hat in AppleScript ein Standard-Timeout von 120
# Sekunden. Steht ein Dialog laenger offen, raeumt System Events ihn mit Fehler
# -1712 ab: Das Fenster verschwindet, und der Klick darauf geht ins Leere.
# Genau deshalb war ein Popup nach drei, vier Minuten nicht mehr bedienbar.
DIALOG_TIMEOUT = 7200   # 2 Stunden — laenger steht kein Fenster sinnvoll offen

# Ab wann gilt der Rechner als unbenutzt. Wer laenger nicht getippt oder die
# Maus bewegt hat, sitzt nicht davor — dann soll kein Fenster aufgehen, das
# sich bis zur Rueckkehr stapelt.
LEERLAUF_GRENZE = 10 * 60   # Sekunden
EXIT_NIEMAND_DA = 10        # Rueckgabewert an start_loop.sh

# --- Tagesabschluss: Wie viele Calls heute? ---
# Kommt einmal taeglich ab dieser Uhrzeit, zusaetzlich zum normalen Fenster.
CALL_FRAGE_AB_STUNDE = 18
CALL_TARGET_FALLBACK = 20        # wenn Close nicht erreichbar ist
CLOSE_API_KEY = os.environ.get("CLOSE_API_KEY", "").strip()


# ─── AppleScript-Helfer ──────────────────────────────────────────────────────

def _as_str(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _as_list(items):
    return "{" + ", ".join(f'"{_as_str(i)}"' for i in items) + "}"


def _choose_step(var, items, prompt, allow_skip=False, step_no=None, total=None):
    """Baut den AppleScript-Block für einen reinen Auswahlschritt (kein Freitext).
    "Sonstiges" ist überall ein ganz normaler Listeneintrag — keine Extra-Eingabe."""
    options = list(items) + ([SKIP_LABEL] if allow_skip else [])
    label = f"({step_no}/{total}) {prompt}" if step_no else prompt
    skip_block = ""
    if allow_skip:
        skip_block = f'''if {var} is "{_as_str(SKIP_LABEL)}" then
            set {var} to ""
        end if'''
    return f'''
        set chosen{var} to choose from list {_as_list(options)} with prompt "{_as_str(label)}" with title "XPO Zeittracker" OK button name "Weiter" cancel button name "Abbrechen"
        if chosen{var} is false then return "CANCELLED"
        set {var} to item 1 of chosen{var}
        {skip_block}
    '''


def run_flow():
    """Führt den gesamten Dialog-Ablauf in einem osascript-Prozess aus.
    Gibt "STOP", "PAUSE", "CANCELLED" oder "zuordnung<SEP>state" zurück.

    Läuft komplett über "System Events" statt direkt über osascript/StandardAdditions:
    Wenn der LaunchAgent das Skript automatisch (ohne vorherige Terminal-Session)
    startet, bekommt ein reines "activate" den Dialog nicht zuverlässig in den
    Vordergrund/Fokus — System Events ist ein dauerhaft laufender Prozess und
    übernimmt das robuster.
    """
    zuordnung_optionen = fetch_options("zuordnung")
    state_optionen = fetch_options("state")
    script = f'''
        with timeout of {DIALOG_TIMEOUT} seconds
        tell application "System Events"
            activate
            set startBtn to button returned of (display dialog "Was machst du gerade?" buttons {{"Feierabend", "Pause", "Jetzt eintragen"}} default button "Jetzt eintragen" with title "XPO Zeittracker")
            if startBtn is "Feierabend" then return "STOP"
            if startBtn is "Pause" then return "PAUSE"

            {_choose_step("zuordnungVal", zuordnung_optionen, "Für wen?", step_no=1, total=2)}
            {_choose_step("stateVal", state_optionen, "Was für Arbeit war das?", step_no=2, total=2)}

            return zuordnungVal & "{SEP}" & stateVal
        end tell
        end timeout
    '''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def show_error(msg=""):
    text = _as_str(f"Fehler beim Speichern.{chr(10)}{msg}")
    script = f'''
        with timeout of {DIALOG_TIMEOUT} seconds
        tell application "System Events"
            activate
            display dialog "{text}" buttons {{"OK"}} default button "OK" with title "XPO Zeittracker — Fehler"
        end tell
        end timeout
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)


# ─── Supabase ────────────────────────────────────────────────────────────────

def fetch_options(kind):
    """Holt eine Auswahlliste live aus Supabase.

    kind = "zuordnung" -> die Kundenliste (Sicht zuordnung_optionen auf customers)
    kind = "state"     -> die Arbeitsarten (Tabelle tracker_options)

    Fällt bei jedem Fehler auf die Konstanten oben zurück: Ohne Internet soll
    das Popup trotzdem aufgehen, sonst geht die Zeit verloren.
    """
    if kind == "zuordnung":
        url = f"{SUPABASE_URL}/rest/v1/zuordnung_optionen?select=name&active=eq.true&order=sort_order.asc"
        fallback = ZUORDNUNG_FALLBACK
    else:
        url = f"{SUPABASE_URL}/rest/v1/tracker_options?select=name&kind=eq.state&active=eq.true&order=sort_order.asc"
        fallback = STATES_FALLBACK

    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "x-app-secret": APP_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            names = [r["name"] for r in json.loads(resp.read())]
            return names if names else fallback
    except Exception:
        return fallback


def post_entry(state, zuordnung):
    payload = {
        "person": PERSON,
        "ts": datetime.now(timezone.utc).isoformat(),
        "duration_minutes": 30,
        "state": state,
        "zuordnung": zuordnung,
        # aktivitaet wird nicht mehr erfragt. Die Spalte bleibt in der Datenbank,
        # damit die bisherigen Einträge lesbar bleiben.
        "aktivitaet": None,
    }
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/time_entries",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "x-app-secret": APP_SECRET,
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        show_error(str(e))
        return False


def leerlauf_sekunden():
    """Wie lange die letzte Tastatur- oder Mauseingabe her ist.

    Waehrend der Rechner schlaeft, laeuft diese Zeit weiter — nach dem
    Aufklappen ist der Wert also gross und faellt beim ersten Tastendruck auf
    null. Genau das brauchen wir: Nur fragen, wenn wirklich jemand da ist.

    Bei Unklarheit 0 zurueckgeben, also lieber fragen als still verschlucken.
    """
    try:
        r = subprocess.run(["ioreg", "-c", "IOHIDSystem"],
                           capture_output=True, text=True, timeout=10)
        for zeile in r.stdout.splitlines():
            if "HIDIdleTime" in zeile:
                return int(zeile.rsplit("=", 1)[1].strip()) / 1_000_000_000
    except Exception:
        pass
    return 0


# ─── Tagesabschluss: Calls ───────────────────────────────────────────────────

def close_inbox():
    """Zaehlt die Tasks in der Close-Inbox: (gesamt, davon ueberfaellig).

    "Inbox" ist in Close alles, was heute oder frueher faellig ist. Die beiden
    Zahlen bleiben getrennt, weil Rueckstand kein Tagespensum ist — sonst
    waechst das Ziel genau dann, wenn man ohnehin hinterherhaengt.

    Ohne Schluessel oder ohne Netz: (None, None). Der Tracker soll deswegen
    nicht stehenbleiben.
    """
    if not CLOSE_API_KEY:
        return (None, None)

    heute = datetime.now().strftime("%Y-%m-%d")
    kopf = {
        "Authorization": "Basic " + base64.b64encode(
            (CLOSE_API_KEY + ":").encode()).decode(),
        "Accept": "application/json",
    }

    def zaehle(zusatz):
        url = ("https://api.close.com/api/v1/task/"
               "?is_complete=false&_limit=1&" + zusatz)
        req = urllib.request.Request(url, headers=kopf)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read()).get("total_results")

    try:
        me = urllib.request.Request("https://api.close.com/api/v1/me/", headers=kopf)
        with urllib.request.urlopen(me, timeout=15) as resp:
            uid = json.loads(resp.read()).get("id")
        if not uid:
            return (None, None)
        gesamt = zaehle(f"assigned_to={uid}&date__lte={heute}")
        spaet  = zaehle(f"assigned_to={uid}&date__lt={heute}")
        return (gesamt, spaet)
    except Exception:
        return (None, None)


# Nicht jede erledigte Task ist ein Gespraech. "Konzept zusenden" oder
# "E-Mail schreiben" sind Schreibtischarbeit — wer die mitzaehlt, schoent die
# Zahl. Eingeteilt wird am Task-Text, weil der feststeht: Ein Lead-Status
# aendert sich DURCH den Anruf, ein vergangener Tag waere damit rueckwirkend
# falsch eingeordnet.
# Ein Rueckruf ist ein Gespraech mit jemandem, der sich schon gemeldet hat —
# also warm. "RR" ist die Kurzform, die bei euch vorkommt; sie wird mit
# Wortgrenzen gesucht, damit sie nicht mitten in anderen Woertern trifft.
WARM_MUSTER = ("follow up", "follow-up", "followup", "rückruf", "rueckruf")
WARM_KURZ   = (r"\brr\b",)
KALT_MUSTER = ("cold email", "cold call", "re-engagement", "reengagement")

# Ein Termin ist das Ergebnis von Calls, nicht selbst einer — sonst zaehlt
# man den Erfolg doppelt.
KEIN_CALL   = ("zusenden", "zuschicken", "e-mail schreiben", "email schreiben",
               "e-mail erinnerung", "angebot", "konzept", "lead liste",
               "meeting", "rechnung", "vertrag", "video", "einladung",
               "gedanken machen", "update zur")


def einordnen(text):
    """'warm', 'kalt' oder None (kein Gespraech).

    Eingeteilt wird ausschliesslich am Task-Text. Notizen werden nirgends
    gelesen — ein "Rueckruf", der nur in einer Notiz steht, zaehlt also nicht.
    """
    t = (text or "").lower()
    warm = (any(m in t for m in WARM_MUSTER)
            or any(re.search(m, t) for m in WARM_KURZ))
    if warm:
        return "warm"
    if any(m in t for m in KEIN_CALL):
        return None
    if any(m in t for m in KALT_MUSTER):
        return "kalt"
    return None


def close_erledigte_calls():
    """Zaehlt die heute erledigten Tasks, die Gespraeche sind.

    Rueckgabe: (warm, kalt, uebersprungen) oder (None, None, None), wenn
    Close nicht erreichbar ist.
    """
    if not CLOSE_API_KEY:
        return (None, None, None)

    heute = datetime.now().strftime("%Y-%m-%d")
    kopf = {
        "Authorization": "Basic " + base64.b64encode(
            (CLOSE_API_KEY + ":").encode()).decode(),
        "Accept": "application/json",
    }
    try:
        me = urllib.request.Request("https://api.close.com/api/v1/me/", headers=kopf)
        with urllib.request.urlopen(me, timeout=15) as resp:
            uid = json.loads(resp.read()).get("id")
        if not uid:
            return (None, None, None)

        warm = kalt = weg = 0
        # Absteigend nach Aenderungsdatum: sobald ein aelterer Tag kommt,
        # sind wir durch und muessen nicht weiterblaettern.
        for skip in range(0, 600, 200):
            url = ("https://api.close.com/api/v1/task/?is_complete=true"
                   f"&assigned_to={uid}&_limit=200&_skip={skip}"
                   "&_order_by=-date_updated")
            req = urllib.request.Request(url, headers=kopf)
            with urllib.request.urlopen(req, timeout=25) as resp:
                zeilen = json.loads(resp.read()).get("data", [])
            if not zeilen:
                break
            fertig = False
            for t in zeilen:
                tag = (t.get("date_updated") or "")[:10]
                if tag > heute:
                    continue
                if tag < heute:
                    fertig = True
                    break
                art = einordnen(t.get("text"))
                if art == "warm":
                    warm += 1
                elif art == "kalt":
                    kalt += 1
                else:
                    weg += 1
            if fertig or len(zeilen) < 200:
                break
        return (warm, kalt, weg)
    except Exception:
        return (None, None, None)


def calls_schon_erfasst():
    """Wurde die Call-Frage heute schon beantwortet?"""
    marke = ROOT / ".tmp" / "calls.date"
    try:
        return marke.read_text().strip() == datetime.now().strftime("%Y-%m-%d")
    except Exception:
        return False


def calls_merken():
    (ROOT / ".tmp").mkdir(exist_ok=True)
    (ROOT / ".tmp" / "calls.date").write_text(datetime.now().strftime("%Y-%m-%d"))


def frage_calls():
    """Fragt am Tagesende nach der Anzahl Calls. Gibt True zurueck, wenn die
    Frage abgehandelt ist (auch bei Abbruch) — dann kommt sie heute nicht mehr."""
    gesamt, spaet = close_inbox()
    heute_faellig = None
    if gesamt is not None and spaet is not None:
        heute_faellig = max(0, gesamt - spaet)

    if heute_faellig is not None:
        vorgabe = heute_faellig
        zusatz = f"Heute fällig in Close: {heute_faellig}"
        if spaet:
            zusatz += f" · zusätzlich {spaet} überfällig"
    else:
        vorgabe = CALL_TARGET_FALLBACK
        zusatz = f"Close nicht erreichbar — Vorgabe {vorgabe}"

    # Vorschlag aus den heute erledigten Close-Tasks. Vorbelegt statt
    # automatisch gespeichert: Wer die Zahl sieht, merkt sofort, wenn Close
    # etwas nicht mitbekommen hat.
    warm, kalt, weg = close_erledigte_calls()
    vorschlag = ""
    if warm is not None:
        vorschlag = str(warm + kalt)
        zusatz += f"\n\nIn Close erledigt: {warm} warm · {kalt} kalt"
        if weg:
            zusatz += f"\n({weg} weitere Tasks sind keine Gespräche)"

    frage = f"Wie viele Calls hast du heute gemacht?\n\n{zusatz}"
    script = f'''
        with timeout of {DIALOG_TIMEOUT} seconds
        tell application "System Events"
            activate
            set antwort to display dialog {_as_str(frage)} default answer {_as_str(vorschlag)} ¬
                buttons {{"Überspringen", "Speichern"}} default button "Speichern" ¬
                with title "XPO Zeittracker — Tagesabschluss"
            if button returned of antwort is "Überspringen" then return "SKIP"
            return text returned of antwort
        end tell
        end timeout
    '''
    try:
        r = subprocess.run(["osascript", "-e", script],
                           capture_output=True, text=True, timeout=900)
    except Exception:
        return False
    if r.returncode != 0:
        return True          # abgebrochen — heute nicht noch einmal fragen

    roh = (r.stdout or "").strip()
    if roh == "SKIP":
        return True

    ziffern = "".join(z for z in roh if z.isdigit())
    if not ziffern:
        return True
    post_calls(int(ziffern), gesamt, spaet, warm, kalt)
    return True


def post_calls(anzahl, target, target_overdue, warm=None, kalt=None):
    nutzlast = {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "person": PERSON,
        "calls": anzahl,
        "calls_warm": warm,
        "calls_cold": kalt,
        "target": target,
        "target_overdue": target_overdue,
        "source": "popup",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/daily_calls?on_conflict=date,person",
        data=json.dumps(nutzlast).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "x-app-secret": APP_SECRET,
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        show_error("Calls konnten nicht gespeichert werden: " + str(e))
        return False


# ─── Sperre gegen gestapelte Popups ──────────────────────────────────────────
# Wenn der Laptop länger zu/weg war, feuert der 30-Min-Trigger trotzdem für jedes
# verpasste Zeitfenster neu — und weil das alte Fenster ja unbeantwortet offen
# bleibt, stapeln sich so mehrere Popups übereinander. Diese Sperre lässt immer
# nur EIN offenes/unbeantwortetes Fenster zu: Solange eins offen ist, wird jeder
# weitere Trigger still übersprungen (kein neues Fenster, nichts getrackt) —
# erst wenn du das offene beantwortest/schließt, kann beim nächsten reguären
# 30-Min-Trigger wieder ein neues aufgehen.

LOCK_FILE = ROOT / ".tmp" / "popup.lock"
STALE_LOCK_SECONDS = 6 * 60 * 60  # falls ein Prozess abstürzt, Sperre nach 6h ignorieren


def acquire_lock():
    LOCK_FILE.parent.mkdir(exist_ok=True)
    try:
        fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        return True
    except FileExistsError:
        try:
            age = time.time() - LOCK_FILE.stat().st_mtime
        except FileNotFoundError:
            return acquire_lock()  # Datei ist zwischen den beiden Checks verschwunden
        if age > STALE_LOCK_SECONDS:
            LOCK_FILE.unlink(missing_ok=True)
            return acquire_lock()
        return False


def release_lock():
    LOCK_FILE.unlink(missing_ok=True)


# ─── Hauptprogramm ───────────────────────────────────────────────────────────

def main():
    if not acquire_lock():
        return  # es hängt noch ein unbeantwortetes Fenster — nichts Neues zeigen

    try:
        # Sitzt ueberhaupt jemand davor? Ohne diese Pruefung feuert der Loop
        # waehrend der Abwesenheit weiter, und beim Aufklappen stehen mehrere
        # unbeantwortete Fenster uebereinander. Der Loop fragt danach schneller
        # nach, damit man nach der Rueckkehr nicht bis zur naechsten halben
        # Stunde warten muss.
        if leerlauf_sekunden() > LEERLAUF_GRENZE:
            sys.exit(EXIT_NIEMAND_DA)   # das finally gibt die Sperre frei

        if not SUPABASE_URL or not SUPABASE_ANON_KEY or not APP_SECRET or not PERSON:
            show_error("Konfiguration fehlt — .env prüfen (SUPABASE_URL, SUPABASE_ANON_KEY, APP_SECRET, PERSON).")
            return

        # Tagesabschluss zuerst: ab 18 Uhr einmal taeglich nach den Calls
        # fragen. Laeuft unabhaengig vom normalen Zeitfenster — auch wenn
        # danach "Feierabend" gedrueckt wird, ist die Zahl schon erfasst.
        if datetime.now().hour >= CALL_FRAGE_AB_STUNDE and not calls_schon_erfasst():
            if frage_calls():
                calls_merken()

        result = run_flow()
        if result is None or result == "CANCELLED":
            return  # abgebrochen — nichts speichern

        if result == "STOP":
            # Feierabend, zwei Dateien mit zwei Aufgaben:
            #   stop.flag       — kurzlebiges Signal an start_loop.sh ("beende dich
            #                     nach diesem Durchlauf"), wird dort gleich gelöscht
            #   feierabend.date — bleibt liegen und merkt sich den Tag, damit
            #                     check_loop.sh den Loop nicht sofort wieder
            #                     anwirft. Ab morgen früh läuft er von selbst.
            (ROOT / ".tmp").mkdir(exist_ok=True)
            (ROOT / ".tmp" / "stop.flag").touch()
            (ROOT / ".tmp" / "feierabend.date").write_text(datetime.now().strftime("%Y-%m-%d"))
            return

        if result == "PAUSE":
            post_entry("Pause", None)
            return

        # Defensiv: fehlende Felder (z.B. durch einen unerwarteten AppleScript-Rückgabewert)
        # einfach leer lassen statt eine Fehlermeldung zu zeigen — besser ein unvollständiger
        # Eintrag als ein nerviger Error-Dialog.
        parts = result.split(SEP)
        parts += [""] * (2 - len(parts))
        zuordnung, state = parts[:2]
        if not state:
            return  # nichts Sinnvolles zum Speichern
        post_entry(state, zuordnung or None)
    finally:
        release_lock()


if __name__ == "__main__":
    main()
