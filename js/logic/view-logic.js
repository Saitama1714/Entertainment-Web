/*
 * Gemerkte Ansicht unter Entertainment (gespeichert als `entertainmentView`
 * in chrome.storage.local, nur auf diesem Rechner - nicht in Sicherungen):
 * offene Registerkarte, die Ansicht von Zeitleiste und Filmuniversum sowie
 * Ziel und Mindestnote im Reiter „Upgrade". Suche und Filter bleiben bewusst nur für die
 * Sitzung (beim nächsten Öffnen ist die Sammlung wieder ungefiltert).
 * Getestet in tests/view.test.mjs.
 *
 * Website (js/site/site-data.js): dort merkt sich die Ansicht für die Dauer
 * des Besuchs zusätzlich Suche, Filter und Sortierung (`browse`), damit man
 * nach einer Detailseite dort weitermacht, wo man war.
 */
import { emptyFilters } from "./movies-logic.js";
import { readRanges } from "./range-filter-logic.js";

export const VIEW_TABS = ["titles", "timeline", "universe", "stats", "year", "duel", "upgrade"];
/** Früher eigene Registerkarten, heute im Filmuniversum (2.38). */
const MERGED_TABS = { constellation: "universe", cast: "universe" };
const TIMELINE = ["release", "rated"];
const UNIVERSE = ["rated", "all"];

/**
 * Liest einen gespeicherten Wert; alles Unbekannte oder Kaputte fällt weg.
 * Ältere Werte („constellation", „cast", constellationMode) führen ins
 * Filmuniversum.
 * @param {*} value
 * @returns {{tab?: string, timelineMode?: string, universeMode?: string, upgradeTarget?: string, upgradeMin?: number,
 *   browse?: {query: string, filters: object, sortKey: string, sortDirection: string}}}
 */
export function readEntertainmentView(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const view = {};
  const tab = MERGED_TABS[value.tab] || value.tab;
  if (VIEW_TABS.includes(tab)) view.tab = tab;
  if (TIMELINE.includes(value.timelineMode)) view.timelineMode = value.timelineMode;
  const universeMode = value.universeMode ?? value.constellationMode;
  if (UNIVERSE.includes(universeMode)) view.universeMode = universeMode;
  if (["4k", "bd"].includes(value.upgradeTarget)) view.upgradeTarget = value.upgradeTarget;
  if ([7, 8, 9].includes(value.upgradeMin)) view.upgradeMin = value.upgradeMin;
  const browse = readBrowse(value.browse);
  if (browse) view.browse = browse;
  return view;
}

/**
 * Reiter aus der Adresse (?view=…, z. B. aus der Spule im Foyer); unbekannte
 * Werte und ältere Namen wie bei readEntertainmentView.
 * @param {string} search - location.search
 * @returns {string} Reitername oder ""
 */
export function tabFromUrl(search) {
  const value = new URLSearchParams(search || "").get("view") || "";
  const tab = MERGED_TABS[value] || value;
  return VIEW_TABS.includes(tab) ? tab : "";
}

/** Suche, Filter und Sortierung der Website (nur bekannte Werte). */
function readBrowse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const filters = emptyFilters();
  for (const key of Object.keys(filters)) {
    const saved = value.filters?.[key];
    if (Array.isArray(filters[key]) && Array.isArray(saved)) filters[key] = saved.map(String);
    else if (typeof filters[key] === "string" && typeof saved === "string") filters[key] = saved;
  }
  filters.ranges = readRanges(value.filters?.ranges);
  return {
    query: typeof value.query === "string" ? value.query : "",
    filters,
    sortKey: typeof value.sortKey === "string" ? value.sortKey : "",
    sortDirection: value.sortDirection === "asc" ? "asc" : "desc",
  };
}

/*
 * Wischen zwischen den Reitern (2.43, nur Touch): Reiter, in denen man
 * nicht schon selbst wischt oder zieht - und die Schwellen einer Wischgeste.
 */
export const SWIPE_TABS = ["titles", "stats", "upgrade"];
export const SWIPE_MIN_X = 70;
export const SWIPE_MAX_Y = 40;
export const SWIPE_MAX_MS = 700;

/**
 * Richtung einer Wischgeste: 1 = zum nächsten Reiter (nach links gewischt),
 * -1 = zum vorigen, 0 = keine Wischgeste (zu kurz, zu schräg, zu langsam).
 * @param {{dx: number, dy: number, ms: number}} gesture
 */
export function swipeStep({ dx, dy, ms }) {
  if (!(Math.abs(dx) >= SWIPE_MIN_X) || Math.abs(dy) >= SWIPE_MAX_Y || ms > SWIPE_MAX_MS) return 0;
  return dx < 0 ? 1 : -1;
}
