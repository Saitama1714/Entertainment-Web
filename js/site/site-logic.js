import { has } from "../utils/host.js";

/*
 * Nur Website: reine Regeln ohne DOM (getestet in tests/site.test.mjs).
 */

/** Standard-Sortierung der Website: IMDb-Bewertung (das Dashboard: die eigene). */
export const SITE_DEFAULT_SORT = "imdbRating";

/**
 * Sortier-Optionen der Website: IMDb-Bewertung vorn, „Meine" statt „Deine
 * Bewertung", ohne Sortierungen nach nicht veröffentlichten Angaben.
 * @param {Array<{value: string, label: string, direction: string}>} options - SORT_OPTIONS.
 */
export function siteSortOptions(options) {
  return [...options]
    .sort((a, b) => (b.value === SITE_DEFAULT_SORT) - (a.value === SITE_DEFAULT_SORT))
    .filter(option => !["yourRating", "dateRated"].includes(option.value) || has("rating"))
    .map(option => (option.value === "yourRating" ? { ...option, label: "Meine Bewertung" } : option));
}
