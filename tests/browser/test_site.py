"""
Browser-Test der Website (Playwright + Chromium).

    python tests/browser/test_site.py

Legt eine Kopie der Website in einem temporären Ordner an, erzeugt dort mit
dem Werkzeug aus einer Beispiel-Sicherung (fixtures/beispiel-dashboard.json)
die Datendatei und prüft Sammlung, Filter, Detailseite, Vorhang und Werkzeug.
Cover-Bilder werden durch ein lokales Bild ersetzt (kein Internet nötig).
Bildschirmfotos landen in tests/browser/screenshots/.
"""
import base64, functools, http.server, json, os, shutil, socketserver, sys, tempfile, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = HERE / "screenshots"
BACKUP = HERE / "fixtures" / "beispiel-dashboard.json"
EXE = os.environ.get("SITE_CHROMIUM") or None
# 2×3 px großes, rotes PNG als Ersatz für alle Cover
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEklEQVR4nGO4YmTEwMDAgBMBAMjkB/0bMn7EAAAAAElFTkSuQmCC")

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(bool(ok))
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{detail}]" if detail != "" else ""), flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def pick(pg, category, value):
    """Option einer Filtergruppe anklicken; klappt die Gruppe vorher auf, falls nötig."""
    option = f".filter-chip[data-category='{category}'][data-value='{value}']"
    if not pg.is_visible(option):
        pg.click(f".filter-drop[data-group='{category}'] .filter-drop-button")
    pg.click(option)


def serve(site, port):
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    server = socketserver.ThreadingTCPServer(("127.0.0.1", port), functools.partial(Quiet, directory=str(site)))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}"


def main():
    SHOTS.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    site = tmp / "site"
    shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns("tests", ".git", "node_modules"))
    base = serve(site, 8840)
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EXE)

        def page(width=1280, height=800, **kw):
            ctx = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True, **kw)
            ctx.route("https://m.media-amazon.com/**", lambda route: route.fulfill(content_type="image/png", body=PNG))
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            return pg

        print("W · Werkzeug: Sicherung → sammlung.json")
        pg = page()
        pg.goto(base + "/werkzeug.html")
        check("Ohne Sicherung: Speichern-Knopf gesperrt", pg.is_disabled("#download-button"))
        boxes = pg.eval_on_selector_all("#tool-options input", "els => els.map(e => [e.value, e.checked])")
        check("Häkchen: alles außer Notizen vorausgewählt", boxes == [["medium", True], ["seen", True], ["rating", True], ["lists", True], ["notes", False]], boxes)
        status_has = lambda text: pg.wait_for_function("t => document.querySelector('#backup-status').textContent.includes(t)", arg=text, timeout=3000)
        (tmp / "kaputt.json").write_text("{nein")
        pg.set_input_files("#backup-input", str(tmp / "kaputt.json")); status_has("kein gültiges JSON")
        check("Kaputte Datei → Meldung", "kein gültiges JSON" in pg.text_content("#backup-status"), pg.text_content("#backup-status"))
        (tmp / "fremd.json").write_text('{"hallo": 1}')
        pg.set_input_files("#backup-input", str(tmp / "fremd.json")); status_has("keine Dashboard-Sicherung")
        check("Fremde JSON-Datei → Meldung", "keine Dashboard-Sicherung" in pg.text_content("#backup-status"))
        # Import-Zeitstempel relativ zu jetzt einsetzen (Filter „Import": letzte 4 Wochen)
        from datetime import datetime, timedelta, timezone
        ago = lambda days: (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        fresh = json.loads(BACKUP.read_text(encoding="utf-8"))
        for movie in fresh["data"]["movies"]:
            if movie["id"] == "m1": movie["importAddedAt"] = ago(2)
            if movie["id"] == "m7": movie["importChangedAt"] = ago(9)
            if movie["id"] == "m8": movie["importAddedAt"] = ago(90)
        (tmp / "sicherung-frisch.json").write_text(json.dumps(fresh), encoding="utf-8")
        pg.set_input_files("#backup-input", str(tmp / "sicherung-frisch.json"))
        pg.wait_for_function("() => document.querySelector('#result-status').textContent.includes('Titel')", timeout=3000)
        status = pg.text_content("#result-status")
        check("Sicherung geladen: Zusammenfassung", "10 Titel (9 mit Cover)" in status and "Notizen" not in status, status)
        with pg.expect_download() as info:
            pg.click("#download-button")
        target = site / "data" / "sammlung.json"
        info.value.save_as(target)
        data = json.loads(target.read_text(encoding="utf-8"))
        raw = target.read_text(encoding="utf-8")
        check("Datei heißt sammlung.json, 10 Titel", info.value.suggested_filename == "sammlung.json" and len(data["movies"]) == 10)
        check("Kein OMDb-Schlüssel, keine Notizen, keine Favoriten", "GEHEIMER" not in raw and "PRIVATE-NOTIZ" not in raw and "pinnedBookmarkIds" not in raw)
        pg.screenshot(path=str(SHOTS / "werkzeug.png"), full_page=True)
        pg.context.close()

        print("S · Sammlung")
        pg = page()
        pg.goto(base + "/index.html"); pg.wait_for_timeout(150)
        check("Erster Besuch: Kinovorhang spielt", pg.evaluate("() => document.documentElement.dataset.curtainPhase") == "playing")
        check("Nicht für Suchmaschinen", pg.get_attribute("meta[name=robots]", "content") == "noindex, nofollow")
        pg.wait_for_timeout(3500)
        check("Zähler und Stand", pg.text_content("#collection-count") == "10 Titel" and pg.text_content("#collection-stand") == "Stand: 30. September 2026", [pg.text_content("#collection-count"), pg.text_content("#collection-stand")])
        groups = pg.eval_on_selector_all(".filter-group-label", "els => els.map(e => e.textContent)")
        check("Filtergruppen Art, Genre, Medium, Status, Liste, Import", groups == ["Art", "Genre", "Medium", "Status", "Liste", "Import"], groups)
        sorts0 = [pg.input_value("#movie-sort"), pg.eval_on_selector_all("#movie-sort option", "els => els.map(e => e.value)")]
        check("Standard-Sortierung IMDb-Bewertung, ohne „Zuletzt hinzugekommen\"", sorts0[0] == "imdbRating" and "recent" not in sorts0[1], sorts0)
        pick(pg, "import", "new"); pg.wait_for_timeout(100)
        check("Import „Neu\": nur Arrival (Spirited Away ist älter als 4 Wochen)", pg.eval_on_selector_all(".movie-card-title", "els => els.map(e => e.textContent)") == ["Arrival"])
        pick(pg, "import", "changed"); pg.wait_for_timeout(100)
        check("„Neu\" + „Geändert\": Arrival und Heat", sorted(pg.eval_on_selector_all(".movie-card-title", "els => els.map(e => e.textContent)")) == ["Arrival", "Heat"])
        pg.click("#filter-reset"); pg.wait_for_timeout(100)
        genres = pg.eval_on_selector_all(".filter-chip[data-category=genres]", "els => els.map(e => e.dataset.value)")
        check("Genre-Chips aus den Daten, alphabetisch", genres[:3] == ["Action", "Adventure", "Animation"] and "Sci-Fi" in genres, genres)
        pick(pg, "genres", "Sci-Fi"); pg.wait_for_timeout(100)
        check("Genre „Sci-Fi“ filtert", pg.locator(".movie-card").count() == 3 and pg.text_content("#collection-count") == "3 von 10 Titeln")
        pick(pg, "genres", "Sci-Fi"); pg.wait_for_timeout(100)
        sorts = pg.eval_on_selector_all("#movie-sort option", "els => els.map(e => e.value)")
        check("Sortierung inkl. eigener Bewertung", "yourRating" in sorts, sorts)
        chip = pg.text_content(".filter-chip[data-category=media][data-value=''] .chip-count")
        badges = pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('.movie-card')].map(c => [c.querySelector('.movie-card-title').textContent, c.querySelector('.media-badge')?.getAttribute('title') || '']))")
        check("Titel ohne Medium: kein Abzeichen, Chip „Kein Medium“ zählt 1 (1:1 wie im Dashboard)", badges["Severance"] == "" and chip == "1" and badges["Heat"] == "Blu-ray" and list(badges.values()).count("DVD") == 2, (badges, chip))
        check("10 Karten, Cover geladen, Badge 4K", pg.locator(".movie-card").count() == 10 and pg.locator(".movie-card .cover-image").count() == 9 and pg.locator(".media-badge").first.is_visible())
        pg.screenshot(path=str(SHOTS / "sammlung.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.fill("#movie-search", "villeneuve"); pg.wait_for_timeout(450)
        check("Suche nach Regie", pg.locator(".movie-card").count() == 3 and pg.text_content("#collection-count") == "3 von 10 Titeln")
        pick(pg, "seen", "unseen"); pg.wait_for_timeout(100)
        check("Filter „Offen“", pg.locator(".movie-card").count() == 1 and "Dune" in pg.text_content(".movie-card"))
        pick(pg, "seen", "unseen"); pg.wait_for_timeout(100)
        pg.select_option("#movie-sort", "yourRating"); pg.wait_for_timeout(100)
        order = pg.eval_on_selector_all(".movie-card-title", "els => els.map(e => e.textContent)")
        check("Sortiert nach eigener Bewertung", order == ["Arrival", "Blade Runner 2049", "Dune: Part Two"], order)

        print("D · Detailseite")
        pg.click(".movie-card >> nth=0"); pg.wait_for_url("**/titel.html?id=m1")
        pg.wait_for_selector(".details-grid")
        dl = pg.eval_on_selector_all(".detail-field dt", "els => els.map(e => e.textContent)")
        expected = ["IMDb-Listen", "Jahr", "Genre", "Laufzeit", "Regie", "Veröffentlichung", "Gesehen am", "Meine Bewertung", "IMDb-Bewertung", "IMDb-Stimmen",
                    "IMDb-Kennung", "Art", "In IMDb aufgenommen", "In IMDb geändert", "Bewertet am", "Position in der Liste", "IMDb"]
        check("Alle Angaben in der Reihenfolge des Dashboards", dl == expected, dl)
        check("Keine Notizen, keine Knöpfe zum Bearbeiten", "Notizen" not in dl and pg.locator("#edit-movie, #delete-movie, #change-cover").count() == 0)
        check("Status und Medium oben", pg.text_content(".detail-summary").replace(" ", "") == "GesehenUHDBlu-ray", pg.text_content(".detail-summary"))
        check("Fenstertitel", pg.title() == "Arrival · Filmsammlung", pg.title())
        pager = pg.evaluate("() => [document.querySelector('#prev-title').getAttribute('aria-disabled'), document.querySelector('#next-title').getAttribute('href')]")
        check("Blättern folgt der Auswahl der Sammlung (Villeneuve, nach Bewertung)", pager == ["true", "titel.html?id=m2"], pager)
        pg.screenshot(path=str(SHOTS / "detail.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.keyboard.press("ArrowRight"); pg.wait_for_url("**/titel.html?id=m2")
        check("Pfeiltaste → nächster Titel", pg.text_content("#movie-title") == "Blade Runner 2049" if pg.wait_for_selector(".details-grid") else False)
        pg.click("#back-link"); pg.wait_for_url("**/index.html")
        pg.wait_for_selector(".movie-card")
        check("Zurück zur Sammlung: Vorhang spielt nicht noch einmal", pg.evaluate("() => document.documentElement.dataset.intro") == "skip")
        check("… Suche und Sortierung sind noch da", pg.input_value("#movie-search") == "villeneuve" and pg.input_value("#movie-sort") == "yourRating" and pg.locator(".movie-card").count() == 3)

        print("A · Auf einen Blick, Ansicht, Design")
        pg.fill("#movie-search", ""); pg.wait_for_timeout(450)
        pg.click("#tab-stats")
        nums = pg.eval_on_selector_all(".stat-item", "els => els.map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check("Zahlen Gesamt/Gesehen/Offen", nums == ["10 Gesamt", "6 Gesehen", "4 Offen"], nums)
        pg.click("#stats-shuffle"); pg.wait_for_timeout(100)
        picks = pg.locator("#stats-picks .movie-card").count()
        check("Zufallspicker schlägt 2 offene Titel vor", picks == 2)
        pg.click("#view-button")
        opts = pg.eval_on_selector_all("#intro-mode-select option", "els => els.map(e => e.value)")
        check("Ansicht: Kinovorhang wählbar (Besuch / Tag / Nie), Vorschau-Knopf", opts == ["visit", "daily", "off"] and pg.is_visible("#curtain-preview-button"), opts)
        pg.select_option("#intro-mode-select", "off"); pg.keyboard.press("Escape")
        pg.select_option("#theme-select", "light"); pg.wait_for_timeout(100)
        check("Design umschalten", pg.evaluate("() => document.documentElement.dataset.theme") == "light")
        pg.context.close()
        pg = page()
        pg.goto(base + "/index.html"); pg.wait_for_timeout(150)
        check("Neuer Besuch: Vorhang spielt wieder (Standard „Bei jedem Besuch“)", pg.evaluate("() => document.documentElement.dataset.curtainPhase") == "playing")
        pg.evaluate("() => { localStorage.setItem('site:intro-mode', 'off'); localStorage.setItem('site:theme', 'light'); sessionStorage.clear(); }")
        pg.reload(); pg.wait_for_timeout(150)
        check("„Nie“ und Hell bleiben gespeichert", pg.evaluate("() => [document.documentElement.dataset.intro, document.documentElement.dataset.theme]") == ["skip", "light"])
        pg.wait_for_selector(".movie-card")
        pg.screenshot(path=str(SHOTS / "sammlung-hell.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.context.close()

        print("O · Ohne persönliche Angaben")
        full = json.loads(target.read_text(encoding="utf-8"))
        backup = json.loads(BACKUP.read_text(encoding="utf-8"))
        pg = page()
        pg.goto(base + "/werkzeug.html")
        pg.set_input_files("#backup-input", str(BACKUP))
        for key in ("medium", "seen", "rating", "lists"):
            pg.uncheck(f"#tool-options input[value={key}]")
        with pg.expect_download() as info:
            pg.click("#download-button")
        info.value.save_as(target)
        check("Werkzeug meldet „ohne persönliche Angaben“", "ohne persönliche Angaben" in pg.text_content("#result-status"))
        pg.context.close()
        pg = page()
        pg.add_init_script("localStorage.setItem('site:intro-mode', 'off')")
        pg.goto(base + "/index.html"); pg.wait_for_selector(".movie-card")
        groups = pg.eval_on_selector_all(".filter-group-label", "els => els.map(e => e.textContent)")
        sorts = pg.eval_on_selector_all("#movie-sort option", "els => els.map(e => e.value)")
        check("Nur Filtergruppen Art und Genre, keine Sortierung nach eigener Bewertung", groups == ["Art", "Genre"] and "yourRating" not in sorts, (groups, sorts))
        check("Keine Medium-Abzeichen, kein „Gesehen“ auf Karten", pg.locator(".media-badge, .movie-card-facts .seen").count() == 0)
        pg.click("#tab-stats")
        nums = pg.eval_on_selector_all(".stat-item", "els => els.map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check("Zahlen Gesamt/Filme/Serien", nums == ["10 Gesamt", "6 Filme", "3 Serien"], nums)
        pg.goto(base + "/titel.html?id=m1"); pg.wait_for_selector(".details-grid")
        dl = pg.eval_on_selector_all(".detail-field dt", "els => els.map(e => e.textContent)")
        check("Detailseite ohne Bewertung, Gesehen, Listen, Medium", not any(x in dl for x in ["Meine Bewertung", "Gesehen am", "IMDb-Listen"]) and pg.locator(".detail-summary").count() == 0, dl)
        pg.context.close()
        target.write_text(json.dumps(full), encoding="utf-8")

        print("F · Fehlerfälle, schmales Fenster")
        pg = page()
        pg.add_init_script("localStorage.setItem('site:intro-mode', 'off')")
        pg.goto(base + "/titel.html?id=gibt-es-nicht"); pg.wait_for_timeout(500)
        check("Unbekannter Titel → Hinweis mit Weg zurück", pg.text_content("#movie-title") == "Titel nicht gefunden" and pg.is_visible(".empty-state a"))
        (site / "data" / "sammlung.json").rename(site / "data" / "weg.json")
        pg.goto(base + "/index.html"); pg.wait_for_timeout(500)
        check("Datendatei fehlt → verständliche Meldung", "konnte nicht geladen werden" in pg.text_content("#movies-grid"), pg.text_content("#movies-grid"))
        (site / "data" / "weg.json").rename(site / "data" / "sammlung.json")
        pg.context.close()
        pg = page(width=360, height=740)
        pg.add_init_script("localStorage.setItem('site:intro-mode', 'off')")
        pg.goto(base + "/index.html"); pg.wait_for_selector(".movie-card")
        over = pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Handy (360 px): nichts ragt heraus", over <= 0, over)
        pg.screenshot(path=str(SHOTS / "handy.png"))
        pg.context.close()

        check("Keine Skriptfehler", not errors, errors)
        browser.close()

    failed = RESULTS.count(False)
    print(f"\n{len(RESULTS)} Prüfungen, {failed} fehlgeschlagen")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
