/**
 * Zentrale Konfigurationswerte der Website. Hier ändern statt an mehreren
 * Stellen im Code.
 */

/** Name der Seite: Überschrift, Fenstertitel, Name des Logos für Screenreader. */
export const SITE_TITLE = "Filmsammlung";

/** Die Datendatei, die das Umwandlungs-Werkzeug (werkzeug.html) erzeugt. */
export const DATA_URL = "data/sammlung.json";

export const CONFIG = {
  MEDIA_TYPES: ["DVD", "Blu-ray", "UHD Blu-ray", "Digital", "Sonstiges"],
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

/** Vorhang-Animation; Werte wie in js/logic/curtain-motion.js und js/boot.js. */
export const CURTAIN_STYLES = [
  { value: "fabric", label: "Lebendiger Stoff" },
  { value: "theater", label: "Theater-Raffvorhang" },
  { value: "atmosphere", label: "Kino-Atmosphäre" },
  { value: "classic", label: "Klassisch (schlicht)" },
];

/** Dekoration unten links, nachdem sich der Vorhang geöffnet hat (siehe ui/curtain-icons.js). */
export const CORNER_ICON = "popcorn";

/**
 * Anzeige-Infos je Medientyp für den Karten-Badge: entweder ein kurzes Kürzel
 * (label) oder ein Icon (siehe utils/icons.js), plus Farbton (tone).
 */
export const MEDIA_BADGES = {
  "DVD": { label: "DVD", tone: "gray" },
  "Blu-ray": { label: "BD", tone: "blue" },
  "UHD Blu-ray": { label: "4K", tone: "green" },
  "Digital": { icon: "cloud", tone: "gray" },
  "Sonstiges": { label: "—", tone: "gray" },
};
