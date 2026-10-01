# Filmsammlung (Entertainment-Web)

Der Entertainment-Teil des Dashboards als eigenständige Website – zum
Anschauen, nicht zum Bearbeiten. Gepflegt wird die Sammlung weiter im
Dashboard; die Website zeigt einen Stand, den du ab und zu aktualisierst.

```
Dashboard  →  „Sicherung speichern"  →  werkzeug.html  →  data/sammlung.json  →  Website
```

Reine statische Seite (HTML, CSS, JavaScript-Module), kein Server, kein Build,
keine Datenbank. Läuft bei jedem Anbieter für statische Seiten, z. B. GitHub
Pages – Anleitung in [docs/HOSTING.md](docs/HOSTING.md).

## Was die Website kann

- **Titel**: Raster mit Covern, Suche (Titel, Regie, Genre), Filter-Chips
  (Art, Genre, Medium, Status, Liste) und Sortierung. Suche, Filter und Sortierung
  bleiben während des Besuchs erhalten, auch nach einer Detailseite.
- **Auf einen Blick**: Gesamt/Gesehen/Offen und „Was schauen wir heute?".
- **Detailseite** je Titel mit allen veröffentlichten Angaben, Blättern per
  Knopf oder Pfeiltaste (in der Reihenfolge der Sammlung).
- **Ansicht** (oben rechts): Kinovorhang bei jedem Besuch / einmal am Tag /
  nie, Vorhang-Animation, Tastenkürzel. Design hell/dunkel/System. Gilt nur im
  Browser des jeweiligen Besuchers.
- Fehlt eine wahlweise Angabe in der Datendatei (z. B. Gesehen-Status),
  verschwinden die passenden Filter, Sortierungen und Zahlen automatisch.

## Sammlung aktualisieren

1. Im Dashboard: Einstellungen → Daten → **Sicherung speichern**.
2. Auf deiner Website `…/werkzeug.html` öffnen (die Seite ist nirgends
   verlinkt). Sicherung wählen, Häkchen setzen, **sammlung.json speichern**.
   Alles passiert nur in deinem Browser – die Sicherung wird nicht hochgeladen.
3. Die neue Datei nach `data/sammlung.json` in diesen Ordner kopieren (alte
   ersetzen), in GitHub Desktop committen und **Push origin**. Nach ein, zwei
   Minuten zeigt die Website den neuen Stand.

Die Sicherung selbst gehört **nie** in diesen Ordner: Sie enthält deinen
OMDb-Schlüssel. `.gitignore` hält Dateien mit „sicherung" im Namen draußen.

## Was öffentlich ist

Die Website ist für jeden mit dem Link sichtbar, Suchmaschinen sind
ausgesperrt (`robots.txt`, `noindex`) – ein Geheimnis ist der Link trotzdem
nicht. Sichtbar ist genau das, was in `data/sammlung.json` steht:

| Immer | Wahlweise (Häkchen im Werkzeug) | Nie |
|---|---|---|
| Titel, Originaltitel, Jahr, Art, Genre, Regie, Laufzeit, Veröffentlichung, IMDb-Bewertung, -Stimmen, -Kennung und -Link, In IMDb aufgenommen/geändert, Position in der Liste, Beschreibung, Cover-Link | Medium, Gesehen-Status und -Datum, eigene Bewertung, Namen der IMDb-Listen, Notizen (Standard: aus) | OMDb-Schlüssel, Favoriten, Einstellungen, interne Felder |

Hinweis: Alte Stände bleiben im Git-Verlauf abrufbar. Was einmal
veröffentlicht war, lässt sich durch eine neue Datei nicht ganz zurückholen.

Die Cover-Bilder werden direkt von IMDb/Amazon geladen (gespeichert ist nur
der Link).

## Aufbau

```
index.html               Sammlung (Titel + Auf einen Blick), Kinovorhang
titel.html               Detailseite eines Titels (?id=…)
werkzeug.html            Daten vorbereiten: Sicherung → sammlung.json
data/sammlung.json       Die veröffentlichten Daten (vom Werkzeug erzeugt)
assets/logo.svg          Logo (Medaillon, Favicon)
css/
├── app.css              Design - unverändert aus dem Dashboard
├── curtain.css          Kinovorhang - unverändert aus dem Dashboard
└── site.css             Ergänzungen nur für die Website
js/
├── boot.js              Vor dem ersten Zeichnen: Design, ob/wie der Vorhang spielt
├── data-source.js       Lädt data/sammlung.json
├── collection.js        Datenmodell der Titel (aus dem Dashboard, gekürzt)
├── pages/               Einstieg je Seite: sammlung.js, titel.js, werkzeug.js
├── tools/publish-logic.js  Umwandlung Sicherung → Website-Datei (Positivliste)
├── logic/               Reine Funktionen aus dem Dashboard (Filter, Statistik, Vorhang, Medaillon)
├── ui/                  Karten, Chips, Statistik, Vorhang, Medaillon, Tastenkürzel (aus dem Dashboard),
│                        site-shell.js: Kopfleiste und Dialog „Ansicht"
└── utils/               Helfer; constants.js: Name der Seite, Optionen
tests/                   Logik-Tests (npm test), Browser-Test in tests/browser/
robots.txt, .nojekyll    Suchmaschinen aussperren; GitHub Pages ohne Jekyll
```

Den Namen der Seite („Filmsammlung") änderst du in `js/utils/constants.js`
(`SITE_TITLE`) und in den `<title>`-Zeilen der drei HTML-Dateien.

## Verhältnis zum Dashboard

**1:1-Abbildung:** Das Werkzeug bereitet jeden Titel genauso auf wie das
Dashboard selbst (gleiche Funktion `newMovie()`), die Website zeigt Karten,
Filter, Sortierungen, Suche, Statistik und Detailangaben mit denselben
Bausteinen. `tests/parity.test.mjs` gleicht beides Feld für Feld ab, auch mit
Sonderfällen (fehlendes/leeres Medium, Einträge ohne Titel, kaputte Links).
Bewusste Unterschiede: „Meine Bewertung" statt „Deine Bewertung";
Notizen nur, wenn im Werkzeug angehakt; Cover- und IMDb-Links, die keine
Web-Adresse sind (z. B. `javascript:`), werden nicht veröffentlicht - das
Dashboard zeigt dort ohnehin nur den Platzhalter.

Die Website ist eine Kopie der Entertainment-Teile aus Dashboard 2.13.1.
Verbesserungen im Dashboard wandern nicht automatisch hierher. `css/app.css`,
`css/curtain.css` und die Dateien in `js/logic/` sind unverändert und lassen
sich bei Bedarf direkt herüberkopieren. Die Datei `data/sammlung.json` ist der
einzige Weg, auf dem Daten vom Dashboard hierher kommen.

## Tests

```
npm test                          # Logik-Tests (Node)
python tests/browser/test_site.py # Browser-Test (Playwright + Chromium)
```

Lokal ansehen geht nur über einen kleinen Webserver (Browser laden
JavaScript-Module nicht von der Festplatte), z. B. `python -m http.server`
in diesem Ordner und dann http://localhost:8000.
