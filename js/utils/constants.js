import { MEDIA_TYPES } from "./media.js";
import { own } from "./host.js";

/**
 * Zentrale Konfigurationswerte. Hier ändern statt an mehreren Stellen im Code.
 * Medientypen und ihre Abzeichen stehen in utils/media.js.
 */
export const CONFIG = {
  MAX_PINNED_BOOKMARKS: 32,
  MEDIA_TYPES,
  MOVIE_PREVIEW_COUNT: 16,
  SEARCH_DEBOUNCE_MS: 300,
  TOAST_DURATION_MS: 4000,
  OMDB_FETCH_DELAY_MS: 260, // Free-Tier: ~1000 Anfragen/Tag, kleine Pause zwischen Requests
};

/**
 * Kinovorhang auf der Startseite: wann er spielt (Einstellungen →
 * Erscheinungsbild). Ausgewertet in js/boot.js; „Jede Stunde"/„Alle 2 Stunden"
 * zählen ab dem letzten Abspielen.
 */
export const INTRO_OPTIONS = [
  { value: "always", label: "Bei jedem neuen Tab" },
  { value: "hourly", label: "Jede Stunde" },
  { value: "every2h", label: "Alle 2 Stunden" },
  { value: "daily", label: "Einmal am Tag" },
  { value: "off", label: "Nie" },
];

/**
 * Klick-Animation für Links (Einstellungen → Bewegung). Werte wie in
 * js/logic/link-transition-logic.js; Reihenfolge = Reihenfolge der Optionen.
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
 * Logo für den Kachel-Zoom (Klick-Animation), in seinen eigenen Farben.
 * Dashboard: Pfad ab Erweiterungs-Wurzel. Website: relativ, weil sie auch in
 * einem Unterordner liegen kann (GitHub Pages). Fehlt die Datei, zeigt der
 * Zoom stattdessen das Monogramm (erster Buchstabe).
 */
export const BRAND_LOGO = { src: own("/assets/logo.svg", "assets/logo.svg") };

/** Erinnerung an einen neuen IMDb-Export: Wert = Tage, 0 = nie erinnern. */
export const REMINDER_OPTIONS = [
  { value: 0, label: "Nie" },
  { value: 7, label: "Nach 1 Woche" },
  { value: 14, label: "Nach 2 Wochen" },
  { value: 30, label: "Nach 1 Monat" },
  { value: 90, label: "Nach 3 Monaten" },
];

/**
 * Wählbare Dekoration unten links auf der Startseite (siehe ui/curtain.js).
 * "none" zeigt keine Dekoration. Reihenfolge = Reihenfolge im Dropdown.
 */
export const CURTAIN_ICONS = [
  { value: "none", label: "Kein Symbol" },
  { value: "popcorn", label: "Popcornbox" },
  { value: "clapperboard", label: "Filmklappe" },
  { value: "ticket", label: "Kinoticket" },
  { value: "watermelon", label: "Wassermelone" },
];
