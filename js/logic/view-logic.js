/*
 * Gemerkte Ansicht unter Entertainment (gespeichert als `entertainmentView`
 * in chrome.storage.local, nur auf diesem Rechner - nicht in Sicherungen):
 * offene Registerkarte und die Ansicht von Zeitleiste und Filmuniversum. Suche und Filter bleiben bewusst nur für die
 * Sitzung (beim nächsten Öffnen ist die Sammlung wieder ungefiltert).
 * Getestet in tests/view.test.mjs.
 *
 * Website (js/site/site-data.js): dort merkt sich die Ansicht für die Dauer
 * des Besuchs zusätzlich Suche, Filter und Sortierung (`browse`), damit man
 * nach einer Detailseite dort weitermacht, wo man war.
 */
import { emptyFilters } from "./movies-logic.js";

export const VIEW_TABS = ["titles", "timeline", "universe", "stats", "year", "duel"];
/** Früher eigene Registerkarten, heute im Filmuniversum (2.38). */
const MERGED_TABS = { constellation: "universe", cast: "universe" };
const TIMELINE = ["release", "rated"];
const UNIVERSE = ["rated", "all"];

/**
 * Liest einen gespeicherten Wert; alles Unbekannte oder Kaputte fällt weg.
 * Ältere Werte („constellation", „cast", constellationMode) führen ins
 * Filmuniversum.
 * @param {*} value
 * @returns {{tab?: string, timelineMode?: string, universeMode?: string,
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
  const browse = readBrowse(value.browse);
  if (browse) view.browse = browse;
  return view;
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
  return {
    query: typeof value.query === "string" ? value.query : "",
    filters,
    sortKey: typeof value.sortKey === "string" ? value.sortKey : "",
    sortDirection: value.sortDirection === "asc" ? "asc" : "desc",
  };
}
