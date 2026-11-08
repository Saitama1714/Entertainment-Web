/*
 * Nur Website (Entertainment-Web): Werte, die es im Dashboard so nicht gibt.
 */

/** Name der Seite: Überschrift, Fenstertitel, Name des Logos für Screenreader. */
export const SITE_TITLE = "Meine Kinothek";

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
