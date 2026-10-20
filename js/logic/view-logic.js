/*
 * Gemerkte Ansicht unter Entertainment (gespeichert als `entertainmentView`
 * in chrome.storage.local, nur auf diesem Rechner - nicht in Sicherungen):
 * offene Registerkarte, Ansicht der Zeitleiste und des Sternbilds und der
 * Ausschnitt des Sternbilds. Suche und Filter bleiben bewusst nur für die
 * Sitzung (beim nächsten Öffnen ist die Sammlung wieder ungefiltert).
 * Getestet in tests/view.test.mjs.
 *
 * Website (js/site/site-data.js): dort merkt sich die Ansicht für die Dauer
 * des Besuchs zusätzlich Suche, Filter und Sortierung (`browse`), damit man
 * nach einer Detailseite dort weitermacht, wo man war.
 */
import { emptyFilters } from "./movies-logic.js";

export const VIEW_TABS = ["titles", "timeline", "constellation", "cast", "stats", "year", "duel"];
const TIMELINE = ["release", "rated"];
const CONSTELLATION = ["rated", "all"];

/**
 * Liest einen gespeicherten Wert; alles Unbekannte oder Kaputte fällt weg.
 * @param {*} value
 * @returns {{tab?: string, timelineMode?: string, constellationMode?: string,
 *   camera?: {sig: string, cx: number, cy: number, w: number},
 *   browse?: {query: string, filters: object, sortKey: string, sortDirection: string}}}
 */
export function readEntertainmentView(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const view = {};
  if (VIEW_TABS.includes(value.tab)) view.tab = value.tab;
  if (TIMELINE.includes(value.timelineMode)) view.timelineMode = value.timelineMode;
  if (CONSTELLATION.includes(value.constellationMode)) view.constellationMode = value.constellationMode;
  const cam = value.camera;
  if (cam && typeof cam.sig === "string" && [cam.cx, cam.cy, cam.w].every(Number.isFinite) && cam.w > 0) {
    view.camera = { sig: cam.sig, cx: cam.cx, cy: cam.cy, w: cam.w };
  }
  const browse = readBrowse(value.browse);
  if (browse) view.browse = browse;
  return view;
}

/**
 * Kurzer Fingerabdruck eines Sternbilds: Ein gemerkter Ausschnitt gilt nur,
 * solange die Karte gleich aussieht (gleiche Ansicht, Titel und Sterne).
 * @param {string} mode
 * @param {Array<{id: string}>} items
 * @param {Array<{name: string}>} genres
 */
export function constellationSignature(mode, items, genres) {
  const text = `${mode}|${items.length}|${genres.map(g => g.name).join(",")}|${items.map(i => i.id).join(",")}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${items.length}-${(h >>> 0).toString(36)}`;
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
