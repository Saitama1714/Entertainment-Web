/*
 * Nur Website (Entertainment-Web): Werte, die es im Dashboard so nicht gibt.
 */

/** Name der Seite: Überschrift, Fenstertitel, Name des Logos für Screenreader. */
export const SITE_TITLE = "Filmsammlung";

/**
 * Dekoration unten links, nachdem sich der Vorhang geöffnet hat (siehe
 * js/ui/curtain-icons.js). Nur der Rückfall: Die Datendatei bringt die im
 * Dashboard gewählte Deko mit (`decor`).
 */
export const CORNER_ICON = "popcorn";

/**
 * Kinovorhang: wann er spielt (Ansicht → Kinovorhang). Ausgewertet in
 * js/site/boot.js. „Bei jedem Besuch" = einmal pro geöffnetem Browserfenster,
 * nicht bei jedem Zurückkehren von einer Detailseite.
 */
export const INTRO_OPTIONS = [
  { value: "visit", label: "Bei jedem Besuch" },
  { value: "daily", label: "Einmal am Tag" },
  { value: "off", label: "Nie" },
];
