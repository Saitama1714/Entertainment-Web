# Änderungen

## 1.11.1
- Einlass: Der geschlossen wartende Vorhang ist jetzt der hochwertige
  „Lebendige Stoff“ (WebGL) statt des einfachen Ersatzvorhangs.

## 1.11.0 – Einlass auf dem Vorhang
- Mit Passwort bleibt der Kinovorhang beim Laden geschlossen, die Eingabe
  liegt darauf. Erst nach dem richtigen Passwort öffnet er sich und gibt
  die Sammlung frei. Ohne Passwort (oder schon freigeschaltet) öffnet er
  sich wie bisher, sobald die Daten geladen sind. Spielt der Vorhang bei
  diesem Besuch nicht (Ansicht → „Nie“ o. Ä.), erscheint der Einlass wie
  bisher auf eigenem Hintergrund.

## 1.10.0 – Wie im Dashboard (Dashboard 2.26.0)
- Kachel-Zoom beim Klick auf Titel und Links, einstellbar unter „Ansicht“
  → Bewegung (Kachel-Zoom / Aus, Tempo) – gilt pro Browser.
- Filmzitat des Tages über der Sammlung.
- Die Ecken-Deko unten links ist die im Dashboard gewählte (`decor` in
  `sammlung.json`; ältere Dateien: Popcorn).
- `Sammlung-holen.bat`: holt die vom Dashboard automatisch gespeicherte
  `sammlung.json` aus dem Download-Ordner nach `data/`. Das Werkzeug bleibt
  für den Weg von Hand.
- `publish-logic.js` und `access-logic.js` liegen jetzt unter `js/logic/`
  und kommen aus dem Dashboard (`gemeinsam.txt`), dazu Kachel-Zoom und
  Filmzitat.

## 1.9.2 (Dashboard 2.25.2)
- Cover Flow: Spiegelungen bleiben beim Blättern sichtbar.

## 1.9.1 (Dashboard 2.25.1)
- Cover Flow der Zeitleiste zeigt so viele Cover, wie nebeneinander passen.

## 1.9.0 – Passwort und Streaming-Link (Dashboard 2.25.0)
- Wahlweise Passwort: Im Werkzeug „Passwortschutz einschalten" und ein
  Passwort eingeben. Besucher sehen dann zuerst einen Einlass mit Logo und
  Passwortfeld, erst danach die Sammlung (auch Detailseiten, die direkt
  aufgerufen werden). Der Browser merkt sich die Freischaltung; ein neues
  Passwort fragt wieder. Ein reiner Sichtschutz: In `sammlung.json` stehen
  nur Salz und Prüfwert (SHA-256), die Datei selbst bleibt abrufbar.
  Das Werkzeug merkt sich den Prüfwert, leeres Feld = Passwort behalten.
- Detailseite: „Streaming → Bei WerStreamt.es ansehen" (aus der
  IMDb-Kennung gebildet, kommt mit `movies-logic.js` aus dem Dashboard).
- Neu: `js/tools/access-logic.js`, `js/ui/site-gate.js`,
  `tests/access.test.mjs` (nur Website).

## 1.8.0 – Zeitleiste mit Cover Flow (Dashboard 2.24.1)
- Neue Registerkarte „Zeitleiste" wie im Dashboard: Cover Flow, darunter
  eine Zeitleiste mit einem Strich je Titel, Umschalter „Erschienen /
  Bewertet", Abstand zwischen Erscheinen und Bewertung per Klick aufs
  mittlere Cover oder Enter. Suche und Filter stehen dafür über den
  Registerkarten und gelten auch für die Zeitleiste.
- „Bewertet" und der Abstand erscheinen nur, wenn die eigene Bewertung
  veröffentlicht ist (Häkchen im Werkzeug); sonst nur „Erschienen".
- Registerkarte und Ansicht der Zeitleiste bleiben für den Besuch gemerkt.
- `js/ui/timeline.js`, `js/logic/timeline-logic.js` und
  `tests/timeline.test.mjs` sind neu in `gemeinsam.txt`. Keine neue
  Datendatei nötig.

## 1.7.0 – Sortierung mit Richtung (Dashboard 2.23.0)
- Sortierung als Auswahl plus Pfeil-Knopf (auf-/absteigend), neu auch nach
  Laufzeit und „Gesehen am" (nur wenn der Gesehen-Status veröffentlicht ist).
  Standard bleibt die IMDb-Bewertung. `js/ui/sort-control.js` ist neu in
  `gemeinsam.txt`.

## 1.6.0 – Zeitraum des Import-Filters (Dashboard 2.21.0)
- Das Werkzeug übernimmt den im Dashboard eingestellten Zeitraum des Filters
  „Import" in `sammlung.json` (`importWindowDays`, Standard 28 Tage); die
  Website filtert damit. Gemeinsame Dateien per `Gemeinsames-holen.bat`.

## 1.5.0 – Aufgeräumte Filterleiste (Dashboard 2.18.0)
- Filter als Zeile mit einem Knopf je Gruppe, Auswahl zum Aufklappen (auf
  dem Handy als Blatt von unten). Kommt über `Gemeinsames-holen.bat`;
  `js/pages/sammlung.js` ruft dafür `initFilterBar()` auf. Keine neue
  Datendatei nötig.

## 1.4.0 – Filter „Import" (Dashboard 2.17.0)
- Neue Filtergruppe „Import" (Neu/Geändert in den letzten 4 Wochen) wie im
  Dashboard. Das Werkzeug veröffentlicht dafür `importAddedAt` und
  `importChangedAt` immer mit (Grundangaben). Neue Datendatei nötig: im
  Dashboard „Sicherung speichern", dann im Werkzeug umwandeln.
- „Zuletzt hinzugekommen" entfällt; Standard-Sortierung ist die
  IMDb-Bewertung (auch für das Blättern auf der Detailseite). Ein gemerkter
  alter Zustand („recent") fällt automatisch darauf zurück.
- `tests/import-filter.test.mjs` ist neu in `gemeinsam.txt`.

## 1.3.0 – Gemeinsamer Code mit dem Dashboard
- Karten, Filter, Statistik, Vorhang, Medaillon, Design und Hilfsfunktionen
  sind jetzt dieselben Dateien wie im Dashboard (2.16.0). Liste in
  `gemeinsam.txt`; `Gemeinsames-holen.bat` holt sie per Doppelklick aus dem
  Dashboard-Ordner nebenan; `tests/gemeinsam.test.mjs` prüft, dass nichts
  auseinanderläuft.
- Kinovorhang wie im Dashboard nur noch „Lebendiger Stoff" (Auswahl
  „Vorhang-Animation" entfällt, „Vorschau abspielen" bleibt).

## 1.2.1
- Filtergruppe „Art" erkennt die deutschen IMDb-Bezeichnungen („Film",
  „Fernsehserie", „Miniserie" …) wie das Dashboard 2.14.1. Gilt sofort für
  die vorhandene Datendatei.

## 1.2.0 – Genre-Filter
- Neue Filtergruppe „Genre" wie im Dashboard 2.14.0 (alle Genres der
  Sammlung, alphabetisch; mehrere = ODER, mit anderen Gruppen = UND).
  Funktioniert mit der bestehenden Datendatei, kein neues Umwandeln nötig.

## 1.1.0 – 1:1 wie im Dashboard
- Das Werkzeug bereitet jeden Titel jetzt mit derselben Funktion auf wie das
  Dashboard (`newMovie()`) und veröffentlicht damit genau, was das Dashboard
  anzeigt - auch in Sonderfällen (fehlendes Medium, Gesehen als Text,
  Einträge ohne Titel, leere Listennamen).
- Einträge ohne Titel werden nicht mehr weggelassen (das Dashboard zeigt sie).
- Links (Cover, IMDb) werden Zeichen für Zeichen übernommen statt
  umformatiert; eingebettete Cover-Bilder (`data:image/…`) bleiben erhalten.
- Detailseite: zusätzlich IMDb-Kennung, „In IMDb aufgenommen/geändert" und
  „Position in der Liste"; alle Angaben in derselben Reihenfolge wie im
  Dashboard. Diese Felder erscheinen, sobald die Datendatei neu erzeugt wurde.
- Sortierung heißt „Meine Bewertung" (statt „Deine Bewertung").
- Neuer Abgleich-Test `tests/parity.test.mjs` (Dashboard ↔ Website).

## 1.0.1
- Fehler behoben: Titel ohne Medium erschienen auf der Website als „DVD".
  Das Werkzeug hatte leere Medien weggelassen, und die Website las ein
  fehlendes Medium (wie das Dashboard bei alten Daten) als DVD. Jetzt schreibt
  das Werkzeug das Medium immer aus, und die Website liest ein fehlendes Medium
  als „kein Medium" - auch bei bereits veröffentlichten Dateien.

## 1.0.0 – Erste Version
- Filmsammlung als Website, nur lesen: Raster mit Suche, Filter-Chips und
  Sortierung, Registerkarte „Auf einen Blick" mit Zahlen und Zufallspicker,
  Detailseite je Titel mit Blättern (Knöpfe und Pfeiltasten).
- Design wie im Dashboard (Kino-Noir, hell/dunkel), Logo-Medaillon,
  Kinovorhang beim Besuch; unter „Ansicht" einstellbar (bei jedem Besuch,
  einmal am Tag, nie) samt Vorhang-Animation.
- Werkzeug „Daten vorbereiten" (`werkzeug.html`): macht aus einer
  Dashboard-Sicherung die Datei `data/sammlung.json`. Positivliste der Felder,
  OMDb-Schlüssel und Einstellungen kommen nie mit; Medium, Gesehen-Status,
  eigene Bewertung, Listen und Notizen per Häkchen.
- Für Suchmaschinen gesperrt (`robots.txt`, `noindex`).
- Übernommen aus dem Dashboard 2.13.1.
