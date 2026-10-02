/**
 * Zentrale Konfigurationswerte der Website. Hier ändern statt an mehreren
 * Stellen im Code. Diese Datei gehört nur der Website (nicht in gemeinsam.txt).
 */

/** Name der Seite: Überschrift, Fenstertitel, Name des Logos für Screenreader. */
export const SITE_TITLE = "Filmsammlung";

/** Die Datendatei, die das Umwandlungs-Werkzeug (werkzeug.html) erzeugt. */
export const DATA_URL = "data/sammlung.json";

/** Medientypen und Abzeichen stehen in utils/media.js (gemeinsam mit dem Dashboard). */
export const CONFIG = {
  SEARCH_DEBOUNCE_MS: 300,
  TOAST_DURATION_MS: 4000,
};

/**
 * Kinovorhang: wann er spielt (Ansicht → Kinovorhang). Ausgewertet in
 * js/boot.js. „Bei jedem Besuch" = einmal pro geöffnetem Browserfenster, nicht
 * bei jedem Zurückkehren von einer Detailseite.
 */
export const INTRO_OPTIONS = [
  { value: "visit", label: "Bei jedem Besuch" },
  { value: "daily", label: "Einmal am Tag" },
  { value: "off", label: "Nie" },
];

/** Dekoration unten links, nachdem sich der Vorhang geöffnet hat (siehe ui/curtain-icons.js). */
export const CORNER_ICON = "popcorn";
