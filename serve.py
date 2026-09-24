"""Lokaler Server fuer das Dashboard.

Frueher stand hier nur `python3 -m http.server`. Das reichte, solange das
Dashboard ausschliesslich mit Supabase sprach. Der Auftrags-Reiter braucht aber
Python: Vertraege entstehen als Markdown und werden mit reportlab zu PDF, und
beides laeuft nicht im Browser.

Dieser Server liefert deshalb beides aus — die Dateien des Dashboards wie
bisher, und daneben unter /api/vertrag/* den Vertragsgenerator. Ein Befehl, ein
Fenster, ein Reiter.

Der Generator selbst liegt bewusst nicht hier, sondern im Workflow-Repo bei den
Vertraegen, der Vorlage und der PDF-Strecke. Dieser Server importiert ihn von
dort. Fehlt das Repo, laeuft das Dashboard normal weiter und nur der
Auftrags-Reiter erklaert, was fehlt — kein Grund, dass die Zahlen nicht
angezeigt werden.

    ./serve.sh              und dann http://localhost:8000
"""

import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HIER = Path(__file__).parent.resolve()

# Pfad zum Workflow-Repo. Anpassbar, falls es jemand woanders liegen hat.
WORKFLOW = Path(os.getenv(
    "XPO_WORKFLOW_REPO",
    HIER.parent / "XPO_Agentic_Workflow",
)).expanduser()

GENERATOR = WORKFLOW / "tools" / "vertrag_formular"


def lade_generator():
    """Generator importieren, wenn er erreichbar ist.

    Gibt (modul, None) zurueck oder (None, Grund). Der Grund wandert in den
    Reiter, damit dort nicht nur "geht nicht" steht, sondern was zu tun ist.
    """
    if not WORKFLOW.exists():
        return None, (f"Das Workflow-Repo wurde nicht gefunden: {WORKFLOW}. "
                      f"Liegt es woanders, den Pfad über die Umgebungsvariable "
                      f"XPO_WORKFLOW_REPO setzen.")
    if not GENERATOR.exists():
        return None, f"Der Vertragsgenerator fehlt: {GENERATOR}"

    if str(GENERATOR) not in sys.path:
        sys.path.insert(0, str(GENERATOR))
    try:
        import run as generator
        return generator, None
    except Exception as e:
        return None, (f"Der Vertragsgenerator liess sich nicht laden: {e}. "
                      f"Fehlt reportlab? Dann im Workflow-Repo "
                      f"'pip3 install -r requirements.txt' ausführen.")


GENERATOR_MODUL, GENERATOR_FEHLER = lade_generator()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HIER), **kwargs)

    # ---- Hilfen ----
    def _json(self, inhalt, code=200):
        roh = json.dumps(inhalt, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.end_headers()
        self.wfile.write(roh)

    def _koerper(self):
        laenge = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(laenge).decode("utf-8"))

    # ---- Routen ----
    def do_GET(self):
        if self.path.startswith("/api/vertrag/"):
            return self._vertrag_get()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/vertrag/"):
            return self._vertrag_post()
        self.send_error(404)

    def _vertrag_get(self):
        weg = self.path.split("?")[0]

        # Der Reiter fragt das zuerst ab und zeigt sonst die Erklaerung statt
        # eines halb aufgebauten Formulars.
        if weg == "/api/vertrag/status":
            return self._json({
                "bereit": GENERATOR_MODUL is not None,
                "fehler": GENERATOR_FEHLER,
                "workflow_repo": str(WORKFLOW),
                # Lokal gibt es einen Vertragsordner, der bleibt — der Reiter
                # zeigt hinterher den Pfad statt eines Downloads.
                "ablage": "datei",
            })

        if GENERATOR_MODUL is None:
            return self._json({"fehler": GENERATOR_FEHLER}, code=503)

        if weg == "/api/vertrag/katalog":
            return self._json(GENERATOR_MODUL.katalog())

        if weg == "/api/vertrag/kunden":
            from urllib.parse import parse_qs, urlparse
            begriff = parse_qs(urlparse(self.path).query).get("q", [""])[0]
            return self._json(GENERATOR_MODUL.close_suche(begriff))

        self._json({"fehler": "unbekannt"}, code=404)

    def _vertrag_post(self):
        if GENERATOR_MODUL is None:
            return self._json({"fehler": GENERATOR_FEHLER}, code=503)
        try:
            daten = self._koerper()
        except Exception as e:
            return self._json({"fehler": f"ungültiges JSON: {e}"}, code=400)

        import vertrag as bauer

        if self.path == "/api/vertrag/vorschau":
            try:
                return self._json({"markdown": bauer.baue_vertrag(daten)})
            except Exception as e:
                return self._json({"fehler": str(e)}, code=400)

        if self.path == "/api/vertrag/erzeugen":
            try:
                return self._json(GENERATOR_MODUL.erzeuge(daten))
            except Exception as e:
                return self._json({"erfolg": False, "fehler": str(e)}, code=500)

        self._json({"fehler": "unbekannt"}, code=404)

    def end_headers(self):
        # Beim Entwickeln ist eine zwischengespeicherte alte .js-Datei die
        # haeufigste Quelle fuer "aber ich hab das doch geaendert".
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *_):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Dashboard laeuft auf http://localhost:{port}  (beenden mit Ctrl+C)")
    if GENERATOR_MODUL:
        print(f"Auftrags-Reiter bereit — Vertraege nach {WORKFLOW / 'vertraege'}")
    else:
        print(f"Auftrags-Reiter nicht verfuegbar: {GENERATOR_FEHLER}")
    try:
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
