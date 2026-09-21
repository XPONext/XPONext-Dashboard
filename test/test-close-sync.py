#!/usr/bin/env python3
"""Prueft den Close-Abgleich ohne Netz: Close und Supabase sind Attrappen.

  python3 test/test-close-sync.py

Worum es geht: Die Zahlen muessen auch dann stimmen, wenn niemand hinsieht —
der Abgleich laeuft im Hintergrund und meldet Fehler nur ins Protokoll.
"""
import os, re, sys, types
from datetime import datetime

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WURZEL, "time_tracker"))
os.environ.update(SUPABASE_URL="http://test", SUPABASE_ANON_KEY="k", APP_SECRET="s",
                  PERSON="tim", CLOSE_API_KEY="api_test")
import close_sync as cs  # noqa: E402

fehler = []
def pruefe(name, ok, zusatz=""):
    print(f"  {name}: {'ok' if ok else 'FEHLGESCHLAGEN ' + zusatz}")
    if not ok: fehler.append(name)

TAG = "2026-09-21"
def ts(stunde, tag=TAG):            # lokale Uhrzeit -> UTC-Zeitstempel wie von Close
    lokal = datetime.fromisoformat(f"{tag}T{stunde:02d}:00:00").astimezone()
    return lokal.astimezone(cs.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.123000+00:00")

# ---- 1) Einordnung am Task-Text ----
for text, erwartet in [
    ("Follow up - Tim", "warm"), ("Follow up simon", "warm"), ("Rückruf Herr Meier", "warm"),
    ("RR Tim", "warm"), ("RR", "warm"),
    ("Re-Engagement — XPO Cold Email", "kalt"), ("Absage klären (Anruf) — XPO Cold Email", "kalt"),
    ("Meeting 08.09 10 Uhr", None), ("Konzept zuschicken", None), ("Video zusenden", None),
    ("Vertrag zuschicken", None), ("E-Mail schreiben", None), ("Lead Liste zusenden", None),
    ("Karriere planen", None), ("Herr Sperrmüll anrufen", None),
]:
    pruefe(f"Einordnung: {text[:34]}", cs.einordnen(text) == erwartet, f"war {cs.einordnen(text)}")

# ---- 2) Zeitzone: 00:30 Uhr bei uns ist in UTC noch der Vortag ----
pruefe("UTC-Zeitstempel wird auf den lokalen Tag gelegt",
       cs.lokaler_tag(ts(0)) == TAG, f"war {cs.lokaler_tag(ts(0))}")

# ---- Attrappe fuer Close ----
ERLEDIGT = [
    {"text":"Follow up - Tim", "date_updated":ts(9),  "lead_id":"l1"},
    {"text":"Follow up - Tim", "date_updated":ts(10), "lead_id":"l2"},
    {"text":"Re-Engagement — XPO Cold Email", "date_updated":ts(11), "lead_id":"l3"},
    {"text":"Konzept zuschicken", "date_updated":ts(12), "lead_id":"l4"},
    {"text":"Follow up - Tim", "date_updated":ts(9, "2026-09-20"), "lead_id":"l5"},   # gestern
]
# Wie im echten Close: Tasks tragen meist eine Uhrzeit. Ein Gleichheitsfilter
# auf das Datum findet die nicht — daran ist der erste Entwurf gescheitert.
OFFEN = [
    {"text":"Follow up - Tim", "date":ts(15)},                # heute, mit Uhrzeit
    {"text":"Follow up - Tim", "date":"2026-09-10"},          # ueberfaellig, ohne Uhrzeit
    {"text":"Angebot zusenden", "date":"2026-09-10"},         # kein Call -> zaehlt nicht zur Vorgabe
    {"text":"Follow up - Tim", "date":ts(10, "2026-09-22")},  # morgen -> gehoert nicht zur Inbox
]
MEETING_TASKS = [
    {"text":"Meeting 28.09 10 Uhr", "date_created":ts(13), "date":ts(10, "2026-09-28"), "lead_id":"m1", "is_complete":False},
    {"text":"Meeting 28.09 10 Uhr", "date_created":ts(14), "date":ts(10, "2026-09-28"), "lead_id":"m1", "is_complete":False},  # derselbe Lead
    {"text":"Meeting 22.09 11 Uhr", "date_created":ts(15), "date":ts(11, "2026-09-22"), "lead_id":"m2", "is_complete":False},
    {"text":"Meeting 21.09 10 Uhr", "date_created":ts(9, "2026-09-07"), "date":ts(10), "lead_id":"m3", "is_complete":True},
    {"text":"Meeting 21.09 14 Uhr", "date_created":ts(9, "2026-09-14"), "date":ts(14), "lead_id":"m4", "is_complete":False},
    {"text":"Meeting 21.09 16 Uhr", "date_created":ts(9, "2026-09-14"), "date":ts(16), "lead_id":"m5", "is_complete":False},
]
STATUS = {"m3":"Meeting", "m4":"No Show", "m5":"Meeting"}
NOTIZEN = {"m5":[{"date_created":ts(16), "note":"Termin wurde verschoben auf nächste Woche"}]}

def fake_close(pfad):
    if pfad.startswith("me/"): return {"id":"user_x"}
    if pfad.startswith("lead/"):
        return {"status_label": STATUS.get(pfad.split("/")[1], "Warm")}
    if pfad.startswith("activity/note/"):
        lead = pfad.split("lead_id=")[1].split("&")[0]
        return {"data": NOTIZEN.get(lead, [])}
    if "_skip=0" not in pfad: return {"data": []}
    komplett = "is_complete=true" in pfad
    if "_order_by=-date_updated" in pfad:
        return {"data": sorted(ERLEDIGT, key=lambda t:t["date_updated"], reverse=True)}
    if "_order_by=-date_created" in pfad:
        return {"data": sorted([t for t in MEETING_TASKS if t["is_complete"] == komplett],
                               key=lambda t:t["date_created"], reverse=True)}
    # Close vergleicht Zeitstempel: "date=<tag>" trifft nur Tasks OHNE Uhrzeit.
    if re.search(r"[?&]date=", pfad):
        return {"data": [t for t in MEETING_TASKS + OFFEN if t.get("date") == pfad.split("date=")[1][:10]]}
    if "date__gte=" in pfad:
        von = pfad.split("date__gte=")[1][:10]; bis = pfad.split("date__lt=")[1][:10]
        return {"data": [t for t in MEETING_TASKS if von <= t["date"][:10] < bis and t["is_complete"] == komplett]}
    if "date__lt=" in pfad:
        bis = pfad.split("date__lt=")[1][:10]
        return {"data": [t for t in OFFEN if t["date"][:10] < bis]}
    return {"data": []}
cs._close = fake_close

# ---- 3) Zaehlungen ----
pruefe("Erledigte Calls: 2 warm, 1 kalt, 1 kein Gespräch — gestern zählt nicht",
       cs.erledigte_calls("u", TAG) == (2, 1, 1), f"war {cs.erledigte_calls('u', TAG)}")
pruefe("Offene Calls: 2, davon 1 überfällig — 'Angebot zusenden' zählt nicht",
       cs.offene_calls("u", TAG) == (2, 1), f"war {cs.offene_calls('u', TAG)}")
pruefe("Gebuchte Meetings: 2 — derselbe Lead zählt einmal",
       cs.gebuchte_meetings("u", TAG) == 2, f"war {cs.gebuchte_meetings('u', TAG)}")
pruefe("Meetings heute: 1 stattgefunden, 2 No-Show (Status und Notiz 'verschoben')",
       cs.meetings_am_tag("u", TAG) == (1, 2), f"war {cs.meetings_am_tag('u', TAG)}")

# ---- 4) Schreiben ----
geschrieben = []
vorhanden = []
def fake_sb(methode, pfad, nutzlast=None, prefer=None):
    if methode == "GET": return vorhanden
    geschrieben.append((pfad.split("?")[0], nutzlast)); return None
cs._sb = fake_sb

class Uhr(datetime):
    stunde = 18
    @classmethod
    def now(cls, tz=None): return datetime(2026, 9, 21, cls.stunde, 0, 0, tzinfo=tz)
cs.datetime = Uhr

cs.sync_tag("u", TAG, TAG)
calls = next(n for t, n in geschrieben if t == "daily_calls")
meet  = next(n for t, n in geschrieben if t == "daily_meetings")
pruefe("Calls geschrieben: 3, warm 2, kalt 1, Quelle close",
       (calls["calls"], calls["calls_warm"], calls["calls_cold"], calls["source"]) == (3, 2, 1, "close"), str(calls))
pruefe("Vorgabe = offen + erledigt = 5, davon 1 überfällig",
       (calls["target"], calls["target_overdue"]) == (5, 1), str(calls))
pruefe("Termine ab 17 Uhr: 2 gebucht, 1 Show-up, 2 No-Show",
       (meet["booked"], meet.get("showup"), meet.get("noshow")) == (2, 1, 2), str(meet))

geschrieben.clear(); Uhr.stunde = 11
cs.sync_tag("u", TAG, TAG)
meet = next(n for t, n in geschrieben if t == "daily_meetings")
pruefe("Vor 17 Uhr werden Show-ups NICHT geschrieben — der 16-Uhr-Termin steht noch bevor",
       "showup" not in meet and meet["booked"] == 2, str(meet))

geschrieben.clear(); vorhanden[:] = [{"source":"dashboard", "calls":40}]
cs.sync_tag("u", TAG, TAG)
calls = next(n for t, n in geschrieben if t == "daily_calls")
pruefe("Von Hand korrigierte Call-Zahl wird nicht überschrieben",
       calls["calls"] == 40 and calls["source"] == "dashboard" and calls["target"] == 5, str(calls))

geschrieben.clear(); vorhanden[:] = []
cs.sync_tag("u", "2026-09-20", TAG)
calls = next(n for t, n in geschrieben if t == "daily_calls")
pruefe("Für gestern wird keine Vorgabe nachgezählt", "target" not in calls and calls["calls"] == 1, str(calls))

print()
if fehler:
    print("FEHLGESCHLAGEN:"); [print("  - " + f) for f in fehler]; sys.exit(1)
print("Close-Abgleich-Test bestanden.")
