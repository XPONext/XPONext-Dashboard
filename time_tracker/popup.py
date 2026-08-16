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

import json
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
        tell application "System Events"
            activate
            set startBtn to button returned of (display dialog "Was machst du gerade?" buttons {{"Feierabend", "Pause", "Jetzt eintragen"}} default button "Jetzt eintragen" with title "XPO Zeittracker")
            if startBtn is "Feierabend" then return "STOP"
            if startBtn is "Pause" then return "PAUSE"

            {_choose_step("zuordnungVal", zuordnung_optionen, "Für wen?", step_no=1, total=2)}
            {_choose_step("stateVal", state_optionen, "Was für Arbeit war das?", step_no=2, total=2)}

            return zuordnungVal & "{SEP}" & stateVal
        end tell
    '''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def show_error(msg=""):
    text = _as_str(f"Fehler beim Speichern.{chr(10)}{msg}")
    script = f'''
        tell application "System Events"
            activate
            display dialog "{text}" buttons {{"OK"}} default button "OK" with title "XPO Zeittracker — Fehler"
        end tell
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
        if not SUPABASE_URL or not SUPABASE_ANON_KEY or not APP_SECRET or not PERSON:
            show_error("Konfiguration fehlt — .env prüfen (SUPABASE_URL, SUPABASE_ANON_KEY, APP_SECRET, PERSON).")
            return

        result = run_flow()
        if result is None or result == "CANCELLED":
            return  # abgebrochen — nichts speichern

        if result == "STOP":
            # Feierabend: Loop nach diesem Durchlauf beenden (start_loop.sh liest
            # die Datei). Beim nächsten Anmelden startet der LaunchAgent neu.
            (ROOT / ".tmp").mkdir(exist_ok=True)
            (ROOT / ".tmp" / "stop.flag").touch()
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
