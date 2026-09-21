#!/usr/bin/env python3
"""
Zieht die Vertriebszahlen des Tages aus Close und schreibt sie nach Supabase.

Läuft als eigener LaunchAgent alle 30 Minuten — unabhängig vom Zeittracker-
Popup und unabhängig davon, ob jemand am Rechner sitzt oder schon Feierabend
gedrückt hat. Genau daran ist der erste Versuch gescheitert: Die Call-Zahl
sollte über ein Fenster um 18 Uhr kommen, aber um 18 Uhr lief der Tracker
meist nicht mehr. Eine Kennzahl darf nicht davon abhängen, dass jemand zu einer
bestimmten Uhrzeit ein Fenster beantwortet.

Was gezählt wird (immer für die Person aus der .env, über deren Close-Key):

  Calls      heute erledigte Tasks, die Gespräche sind — eingeteilt am Task-
             Text in warm ("Follow up", "Rückruf") und kalt ("… Cold Email",
             "Re-Engagement"). "Konzept zusenden", "Meeting …" usw. sind keine
             Calls.
  Vorgabe    alle Call-Tasks, die heute oder früher fällig waren: die noch
             offenen plus die heute erledigten. Dadurch ist die Zahl den ganzen
             Tag über dieselbe, egal wann der Abgleich läuft.
  Termine    heute angelegte "Meeting …"-Tasks, je Lead einmal gezählt.
  Show-ups   heute fällige "Meeting …"-Tasks. Ein Termin gilt als stattgefunden,
             außer der Lead steht auf "No Show" oder es gibt von heute eine
             Notiz wie "verschoben" / "nicht aufgetaucht" / "nicht erreicht".
             Erst ab 17 Uhr — vorher stünde ein Termin, der noch bevorsteht,
             schon als stattgefunden da.

Der Abgleich ist wiederholbar: Jeder Lauf schreibt den aktuellen Stand des
Tages neu (upsert). Eine von Hand im Dashboard korrigierte Call-Zahl
(source = "dashboard") wird nicht überschrieben.
"""

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent


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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
APP_SECRET = os.environ.get("APP_SECRET", "")
PERSON = os.environ.get("PERSON", "").strip().lower()
CLOSE_API_KEY = os.environ.get("CLOSE_API_KEY", "").strip()

SHOWUP_AB_STUNDE = 17      # vorher werden Show-ups nicht geschrieben
MAX_SEITEN = 10            # 10 x 200 Tasks — mehr blättert ein Lauf nicht

# ─── Einteilung der Tasks ────────────────────────────────────────────────────
# Eingeteilt wird am Task-Text, weil der feststeht: Ein Lead-Status ändert sich
# DURCH den Anruf, ein vergangener Tag wäre damit rückwirkend falsch eingeordnet.
# Ein Rückruf ist ein Gespräch mit jemandem, der sich schon gemeldet hat — also
# warm. "RR" ist die Kurzform; mit Wortgrenzen, damit sie nicht in "Karriere"
# trifft.
WARM_MUSTER = ("follow up", "follow-up", "followup", "rückruf", "rueckruf")
WARM_KURZ = (r"\brr\b",)
KALT_MUSTER = ("cold email", "cold call", "re-engagement", "reengagement")
# Ein Termin ist das Ergebnis von Calls, nicht selbst einer.
KEIN_CALL = ("zusenden", "zuschicken", "e-mail schreiben", "email schreiben",
             "e-mail erinnerung", "angebot", "konzept", "lead liste",
             "meeting", "rechnung", "vertrag", "video", "einladung",
             "gedanken machen", "update zur")

MEETING_RE = re.compile(r"^\s*meeting\b", re.I)
NOSHOW_STATUS = ("no show", "no-show", "noshow")
NOSHOW_NOTIZ = re.compile(
    r"verschob|verschieb|nicht aufgetaucht|nicht erschienen|nicht erreicht|"
    r"no.?show|abgesagt|absage", re.I)


def einordnen(text):
    """'warm', 'kalt' oder None (kein Gespräch). Notizen werden hier nie
    gelesen — ein "Rückruf", der nur in einer Notiz steht, zählt nicht."""
    t = (text or "").lower()
    if any(m in t for m in WARM_MUSTER) or any(re.search(m, t) for m in WARM_KURZ):
        return "warm"
    if any(m in t for m in KEIN_CALL):
        return None
    if any(m in t for m in KALT_MUSTER):
        return "kalt"
    return None


# ─── Close ───────────────────────────────────────────────────────────────────

def _close(pfad):
    kopf = {
        "Authorization": "Basic " + base64.b64encode((CLOSE_API_KEY + ":").encode()).decode(),
        "Accept": "application/json",
    }
    req = urllib.request.Request("https://api.close.com/api/v1/" + pfad, headers=kopf)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def lokaler_tag(iso):
    """Close liefert UTC. Ein Task von 00:30 Uhr deutscher Zeit trägt in UTC
    noch das Datum des Vortags — ohne Umrechnung landete er am falschen Tag."""
    if not iso:
        return ""
    sauber = re.sub(r"\.\d+", "", str(iso)).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(sauber)
    except ValueError:
        return str(iso)[:10]
    if dt.tzinfo is None:
        return dt.strftime("%Y-%m-%d")
    return dt.astimezone().strftime("%Y-%m-%d")


def _tag_plus(tag, n):
    return (datetime.fromisoformat(tag) + timedelta(days=n)).strftime("%Y-%m-%d")


def _seiten(pfad):
    """Blättert durch eine Task-Liste, 200 je Seite."""
    trenner = "&" if "?" in pfad else "?"
    for seite in range(MAX_SEITEN):
        daten = _close(f"{pfad}{trenner}_limit=200&_skip={seite * 200}").get("data", [])
        yield from daten
        if len(daten) < 200:
            return


def offene_calls(uid, tag):
    """Offene Call-Tasks, die bis einschließlich `tag` fällig sind:
    (gesamt, davon überfällig)."""
    gesamt = spaet = 0
    # Tasks tragen oft eine Uhrzeit ("2026-09-21T12:00:00+00:00"). Ein Filter
    # "date__lte=2026-09-21" meint dann Mitternacht und verliert alles, was
    # heute mit Uhrzeit faellig ist. Deshalb grosszuegig abfragen (bis
    # uebermorgen, wegen UTC) und den Tag hier selbst bestimmen.
    for t in _seiten(f"task/?is_complete=false&assigned_to={uid}&date__lt={_tag_plus(tag, 2)}"):
        faellig = lokaler_tag(t.get("date"))
        if not faellig or faellig > tag:
            continue
        if einordnen(t.get("text")) is None:
            continue
        gesamt += 1
        if faellig < tag:
            spaet += 1
    return gesamt, spaet


def erledigte_calls(uid, tag):
    """Am `tag` erledigte Tasks: (warm, kalt, keine_gespraeche)."""
    warm = kalt = sonst = 0
    # Absteigend nach Änderungsdatum: Sobald ein älterer Tag kommt, sind wir durch.
    for t in _seiten(f"task/?is_complete=true&assigned_to={uid}&_order_by=-date_updated"):
        wann = lokaler_tag(t.get("date_updated"))
        if wann > tag:
            continue
        if wann < tag:
            break
        art = einordnen(t.get("text"))
        if art == "warm":
            warm += 1
        elif art == "kalt":
            kalt += 1
        else:
            sonst += 1
    return warm, kalt, sonst


def gebuchte_meetings(uid, tag):
    """Am `tag` angelegte "Meeting …"-Tasks, je Lead einmal. Offen wie
    erledigt — ein morgens gebuchter und nachmittags abgehakter Termin zählt."""
    leads = set()
    for komplett in ("false", "true"):
        for t in _seiten(f"task/?is_complete={komplett}&assigned_to={uid}&_order_by=-date_created"):
            wann = lokaler_tag(t.get("date_created"))
            if wann > tag:
                continue
            if wann < tag:
                break
            if MEETING_RE.match(t.get("text") or ""):
                leads.add(t.get("lead_id") or t.get("id"))
    return len(leads)


def _ist_noshow(lead_id, tag):
    if not lead_id:
        return False
    try:
        status = (_close(f"lead/{lead_id}/?_fields=id,status_label").get("status_label") or "").lower()
        if any(s in status for s in NOSHOW_STATUS):
            return True
        notizen = _close(
            f"activity/note/?lead_id={lead_id}&date_created__gte={tag}T00:00:00&_limit=50"
        ).get("data", [])
        return any(lokaler_tag(n.get("date_created")) == tag and NOSHOW_NOTIZ.search(n.get("note") or "")
                   for n in notizen)
    except Exception:
        # Lieber einen Termin als stattgefunden zählen als wegen eines
        # Netzwerkfehlers einen No-Show erfinden.
        return False


def meetings_am_tag(uid, tag):
    """Am `tag` fällige "Meeting …"-Tasks: (stattgefunden, no_show).
    Ein verschobener Termin hat ein neues Fälligkeitsdatum und taucht hier gar
    nicht mehr auf."""
    showup = noshow = 0
    gesehen = set()
    for komplett in ("false", "true"):
        # Bereich statt "date=<tag>": Meeting-Tasks haben eine Uhrzeit, und
        # der Gleichheitsfilter trifft nur Tasks ohne. Genau daran lag es, dass
        # der erste Probelauf null Meetings fand, obwohl drei stattfanden.
        bereich = f"date__gte={_tag_plus(tag, -1)}&date__lt={_tag_plus(tag, 2)}"
        for t in _seiten(f"task/?is_complete={komplett}&assigned_to={uid}&{bereich}"):
            if not MEETING_RE.match(t.get("text") or ""):
                continue
            if lokaler_tag(t.get("date")) != tag:
                continue
            schluessel = t.get("lead_id") or t.get("id")
            if schluessel in gesehen:
                continue
            gesehen.add(schluessel)
            if _ist_noshow(t.get("lead_id"), tag):
                noshow += 1
            else:
                showup += 1
    return showup, noshow


# ─── Supabase ────────────────────────────────────────────────────────────────

def _sb(methode, pfad, nutzlast=None, prefer=None):
    kopf = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "x-app-secret": APP_SECRET,
    }
    if prefer:
        kopf["Prefer"] = prefer
    daten = json.dumps(nutzlast).encode() if nutzlast is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{pfad}", data=daten,
                                 headers=kopf, method=methode)
    with urllib.request.urlopen(req, timeout=20) as resp:
        roh = resp.read()
        return json.loads(roh) if roh else None


def _upsert(tabelle, zeile):
    return _sb("POST", f"{tabelle}?on_conflict=date,person", zeile,
               prefer="resolution=merge-duplicates,return=minimal")


def schreibe_calls(tag, warm, kalt, target, target_overdue):
    """Schreibt die Call-Zahlen. Eine von Hand korrigierte Zahl bleibt stehen —
    dann wird nur die Vorgabe ergänzt."""
    vorhanden = _sb("GET", f"daily_calls?select=source,calls&date=eq.{tag}&person=eq.{urllib.parse.quote(PERSON)}") or []
    von_hand = bool(vorhanden) and vorhanden[0].get("source") == "dashboard"

    zeile = {"date": tag, "person": PERSON, "updated_at": datetime.now(timezone.utc).isoformat()}
    if target is not None:
        zeile["target"] = target
        zeile["target_overdue"] = target_overdue
    if von_hand:
        zeile["calls"] = vorhanden[0].get("calls") or 0
        zeile["source"] = "dashboard"
    else:
        zeile.update({"calls": warm + kalt, "calls_warm": warm, "calls_cold": kalt, "source": "close"})

    try:
        _upsert("daily_calls", zeile)
    except urllib.error.HTTPError as e:
        # Vor sql/008 kennt die Tabelle die Quelle "close" noch nicht. Die Zahl
        # soll trotzdem ankommen, statt wieder still zu fehlen.
        if e.code == 400 and zeile.get("source") == "close":
            zeile["source"] = "popup"
            _upsert("daily_calls", zeile)
        else:
            raise
    return von_hand


def schreibe_meetings(tag, booked, showup, noshow):
    zeile = {"date": tag, "person": PERSON, "booked": booked, "source": "close",
             "updated_at": datetime.now(timezone.utc).isoformat()}
    # None heißt: noch nicht bewertet. Dann das Feld weglassen, damit ein
    # früherer Wert nicht mit leer überschrieben wird.
    if showup is not None:
        zeile["showup"] = showup
        zeile["noshow"] = noshow
    _upsert("daily_meetings", zeile)


# ─── Ablauf ──────────────────────────────────────────────────────────────────

def sync_tag(uid, tag, heute):
    """Gleicht einen Tag ab. Für heute mit Vorgabe; für gestern ohne — was
    gestern in der Inbox stand, lässt sich heute nicht mehr nachzählen."""
    warm, kalt, sonst = erledigte_calls(uid, tag)

    target = target_overdue = None
    if tag == heute:
        offen, spaet = offene_calls(uid, tag)
        # Vorgabe = was heute zu tun war: das noch Offene plus das schon Erledigte.
        target, target_overdue = offen + warm + kalt, spaet

    von_hand = schreibe_calls(tag, warm, kalt, target, target_overdue)

    booked = gebuchte_meetings(uid, tag)
    bewerten = tag < heute or datetime.now().hour >= SHOWUP_AB_STUNDE
    showup, noshow = meetings_am_tag(uid, tag) if bewerten else (None, None)
    try:
        schreibe_meetings(tag, booked, showup, noshow)
        termine = f"{booked} gebucht, " + (f"{showup} Show-up, {noshow} No-Show" if bewerten else "Show-ups ab 17 Uhr")
    except urllib.error.HTTPError as e:
        termine = f"Termine NICHT gespeichert (HTTP {e.code} — läuft sql/008_close_sync.sql schon?)"

    print(f"{datetime.now():%Y-%m-%d %H:%M} | {tag} | {PERSON} | Calls {warm + kalt} "
          f"({warm} warm, {kalt} kalt, {sonst} keine Gespräche)"
          f"{' — von Hand korrigiert, nicht überschrieben' if von_hand else ''}"
          f"{f' | Vorgabe {target}, davon {target_overdue} überfällig' if target is not None else ''}"
          f" | {termine}")


def main():
    if not CLOSE_API_KEY:
        print("Kein CLOSE_API_KEY in der .env — nichts zu tun.")
        return 0
    if not (SUPABASE_URL and SUPABASE_ANON_KEY and APP_SECRET and PERSON):
        print("Konfiguration unvollständig (.env prüfen).")
        return 1

    try:
        uid = _close("me/").get("id")
        if not uid:
            print("Close hat keinen Nutzer geliefert.")
            return 1
        heute = datetime.now().strftime("%Y-%m-%d")
        gestern = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        # Gestern mitziehen: War der Rechner gestern ab mittags zu, fehlt der
        # Nachmittag sonst für immer.
        sync_tag(uid, gestern, heute)
        sync_tag(uid, heute, heute)
        return 0
    except Exception as e:
        # Kein Dialog: Das hier läuft im Hintergrund. Ins Protokoll damit.
        print(f"{datetime.now():%Y-%m-%d %H:%M} | FEHLER: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
