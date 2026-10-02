import { escapeHtml } from "../utils/dom.js";
import {
  KIND_FILTER_OPTIONS, MEDIA_FILTER_OPTIONS, SEEN_FILTER_OPTIONS, listFilterOptions, genreFilterOptions,
  facetCounts, hasActiveFilters,
} from "../logic/movies-logic.js";

/*
 * Markup der Filter-Chips unter Entertainment (auch auf der Website
 * Entertainment-Web genutzt). Reines Rendering: welche Titel ein Filter
 * trifft und wie gezählt wird, steht in movies-logic.js.
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
 * Baut die komplette Chip-Leiste (Art, Genre, Medium, Status, IMDb-Liste).
 * Welche Genre- und Listen-Chips es gibt, richtet sich nach der ganzen Sammlung (damit
 * sie beim Tippen in der Suche nicht auftauchen/verschwinden); die Zahlen
 * nach der bereits durchsuchten Teilmenge.
 * @param {Array} allMovies - komplette Sammlung.
 * @param {Array} searched - Sammlung nach Suchbegriff, vor den Filtern.
 * @param {{kind: string[], genres: string[], media: string[], seen: string[], lists: string[]}} filters
 * @param {{hide?: string[]}} [options] - Gruppen, die entfallen (z. B. auf der
 *   Website, wenn Medium oder Gesehen-Status nicht veröffentlicht sind).
 * @returns {string} Leer, solange es nichts zu filtern gibt.
 */
export function filterChipsHtml(allMovies, searched, filters, { hide = [] } = {}) {
  const counts = facetCounts(searched, filters);
  const listOptions = listFilterOptions(allMovies).map(name => ({ value: name, label: name }));
  const genreOptions = genreFilterOptions(allMovies).map(name => ({ value: name, label: name }));
  const groups = [
    ["Art", "kind", KIND_FILTER_OPTIONS],
    ["Genre", "genres", genreOptions],
    ["Medium", "media", MEDIA_FILTER_OPTIONS],
    ["Status", "seen", SEEN_FILTER_OPTIONS],
    ["Liste", "lists", listOptions],
  ].filter(([, category]) => !hide.includes(category))
    .map(([label, category, options]) => groupHtml(label, category, options, filters, counts))
    .join("");
  if (!groups) return "";
  const reset = hasActiveFilters(filters)
    ? `<button type="button" class="filter-reset" id="filter-reset">Filter zurücksetzen</button>`
    : "";
  return groups + reset;
}
