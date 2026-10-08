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

- **Titel**: Raster mit Covern, Suche (Titel, Regie, Genre), Filterleiste
  mit aufklappbaren Gruppen (Art, Genre, Medium, Status, Liste, Import) und Sortierung (Standard:
  IMDb-Bewertung). „Import" zeigt, was im Dashboard im dort eingestellten Zeitraum (Standard 4 Wochen)
  neu importiert oder durch den Import geändert wurde. Suche, Filter und Sortierung
  bleiben während des Besuchs erhalten, auch nach einer Detailseite.
- **Zeitleiste**: Cover Flow (ein Titel groß in der Mitte, die Nachbarn
  schräg daneben), darunter eine Zeitleiste mit einem Strich je Titel –
  nach Erscheinen oder (wenn veröffentlicht) nach dem Tag meiner Bewertung;
  Klick aufs mittlere Cover zeigt den Abstand dazwischen. Suche und Filter
  wirken mit.
- **Auf einen Blick**: Gesamt/Gesehen/Offen und „Was schauen wir heute?".
- **Detailseite** je Titel mit allen veröffentlichten Angaben, Blättern per
  Knopf oder Pfeiltaste (in der Reihenfolge der Sammlung).
- **Streaming**: Auf der Detailseite führt „Bei WerStreamt.es ansehen" zu
  den Anbietern, bei denen der Titel läuft (über die IMDb-Kennung).
- **Passwort** (wahlweise, im Werkzeug): Besucher sehen die Sammlung erst
  nach Eingabe; ihr Browser merkt sich das. Nur ein Sichtschutz, siehe unten.
- **Ansicht** (oben rechts): Kinovorhang („Lebendiger Stoff") bei jedem
  Besuch / einmal am Tag / nie, Vorschau, Tastenkürzel. Design hell/dunkel/System. Gilt nur im
  Browser des jeweiligen Besuchers.
- Fehlt eine wahlweise Angabe in der Datendatei (z. B. Gesehen-Status),
  verschwinden die passenden Filter, Sortierungen und Zahlen automatisch.

## Sammlung aktualisieren

1. Im Dashboard: Einstellungen → Daten → **Sicherung speichern**.
2. Auf deiner Website `…/werkzeug.html` öffnen (die Seite ist nirgends
   verlinkt). Sicherung wählen, Häkchen setzen, **sammlung.json speichern**.
   Alles passiert nur in deinem Browser – die Sicherung wird nicht hochgeladen.
   Das Passwort (falls eingeschaltet) bleibt wie beim letzten Mal, solange
   du das Feld leer lässt.
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
| Titel, Originaltitel, Jahr, Art, Genre, Regie, Laufzeit, Veröffentlichung, IMDb-Bewertung, -Stimmen, -Kennung und -Link, In IMDb aufgenommen/geändert, Position in der Liste, Beschreibung, Cover-Link, Zeitpunkt „vom Import angelegt/geändert" | Medium, Gesehen-Status und -Datum, eigene Bewertung, Namen der IMDb-Listen, Notizen (Standard: aus) | OMDb-Schlüssel, Favoriten, Einstellungen, interne Felder |

**Passwort:** Ist im Werkzeug eins gesetzt, liegt vor der Sammlung ein
Einlass. Das hält Neugierige ab, mehr nicht: Die Daten liegen weiterhin
offen in `data/sammlung.json`, und wer sich auskennt, ruft die Datei direkt
ab. In der Datei steht nur ein Prüfwert (SHA-256 mit Salz), nie das Passwort.

Hinweis: Alte Stände bleiben im Git-Verlauf abrufbar. Was einmal
veröffentlicht war, lässt sich durch eine neue Datei nicht ganz zurückholen.

Die Cover-Bilder werden direkt von IMDb/Amazon geladen (gespeichert ist nur
der Link).

## Aufbau

```
index.html               Sammlung (Titel, Zeitleiste, Auf einen Blick), Kinovorhang
titel.html               Detailseite eines Titels (?id=…)
werkzeug.html            Daten vorbereiten: Sicherung → sammlung.json
data/sammlung.json       Die veröffentlichten Daten (vom Werkzeug erzeugt)
assets/logo.svg          Logo (Medaillon, Favicon)
css/
├── app.css              Design (gemeinsam mit dem Dashboard)
├── curtain.css          Kinovorhang (gemeinsam mit dem Dashboard)
└── site.css             Ergänzungen nur für die Website
js/
├── boot.js              Vor dem ersten Zeichnen: Design, ob/wie der Vorhang spielt
├── data-source.js       Lädt data/sammlung.json
├── collection.js        Datenmodell der Titel (gemeinsam mit dem Dashboard)
├── pages/               Einstieg je Seite: sammlung.js, titel.js, werkzeug.js
├── tools/publish-logic.js  Umwandlung Sicherung → Website-Datei (Positivliste)
├── tools/access-logic.js   Passwort: Prüfwert erzeugen und prüfen (nur hier)
├── logic/               Reine Funktionen (Filter, Statistik, Zeitleiste, Vorhang, Medaillon) - gemeinsam
├── ui/                  Karten, Chips, Statistik, Zeitleiste, Vorhang, Medaillon, Tastenkürzel - gemeinsam;
│                        nur hier: site-shell.js (Kopfleiste und Dialog „Ansicht"),
│                        site-gate.js (Einlass mit Passwort)
└── utils/               Helfer und media.js (Medien) - gemeinsam; nur hier: constants.js
gemeinsam.txt            Liste der Dateien, die aus dem Dashboard kommen
Gemeinsames-holen.bat    Doppelklick: diese Dateien aus ..\Dashboard herüberkopieren
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

**Gemeinsamer Code:** Karten, Filter, Statistik, Zeitleiste, Vorhang, Medaillon, Design
und Hilfsfunktionen sind dieselben Dateien wie im Dashboard - die Liste steht
in `gemeinsam.txt`. Das Dashboard ist die Quelle: Nach einer Änderung dort
`Gemeinsames-holen.bat` doppelklicken (erwartet den Ordner `Dashboard` direkt
neben diesem), in GitHub Desktop ansehen, committen, pushen.
`tests/gemeinsam.test.mjs` meldet, wenn hier etwas vom Dashboard abweicht.
Diese Dateien hier nie direkt ändern - die nächste Übernahme würde es
überschreiben.

Die Datei `data/sammlung.json` ist der einzige Weg, auf dem Daten vom
Dashboard hierher kommen.

## Tests

```
npm test                          # Logik-Tests (Node)
python tests/browser/test_site.py # Browser-Test (Playwright + Chromium)
```

Lokal ansehen geht nur über einen kleinen Webserver (Browser laden
JavaScript-Module nicht von der Festplatte), z. B. `python -m http.server`
in diesem Ordner und dann http://localhost:8000.
