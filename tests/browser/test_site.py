"""
Browser-Test der Website (Playwright + Chromium).

    python tests/browser/test_site.py

Legt eine Kopie der Website in einem temporären Ordner an, erzeugt dort mit
dem Werkzeug aus einer Beispiel-Sicherung (fixtures/beispiel-dashboard.json)
die Datendatei und prüft Sammlung, Filter, Detailseite, Vorhang und Werkzeug.
Cover-Bilder werden durch ein lokales Bild ersetzt (kein Internet nötig).
Bildschirmfotos landen in tests/browser/screenshots/.

Gewartet wird auf Zustände, nicht nach Uhr: Sammlung und Detailseite setzen
<html data-ready>, sobald sie fertig aufgebaut sind (markReady in
js/pages/*.js). Feste kurze Pausen gibt es nur dort, wo geprüft wird, dass
etwas NICHT passiert. Die Logik der gemeinsamen Bausteine (Sortierung,
Filter, Zeitleiste, Bewegung) prüft das Dashboard; hier geht es um das
Zusammenspiel auf der Website.
"""
import base64, functools, http.server, json, os, shutil, socketserver, sys, tempfile, threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = HERE / "screenshots"
BACKUP = HERE / "fixtures" / "beispiel-dashboard.json"
EXE = os.environ.get("SITE_CHROMIUM") or None
# 2×3 px großes, rotes PNG als Ersatz für alle Cover
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEklEQVR4nGO4YmTEwMDAgBMBAMjkB/0bMn7EAAAAAElFTkSuQmCC")
# Großzügig: der Rechner kann ausgelastet sein; gewartet wird nur bis zum Zustand
WAIT_MS = 20000

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(bool(ok))
    print(("  ✅ " if ok else "  ❌ ") + name + (f"  [{detail}]" if detail != "" else ""), flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        # Abgebrochene Ladevorgänge (Seitenwechsel mitten im Laden) sind normal
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


def serve(site):
    """Startet einen Webserver auf einem freien Port (parallele Testläufe stören sich nicht)."""
    server = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}"


def until(pg, js, arg=None, timeout=WAIT_MS):
    """Wartet, bis der JS-Ausdruck wahr ist. False statt Ausnahme - die Prüfung danach meldet den Fehler."""
    try:
        pg.wait_for_function(js, arg=arg, timeout=timeout, polling="raf")
        return True
    except PlaywrightTimeout:
        return False


def ready(pg):
    """Wartet auf <html data-ready> (Sammlung bzw. Detailseite fertig aufgebaut)."""
    pg.wait_for_function("() => document.documentElement.dataset.ready !== undefined", timeout=WAIT_MS)


def goto(pg, url):
    pg.goto(url)
    ready(pg)


def settled(pg):
    """Wartet, bis endliche Animationen fertig sind (nur für ruhige Bildschirmfotos)."""
    pg.evaluate("""() => Promise.race([
        Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))),
        new Promise(r => setTimeout(r, 3000))])""")


def pick(pg, category, value):
    """Option einer Filtergruppe anklicken; klappt die Gruppe vorher auf, falls nötig."""
    option = f".filter-chip[data-category='{category}'][data-value='{value}']"
    if not pg.is_visible(option):
        pg.click(f".filter-drop[data-group='{category}'] .filter-drop-button")
    pg.click(option)


def close_modal(pg):
    pg.keyboard.press("Escape")
    pg.wait_for_selector(".modal-backdrop", state="detached")


TITLES = "els => els.map(e => e.textContent)"
COUNT_IS = "t => document.querySelector('#collection-count').textContent === t"


def main():
    SHOTS.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    site = tmp / "site"
    shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns("tests", ".git", "node_modules"))
    base = serve(site)
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=EXE)

        def page(width=1280, height=800, intro=True, dust=False, **kw):
            ctx = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True, **kw)
            ctx.route("https://m.media-amazon.com/**", lambda route: route.fulfill(content_type="image/png", body=PNG))
            ctx.set_default_timeout(WAIT_MS)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            if not intro:
                pg.add_init_script("localStorage.setItem('site:intro-mode', 'off')")
            if not dust:
                # Lichtkegel (Dauer-Animation) nur dort, wo er geprüft wird - spart Rechenzeit
                pg.add_init_script("localStorage.setItem('site:projector-dust', 'off')")
            return pg

        print("W · Werkzeug: Sicherung → sammlung.json")
        pg = page()
        pg.goto(base + "/werkzeug.html")
        check("Ohne Sicherung: Speichern-Knopf gesperrt", pg.is_disabled("#download-button"))
        boxes = pg.eval_on_selector_all("#tool-options input", "els => els.map(e => [e.value, e.checked])")
        check("Häkchen: alles außer Notizen vorausgewählt", boxes == [["medium", True], ["seen", True], ["rating", True], ["lists", True], ["notes", False]], boxes)
        status_has = lambda text: until(pg, "t => document.querySelector('#backup-status').textContent.includes(t)", text)
        (tmp / "kaputt.json").write_text("{nein")
        pg.set_input_files("#backup-input", str(tmp / "kaputt.json")); status_has("kein gültiges JSON")
        check("Kaputte Datei → Meldung", "kein gültiges JSON" in pg.text_content("#backup-status"), pg.text_content("#backup-status"))
        (tmp / "fremd.json").write_text('{"hallo": 1}')
        pg.set_input_files("#backup-input", str(tmp / "fremd.json")); status_has("keine Dashboard-Sicherung")
        check("Fremde JSON-Datei → Meldung", "keine Dashboard-Sicherung" in pg.text_content("#backup-status"))
        # Import-Zeitstempel relativ zu jetzt einsetzen (Filter „Import": letzte 4 Wochen)
        ago = lambda days: (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        fresh = json.loads(BACKUP.read_text(encoding="utf-8"))
        for movie in fresh["data"]["movies"]:
            if movie["id"] == "m1": movie["importAddedAt"] = ago(2)
            if movie["id"] == "m7": movie["importChangedAt"] = ago(9)
            if movie["id"] == "m8": movie["importAddedAt"] = ago(90)
        (tmp / "sicherung-frisch.json").write_text(json.dumps(fresh), encoding="utf-8")
        pg.set_input_files("#backup-input", str(tmp / "sicherung-frisch.json"))
        until(pg, "() => document.querySelector('#result-status').textContent.includes('Titel')")
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
        # Zeichnet jeden Wechsel der Vorhang-Phase auf (auch wenn er schneller vorbei ist als ein Blick)
        pg.add_init_script("""window.testPhases = [];
            new MutationObserver(() => window.testPhases.push(document.documentElement.dataset.curtainPhase))
              .observe(document, { attributes: true, subtree: true, attributeFilter: ['data-curtain-phase'] });""")
        pg.goto(base + "/index.html")
        until(pg, "() => window.testPhases.includes('playing')")
        phases = pg.evaluate("() => window.testPhases")
        check("Erster Besuch: Kinovorhang spielt", "playing" in phases, phases)
        check("Nicht für Suchmaschinen", pg.get_attribute("meta[name=robots]", "content") == "noindex, nofollow")
        # Neu laden statt den Vorhang abzuwarten: im selben Besuch spielt er nicht noch einmal
        pg.reload(); ready(pg)
        check("Zähler und Stand", pg.text_content("#collection-count") == "10 Titel" and pg.text_content("#collection-stand") == "Stand: 30. September 2026", [pg.text_content("#collection-count"), pg.text_content("#collection-stand")])
        groups = pg.eval_on_selector_all(".filter-group-label", TITLES)
        check("Filtergruppen Art, Genre, Medium, Status, Liste, Import", groups == ["Art", "Genre", "Medium", "Status", "Liste", "Import"], groups)
        sorts = [pg.input_value("#movie-sort"), pg.eval_on_selector_all("#movie-sort option", "els => els.map(e => e.value)")]
        check("Sortierung: Standard IMDb-Bewertung, mit eigener Bewertung, ohne „Zuletzt hinzugekommen\"", sorts[0] == "imdbRating" and "yourRating" in sorts[1] and "recent" not in sorts[1], sorts)
        pick(pg, "import", "new")
        check("Import „Neu\": nur Arrival (Spirited Away ist älter als 4 Wochen)", pg.eval_on_selector_all(".movie-card-title", TITLES) == ["Arrival"])
        pg.click("#filter-reset")
        pick(pg, "genres", "Sci-Fi")
        check("Genre „Sci-Fi“ filtert", pg.locator(".movie-card").count() == 3 and pg.text_content("#collection-count") == "3 von 10 Titeln")
        pick(pg, "genres", "Sci-Fi")
        chip = pg.text_content(".filter-chip[data-category=media][data-value=''] .chip-count")
        badges = pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('.movie-card')].map(c => [c.querySelector('.movie-card-title').textContent, c.querySelector('.media-badge')?.getAttribute('title') || '']))")
        check("Titel ohne Medium: kein Abzeichen, Chip „Kein Medium“ zählt 1 (1:1 wie im Dashboard)", badges["Severance"] == "" and chip == "1" and badges["Heat"] == "Blu-ray" and list(badges.values()).count("DVD") == 2, (badges, chip))
        check("10 Karten, Cover geladen, Badge 4K", pg.locator(".movie-card").count() == 10 and pg.locator(".movie-card .cover-image").count() == 9 and pg.locator(".media-badge").first.is_visible())
        pg.screenshot(path=str(SHOTS / "sammlung.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.fill("#movie-search", "villeneuve"); until(pg, COUNT_IS, "3 von 10 Titeln")
        check("Suche nach Regie", pg.locator(".movie-card").count() == 3 and pg.text_content("#collection-count") == "3 von 10 Titeln")
        pick(pg, "seen", "unseen")
        check("Filter „Offen“", pg.locator(".movie-card").count() == 1 and "Dune" in pg.text_content(".movie-card"))
        pick(pg, "seen", "unseen")
        pg.select_option("#movie-sort", "yourRating")

        print("D · Detailseite")
        pg.click(".movie-card >> nth=0"); pg.wait_for_url("**/titel.html?id=m1"); ready(pg)
        pg.wait_for_selector(".details-grid")
        dl = pg.eval_on_selector_all(".detail-field dt", TITLES)
        expected = ["IMDb-Listen", "Jahr", "Genre", "Laufzeit", "Regie", "Veröffentlichung", "Meine Bewertung", "IMDb-Bewertung", "IMDb-Stimmen",
                    "IMDb-Kennung", "Art", "In IMDb aufgenommen", "In IMDb geändert", "Bewertet am", "Position in der Liste", "IMDb", "Streaming"]
        check("Alle Angaben in der Reihenfolge des Dashboards", dl == expected, dl)
        check("Keine Notizen, keine Knöpfe zum Bearbeiten", "Notizen" not in dl and pg.locator("#edit-movie, #delete-movie, #change-cover").count() == 0)
        summary = pg.evaluate("() => [document.querySelector('.detail-summary .seen-ticket.is-seen')?.getAttribute('aria-label'), document.querySelector('.detail-summary .meta')?.textContent, document.querySelectorAll('#toggle-seen').length]")
        check("Oben: Eintrittskarte „Gesehen\" (gestempelt, ohne Knopf) und Medium", summary[0] and summary[0].startswith("Gesehen") and summary[1] == "UHD Blu-ray" and summary[2] == 0, summary)
        check("Fenstertitel", pg.title() == "Arrival · Filmsammlung", pg.title())
        pager = pg.evaluate("() => [document.querySelector('#prev-title').getAttribute('aria-disabled'), document.querySelector('#next-title').getAttribute('href')]")
        check("Blättern folgt der Auswahl der Sammlung (Villeneuve, nach Bewertung)", pager == ["true", "titel.html?id=m2"], pager)
        pg.screenshot(path=str(SHOTS / "detail.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.keyboard.press("ArrowRight"); pg.wait_for_url("**/titel.html?id=m2"); ready(pg)
        check("Pfeiltaste → nächster Titel", pg.text_content("#movie-title") == "Blade Runner 2049" if pg.wait_for_selector(".details-grid") else False)
        pg.click("#back-link"); pg.wait_for_url("**/index.html"); ready(pg)
        pg.wait_for_selector(".movie-card")
        check("Zurück zur Sammlung: Vorhang spielt nicht noch einmal", pg.evaluate("() => document.documentElement.dataset.intro") == "skip")
        check("… Suche und Sortierung sind noch da", pg.input_value("#movie-search") == "villeneuve" and pg.input_value("#movie-sort") == "yourRating" and pg.locator(".movie-card").count() == 3)

        print("A · Auf einen Blick, Ansicht, Design")
        pg.fill("#movie-search", ""); until(pg, COUNT_IS, "10 Titel")
        pg.click("#tab-stats")
        nums = pg.eval_on_selector_all(".stat-item", "els => els.map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check("Zahlen Gesamt/Gesehen/Offen", nums == ["10 Gesamt", "6 Gesehen", "4 Offen"], nums)
        pg.click("#stats-shuffle"); until(pg, "() => document.querySelectorAll('#stats-picks .movie-card').length === 2")
        check("Zufallspicker schlägt 2 offene Titel vor", pg.locator("#stats-picks .movie-card").count() == 2)
        pg.click("#view-button")
        opts = pg.eval_on_selector_all("#intro-mode-select option", "els => els.map(e => e.value)")
        check("Ansicht: Kinovorhang wählbar (Besuch / Tag / Nie), Vorschau-Knopf", opts == ["visit", "daily", "off"] and pg.is_visible("#curtain-preview-button"), opts)
        pg.select_option("#intro-mode-select", "off"); close_modal(pg)
        pg.select_option("#theme-select", "light")
        until(pg, "() => document.documentElement.dataset.theme === 'light'")
        check("Design umschalten", pg.evaluate("() => document.documentElement.dataset.theme") == "light")
        pg.context.close()
        pg = page()
        pg.add_init_script("localStorage.setItem('site:intro-mode', 'off'); localStorage.setItem('site:theme', 'light')")
        goto(pg, base + "/index.html")
        check("„Nie“ und Hell bleiben gespeichert", pg.evaluate("() => [document.documentElement.dataset.intro, document.documentElement.dataset.theme]") == ["skip", "light"])
        pg.wait_for_selector(".movie-card")
        pg.screenshot(path=str(SHOTS / "sammlung-hell.png"), clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        pg.context.close()

        print("Z · Zeitleiste, Deko")
        pg = page(intro=False)
        goto(pg, base + "/index.html")
        tabs = pg.eval_on_selector_all(".view-tab", TITLES)
        check("Registerkarten Titel · Zeitleiste · Sternbild · Auf einen Blick", tabs == ["Titel", "Zeitleiste", "Sternbild", "Auf einen Blick"], tabs)
        decor = until(pg, "() => !!document.querySelector('#corner-decor svg')")
        check("Deko unten links aus der Datendatei (Popcorn)", decor)
        pg.click("#tab-timeline"); pg.wait_for_selector(".coverflow-item")
        vis = pg.evaluate("() => [getComputedStyle(document.querySelector('.search-row')).display, getComputedStyle(document.querySelector('.sort-field')).display, getComputedStyle(document.querySelector('.timeline-mode')).display]")
        check("Suche und Filter sichtbar, Umschalter statt Sortierung", vis[0] != "none" and vis[1] == "none" and vis[2] != "none", vis)
        modes = pg.eval_on_selector_all(".timeline-mode .timeline-mode-option:not([hidden])", "els => els.map(e => e.textContent + (e.getAttribute('aria-checked') === 'true' ? '*' : ''))")
        check("Ansichten Erschienen / Bewertet (Standard)", modes == ["Erschienen", "Bewertet*"], modes)
        pg.click("[data-timeline-mode='release']")
        until(pg, "() => document.querySelector('#timeline-count').textContent.endsWith('von 10')")
        pick(pg, "genres", "Sci-Fi")
        until(pg, "() => document.querySelector('#timeline-count').textContent.endsWith('von 3')")
        check("Filter wirken auf die Zeitleiste", pg.text_content("#timeline-count").endswith("von 3"), pg.text_content("#timeline-count"))
        pg.click("#filter-reset")
        until(pg, "() => document.querySelector('#timeline-count').textContent.endsWith('von 10')")
        current = pg.text_content(".timeline-title")
        pg.click(".timeline-title a"); pg.wait_for_url("**/titel.html?id=*"); ready(pg)
        check("Titel in der Zeitleiste führt zur Detailseite", pg.text_content("#movie-title") == current if pg.wait_for_selector(".details-grid") else False, current)
        pg.go_back(); ready(pg); pg.wait_for_selector(".coverflow-item")
        until(pg, "() => !!document.querySelector('.tl-mark')")
        back = pg.evaluate("() => [document.querySelector('#tab-timeline').getAttribute('aria-selected'), document.querySelector(\"[data-timeline-mode][aria-checked='true']\").dataset.timelineMode, !!document.querySelector('.tl-mark')]")
        check("Zurück: Zeitleiste und Ansicht „Erschienen\" bleiben gemerkt, Achse gezeichnet", back == ["true", "release", True], back)
        pg.screenshot(path=str(SHOTS / "zeitleiste.png"))
        # Prüft, dass NICHTS herausragt - kurz warten, falls sich nach dem Umbruch noch etwas verschiebt
        pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
        check("Handy: nichts ragt seitlich heraus", pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0)
        pg.context.close()

        print("ST · Sternbild")
        pg = page(intro=False)
        goto(pg, base + "/index.html")
        pg.click("#tab-constellation"); pg.wait_for_selector(".cs-star")
        modes = pg.eval_on_selector_all(".constellation-mode .timeline-mode-option:not([hidden])", "els => els.map(e => e.textContent + (e.getAttribute('aria-checked') === 'true' ? '*' : ''))")
        check("Sternbild: Umschalter Bewertet (Standard) / Ganze Sammlung", modes == ["Bewertet*", "Ganze Sammlung"], modes)
        pg.click("[data-constellation-mode='all']")
        check("Ganze Sammlung: alle 10 Titel", until(pg, "() => document.querySelector('#constellation-foot').textContent.startsWith('10 Titel')"), pg.text_content("#constellation-foot"))
        pg.locator(".cs-star").first.click()
        pg.wait_for_selector(".cs-card.is-open h3")
        check("Stern öffnet die Genre-Karte mit Umriss", pg.locator(".cs-bubble.is-a").count() == 1)
        pg.click(".cs-covers button")
        pg.wait_for_selector(".cs-card.is-open a.cs-primary")
        link = pg.get_attribute(".cs-card a.cs-primary", "href")
        check("Filmkarte führt zur Detailseite der Website", link.startswith("titel.html?id="), link)
        pg.click(".cs-card a.cs-primary"); pg.wait_for_url("**/titel.html?id=*"); ready(pg)
        pg.go_back(); ready(pg)
        back = until(pg, "() => document.querySelector('#tab-constellation').getAttribute('aria-selected') === 'true' && document.querySelector(\"[data-constellation-mode='all']\").getAttribute('aria-checked') === 'true' && !!document.querySelector('.cs-star')")
        check("Zurück: Sternbild und Ansicht bleiben gemerkt", back)
        pg.set_viewport_size({"width": 390, "height": 844}); pg.wait_for_timeout(300)
        check("Sternbild am Handy: nichts ragt seitlich heraus", pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth") <= 0)
        pg.context.close()

        print("N · Klick-Effekt")
        pg = page(1600, 900)
        goto(pg, base + "/titel.html?id=m1")
        pg.click("#view-button")
        motion = pg.eval_on_selector_all(".modal input[name=click-effect]", "els => els.map(e => e.value + (e.checked ? '*' : ''))")
        check("Ansicht: Klick-Effekt Kachel-Zoom (Standard) / Aus", motion == ["zoom*", "off"], motion)
        pg.check(".modal input[name=click-effect][value=off]"); close_modal(pg)
        # Prüft, dass etwas NICHT passiert: kurze feste Pause nach dem Klick
        pg.click("#back-link"); pg.wait_for_timeout(80)
        check("Klick-Effekt „Aus\": kein Zoom, gilt sofort", pg.locator(".link-zoom").count() == 0)
        pg.context.close()

        print("P · Passwort (Einlass)")
        plain = target.read_text(encoding="utf-8")
        pg = page()
        pg.goto(base + "/werkzeug.html")
        check("Werkzeug: Passwortschutz zunächst aus", not pg.is_checked("#access-enabled") and not pg.is_visible("#access-password"))
        pg.set_input_files("#backup-input", str(BACKUP))
        until(pg, "() => document.querySelector('#result-status').textContent.includes('Titel')")
        pg.check("#access-enabled")
        until(pg, "() => document.querySelector('#access-status').textContent.includes('Bitte ein Passwort')")
        check("Eingeschaltet ohne Passwort: Speichern gesperrt", pg.is_disabled("#download-button") and "Bitte ein Passwort" in pg.text_content("#access-status"))
        pg.fill("#access-password", "Popcorn")
        with pg.expect_download() as info:
            pg.click("#download-button")
        info.value.save_as(target)
        raw = target.read_text(encoding="utf-8")
        data = json.loads(raw)
        check("Datei enthält nur Salz und Prüfwert, nicht das Passwort", "Popcorn" not in raw and sorted(data.get("access", {}).keys()) == ["hash", "salt"])
        pg.reload()
        until(pg, "() => document.querySelector('#access-enabled').checked && document.querySelector('#access-status').textContent.includes('bisherigen Passwort')")
        check("Werkzeug merkt sich das Passwort (als Prüfwert)", pg.is_checked("#access-enabled") and "bisherigen Passwort" in pg.text_content("#access-status"))
        pg.context.close()

        pg = page(intro=False)
        goto(pg, base + "/index.html"); pg.wait_for_selector(".site-gate")
        until(pg, "() => document.activeElement?.id === 'gate-password'")
        hidden = pg.evaluate("() => [document.documentElement.dataset.gate, getComputedStyle(document.querySelector('.shell')).visibility, getComputedStyle(document.querySelector('.appbar')).visibility, document.activeElement.id]")
        check("Overlay da, Sammlung und Kopfleiste unsichtbar, Fokus im Passwortfeld", hidden == ["locked", "hidden", "hidden", "gate-password"], hidden)
        settled(pg); pg.screenshot(path=str(SHOTS / "einlass.png"))
        fit = pg.evaluate("() => { const c = document.querySelector('.site-gate-card').getBoundingClientRect(); const b = document.querySelector('.site-gate .button').getBoundingClientRect(); return b.right <= c.right - 10; }")
        check("Knopf passt in die Karte", fit)
        pg.fill("#gate-password", "falsch"); pg.keyboard.press("Enter")
        until(pg, "() => document.querySelector('#gate-error').textContent !== ''")
        check("Falsches Passwort → Hinweis, bleibt gesperrt", pg.text_content("#gate-error") == "Das Passwort stimmt nicht." and pg.evaluate("() => document.documentElement.dataset.gate") == "locked")
        pg.fill("#gate-password", "Popcorn"); pg.keyboard.press("Enter")
        until(pg, "() => !document.querySelector('.site-gate') && document.documentElement.dataset.gate === undefined")
        check("Richtiges Passwort → Overlay weg, Sammlung sichtbar", pg.locator(".site-gate").count() == 0 and "gate" not in pg.evaluate("() => Object.keys(document.documentElement.dataset)") and pg.locator(".movie-card").first.is_visible())
        pg.reload(); ready(pg); pg.wait_for_selector(".movie-card")
        check("Neu laden: bleibt freigeschaltet", pg.locator(".site-gate").count() == 0)
        pg.context.close()

        pg = page(1600, 900)
        goto(pg, base + "/index.html"); pg.wait_for_selector(".site-gate")
        held_js = "() => [document.documentElement.dataset.curtainPhase, Math.round(document.querySelector('.curtain--left').getBoundingClientRect().width), window.innerWidth, document.querySelector('.site-gate').classList.contains('on-curtain')]"
        gl_js = "() => [document.documentElement.dataset.curtain, !!document.querySelector('.curtain-stage') && !document.querySelector('.curtain-stage').hidden, document.querySelector('.curtain--left').classList.contains('curtain--gl')]"
        # Erst steht der CSS-Vorhang, dann übernimmt WebGL - auf beides warten
        until(pg, f"() => {{ const h = ({held_js})(), g = ({gl_js})(); return h[0] === 'holding' && h[1] >= h[2] / 2 - 2 && h[3] && g[0] === 'fabric' && g[1] && g[2]; }}")
        held = pg.evaluate(held_js)
        check("Erster Besuch mit Passwort: Vorhang bleibt geschlossen, Eingabe liegt darauf", held[0] == "holding" and held[1] >= held[2] / 2 - 2 and held[3], held)
        gl = pg.evaluate(gl_js)
        check("… als „Lebendiger Stoff\" (WebGL), nicht als einfacher CSS-Vorhang", gl == ["fabric", True, True], gl)
        pg.screenshot(path=str(SHOTS / "einlass-vorhang.png"))
        pg.fill("#gate-password", "Popcorn"); pg.keyboard.press("Enter")
        opening = until(pg, "() => ['playing', 'rest'].includes(document.documentElement.dataset.curtainPhase)")
        check("Nach dem Passwort öffnet sich der Vorhang", opening and pg.locator(".site-gate").count() <= 1, pg.evaluate("() => document.documentElement.dataset.curtainPhase"))
        opened_js = "() => [document.documentElement.dataset.curtainPhase, Math.round(document.querySelector('.curtain--left').getBoundingClientRect().width)]"
        until(pg, f"() => {{ const o = ({opened_js})(); return o[0] === 'rest' && o[1] < 200; }}")
        opened = pg.evaluate(opened_js)
        check("… und steht danach offen am Rand, Sammlung sichtbar", opened[0] == "rest" and opened[1] < 200 and pg.locator(".movie-card").first.is_visible(), opened)
        pg.context.close()

        pg = page()
        goto(pg, base + "/titel.html?id=m1"); pg.wait_for_selector(".site-gate")
        check("Detailseite direkt aufgerufen: ebenfalls gesperrt", pg.evaluate("() => getComputedStyle(document.querySelector('.shell')).visibility") == "hidden")
        pg.fill("#gate-password", " Popcorn "); pg.click(".site-gate .button")
        until(pg, "() => !document.querySelector('.site-gate') && !!document.querySelector('.details-grid')")
        check("… nach Eingabe Details sichtbar (Leerzeichen egal)", pg.locator(".site-gate").count() == 0 and pg.is_visible(".details-grid"))
        streaming = pg.get_attribute(".detail-field:last-child a", "href")
        check("Detailseite: Link zu WerStreamt.es aus der IMDb-Kennung", streaming == "https://www.werstreamt.es/filme-serien/?q=tt0000010", streaming)
        pg.context.close()
        target.write_text(plain, encoding="utf-8")

        print("O · Ohne persönliche Angaben")
        full = json.loads(target.read_text(encoding="utf-8"))
        pg = page()
        pg.goto(base + "/werkzeug.html")
        pg.set_input_files("#backup-input", str(BACKUP))
        until(pg, "() => document.querySelector('#result-status').textContent.includes('Titel')")
        for key in ("medium", "seen", "rating", "lists"):
            pg.uncheck(f"#tool-options input[value={key}]")
        with pg.expect_download() as info:
            pg.click("#download-button")
        info.value.save_as(target)
        check("Werkzeug meldet „ohne persönliche Angaben“", "ohne persönliche Angaben" in pg.text_content("#result-status"))
        pg.context.close()
        pg = page(intro=False)
        goto(pg, base + "/index.html"); pg.wait_for_selector(".movie-card")
        groups = pg.eval_on_selector_all(".filter-group-label", TITLES)
        sorts = pg.eval_on_selector_all("#movie-sort option", "els => els.map(e => e.value)")
        check("Nur Filtergruppen Art und Genre, keine Sortierung nach eigener Bewertung", groups == ["Art", "Genre"] and "yourRating" not in sorts, (groups, sorts))
        check("Keine Medium-Abzeichen, kein „Gesehen“ auf Karten", pg.locator(".media-badge, .movie-card-facts .seen").count() == 0)
        pg.click("#tab-stats")
        nums = pg.eval_on_selector_all(".stat-item", "els => els.map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check("Zahlen Gesamt/Filme/Serien", nums == ["10 Gesamt", "6 Filme", "3 Serien"], nums)
        goto(pg, base + "/index.html"); pg.wait_for_selector("#stats-numbers .stat-item")
        pg.click("#tab-timeline"); pg.wait_for_selector(".coverflow-item")
        until(pg, "() => document.querySelector('#timeline-count').textContent.endsWith('von 10')")
        tl = pg.evaluate("() => [getComputedStyle(document.querySelector('.timeline-mode')).display, document.querySelector('#timeline-count').textContent, document.querySelector('.timeline-facts').textContent]")
        check("Zeitleiste ohne eigene Bewertung: nur „Erschienen\", kein Umschalter, keine Bewertungsdaten", tl[0] == "none" and tl[1].endswith("von 10") and "bewert" not in tl[2].lower() and pg.locator(".timeline-gap-hint").count() == 0, tl)
        pg.click("#tab-constellation"); pg.wait_for_selector(".cs-star")
        cs = pg.evaluate("() => [document.querySelector('.constellation-mode').classList.contains('is-single'), document.querySelector('#constellation-foot').textContent]")
        check("Sternbild ohne eigene Bewertung: nur ganze Sammlung, kein Umschalter", cs[0] and cs[1].startswith("10 Titel"), cs)
        goto(pg, base + "/titel.html?id=m1"); pg.wait_for_selector(".details-grid")
        dl = pg.eval_on_selector_all(".detail-field dt", TITLES)
        check("Detailseite ohne Bewertung, Gesehen, Listen, Medium", not any(x in dl for x in ["Meine Bewertung", "Gesehen am", "IMDb-Listen"]) and pg.locator(".detail-summary").count() == 0, dl)
        pg.context.close()
        target.write_text(json.dumps(full), encoding="utf-8")

        print("B · Bewegung: Leuchtreklame, Lichtkegel, Cover-Flug, Klapptafel")
        pg = page(intro=False, dust=True)
        # Merkt sich Start- und Zielpunkt des Cover-Flugs über den Seitenwechsel hinweg
        pg.add_init_script("""new MutationObserver((_, watch) => {
            const f = document.querySelector('.cover-flight-card');
            if (!f) return;
            sessionStorage.setItem('test:flight', JSON.stringify([parseFloat(f.style.left), parseFloat(f.style.top), parseFloat(f.style.width)]));
            watch.disconnect();
        }).observe(document, { childList: true, subtree: true });""")
        goto(pg, base + "/index.html"); pg.wait_for_selector(".movie-card")
        marquee_js = "() => { const f = document.querySelector('#quote-of-day'); return [f.classList.contains('is-marquee'), f.querySelectorAll('.quote-bulb').length, f.classList.contains('is-writing')]; }"
        until(pg, f"() => {{ const q = ({marquee_js})(); return q[0] && q[1] >= 30 && q[2]; }}")
        q = pg.evaluate(marquee_js)
        check("Filmzitat als Leuchtreklame: Birnen rundum, Text schreibt sich", q[0] and q[1] >= 30 and q[2], q)
        dust_js = "() => { const c = document.querySelector('.page-head > canvas.projector-dust'); return c ? [c.width > 300, c.hidden, localStorage.getItem('site:projector-dust')] : null; }"
        dust_on = pg.evaluate(dust_js)
        pg.click("#view-button")
        dust_checked = pg.is_checked("#projector-dust-check")
        pg.uncheck("#projector-dust-check")
        until(pg, "() => document.querySelector('canvas.projector-dust').hidden")
        dust_off = pg.evaluate(dust_js)
        check("Lichtkegel mit Staub: an, ausgeschaltet sofort weg und gemerkt", dust_on[:2] == [True, False] and dust_checked and dust_off[1:] == [True, "off"], [dust_on, dust_checked, dust_off])
        pg.check("#projector-dust-check"); close_modal(pg)
        card = pg.locator(".movie-card >> nth=2")
        cid = card.get_attribute("data-movie-id")
        card.click(); pg.wait_for_url(f"**/titel.html?id={cid}"); ready(pg)
        fl = pg.evaluate("() => JSON.parse(sessionStorage.getItem('test:flight') || 'null')")
        land = pg.evaluate("() => { const r = document.querySelector('#detail-cover').getBoundingClientRect(); return [r.left, r.top, r.width, document.documentElement.dataset.coverLanded !== undefined, !!document.querySelector('#detail-cover img')]; }")
        check("Cover fliegt und landet genau im Rahmen der Detailseite, mit Bild", fl and land[3] and land[4] and all(abs(a - b) <= 1 for a, b in zip(fl, land[:3])), [fl, land])
        pg.go_back(); pg.wait_for_url("**/index.html"); ready(pg); pg.wait_for_selector(".movie-card")
        pg.click("#tab-stats")
        flaps_js = "() => [...document.querySelectorAll('#stats-numbers .flap-number')].map(n => [n.dataset.flapTarget, [...n.querySelectorAll('.flap')].map(c => c.dataset.char).join('')])"
        until(pg, f"() => {{ const f = ({flaps_js})(); return f.length > 0 && f.every(([t, s]) => t === s); }}")
        flaps = pg.evaluate(flaps_js)
        check("Klapptafel-Zahlen geblättert bis 10 / 6 / 4", flaps == [["10", "10"], ["6", "6"], ["4", "4"]], flaps)
        pg.context.close()

        print("F · Fehlerfälle, schmales Fenster")
        pg = page(intro=False)
        goto(pg, base + "/titel.html?id=gibt-es-nicht")
        check("Unbekannter Titel → Hinweis mit Weg zurück", pg.text_content("#movie-title") == "Titel nicht gefunden" and pg.is_visible(".empty-state a"))
        check("… ohne Blättern-Leiste", not pg.is_visible("#detail-pager"))
        (site / "data" / "sammlung.json").rename(site / "data" / "weg.json")
        goto(pg, base + "/index.html")
        check("Datendatei fehlt → verständliche Meldung", "konnte nicht geladen werden" in pg.text_content("#movies-grid"), pg.text_content("#movies-grid"))
        (site / "data" / "weg.json").rename(site / "data" / "sammlung.json")
        pg.context.close()
        pg = page(width=360, height=740, intro=False)
        goto(pg, base + "/index.html"); pg.wait_for_selector(".movie-card")
        over = pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Handy (360 px): nichts ragt heraus", over <= 0, over)
        pg.screenshot(path=str(SHOTS / "handy.png"))
        pg.context.close()

        check("Keine Skriptfehler", not errors, errors)
        browser.close()

    shutil.rmtree(tmp, ignore_errors=True)
    failed = RESULTS.count(False)
    print(f"\n{len(RESULTS)} Prüfungen, {failed} fehlgeschlagen")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
