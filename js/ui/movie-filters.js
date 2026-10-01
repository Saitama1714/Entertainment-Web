import { escapeHtml } from "../utils/dom.js";
import {
  KIND_FILTER_OPTIONS, MEDIA_FILTER_OPTIONS, SEEN_FILTER_OPTIONS, listFilterOptions,
  facetCounts, hasActiveFilters,
} from "../logic/movies-logic.js";

/*
 * Markup der Filter-Chips (übernommen aus dem Dashboard). Reines Rendering: welche
 * Titel ein Filter trifft und wie gezählt wird, steht in movies-logic.js.
 */

/** Eine einzelne Chip-Schaltfläche (aria-pressed = aktiv). */
function chipHtml(category, option, count, active) {
  const empty = count === 0 && !active ? " is-empty" : "";
  return `
    <button type="button" class="filter-chip${empty}" data-category="${category}" data-value="${escapeHtml(option.value)}"
            aria-pressed="${active}">
      ${escapeHtml(option.label)}<span class="chip-count">${count}</span>
    </button>`;
}

/** Eine Gruppe (Beschriftung + Chips); leer, wenn es nichts zu wählen gibt. */
function groupHtml(label, category, options, filters, counts) {
  if (!options.length) return "";
  const active = new Set(filters[category]);
  const chips = options
    .map(option => chipHtml(category, option, counts[category].get(option.value) || 0, active.has(option.value)))
    .join("");
  return `<div class="filter-group"><span class="filter-group-label">${escapeHtml(label)}</span>${chips}</div>`;
}

/**
 * Baut die komplette Chip-Leiste (Art, Medium, Status, IMDb-Liste).
 * Welche Listen-Chips es gibt, richtet sich nach der ganzen Sammlung (damit
 * sie beim Tippen in der Suche nicht auftauchen/verschwinden); die Zahlen
 * nach der bereits durchsuchten Teilmenge.
 * @param {Array} allMovies - komplette Sammlung.
 * @param {Array} searched - Sammlung nach Suchbegriff, vor den Filtern.
 * @param {{media: string[], seen: string[], lists: string[]}} filters
 * @param {{include?: Set<string>}} [options] - welche wahlweisen Angaben die
 *   Datendatei enthält; ohne „medium" bzw. „seen" entfallen diese Gruppen.
 * @returns {string} Leer, solange es nichts zu filtern gibt.
 */
export function filterChipsHtml(allMovies, searched, filters, { include = new Set(["medium", "seen", "lists"]) } = {}) {
  const counts = facetCounts(searched, filters);
  const listOptions = listFilterOptions(allMovies).map(name => ({ value: name, label: name }));
  const groups = [
    groupHtml("Art", "kind", KIND_FILTER_OPTIONS, filters, counts),
    include.has("medium") ? groupHtml("Medium", "media", MEDIA_FILTER_OPTIONS, filters, counts) : "",
    include.has("seen") ? groupHtml("Status", "seen", SEEN_FILTER_OPTIONS, filters, counts) : "",
    groupHtml("Liste", "lists", listOptions, filters, counts),
  ].join("");
  if (!groups) return "";
  const reset = hasActiveFilters(filters)
    ? `<button type="button" class="filter-reset" id="filter-reset">Filter zurücksetzen</button>`
    : "";
  return groups + reset;
}
