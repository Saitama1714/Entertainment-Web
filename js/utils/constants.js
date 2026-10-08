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

/**
 * Dekoration unten links, nachdem sich der Vorhang geöffnet hat (siehe
 * ui/curtain-icons.js). Nur der Rückfall: Die Datendatei bringt die im
 * Dashboard gewählte Deko mit (`decor`).
 */
export const CORNER_ICON = "popcorn";

/**
 * Klick-Animation für Links (Ansicht → Bewegung), wie im Dashboard. Werte
 * wie in js/logic/link-transition-logic.js (gemeinsam).
 */
export const CLICK_EFFECT_OPTIONS = [
  { value: "zoom", label: "Kachel-Zoom" },
  { value: "off", label: "Aus" },
];
export const CLICK_DURATION_OPTIONS = [
  { value: 250, label: "Schnell (250 ms)" },
  { value: 450, label: "Normal (450 ms)" },
  { value: 800, label: "Gemächlich (800 ms)" },
];

/**
 * Logo für den Kachel-Zoom (js/ui/link-transition.js, gemeinsam). Relativ,
 * weil die Website auch in einem Unterordner liegen kann (GitHub Pages).
 */
export const BRAND_LOGO = { src: "assets/logo.svg" };
