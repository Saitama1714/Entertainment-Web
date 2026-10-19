import { CONFIG } from "../utils/constants.js";

/**
 * Filtert die angehefteten Lesezeichen aus der vollständigen Liste,
 * in der gespeicherten Reihenfolge, maximal MAX_PINNED_BOOKMARKS Stück.
 * @param {Array<{id:string}>} allBookmarks
 * @param {string[]} pinnedIds
 * @returns {Array} Liste der angehefteten Bookmark-Objekte.
 */
export function getPinnedBookmarks(allBookmarks, pinnedIds) {
  const map = new Map(allBookmarks.map(bookmark => [bookmark.id, bookmark]));
  return pinnedIds.map(id => map.get(id)).filter(Boolean).slice(0, CONFIG.MAX_PINNED_BOOKMARKS);
}

/**
 * Entfernt IDs aus pinnedIds, die es in allBookmarks nicht mehr gibt
 * (z. B. weil das Lesezeichen in Chrome gelöscht wurde).
 * @param {Array<{id:string}>} allBookmarks
 * @param {string[]} pinnedIds
 * @returns {string[]} Bereinigte Liste.
 */
export function pruneDeletedPins(allBookmarks, pinnedIds) {
  const validIds = new Set(allBookmarks.map(bookmark => bookmark.id));
  return pinnedIds.filter(id => validIds.has(id));
}

/**
 * Berechnet den neuen Pinned-Status beim Toggle eines Lesezeichens.
 * Gibt null zurück, wenn das Limit erreicht ist und nichts geändert werden darf.
 * @param {string[]} pinnedIds
 * @param {string} id
 * @returns {string[]|null}
 */
export function togglePin(pinnedIds, id) {
  const isPinned = pinnedIds.includes(id);
  if (!isPinned && pinnedIds.length >= CONFIG.MAX_PINNED_BOOKMARKS) return null;
  return isPinned ? pinnedIds.filter(item => item !== id) : [...pinnedIds, id];
}

/**
 * Ordnet pinnedIds nach einer vorgegebenen Reihenfolge neu an (z. B. nach dem
 * Ziehen einer Kachel: orderedIds ist die Reihenfolge der Kacheln im DOM
 * danach). IDs, die in orderedIds fehlen - sollte nicht vorkommen -, bleiben
 * in ihrer bisherigen Reihenfolge am Ende erhalten, statt zu verschwinden.
 * @param {string[]} pinnedIds
 * @param {string[]} orderedIds
 * @returns {string[]}
 */
export function reorderPinned(pinnedIds, orderedIds) {
  const known = new Set(orderedIds);
  const rest = pinnedIds.filter(id => !known.has(id));
  return [...orderedIds.filter(id => pinnedIds.includes(id)), ...rest];
}

/**
 * Verschiebt eine Favoriten-ID um `delta` Positionen (z. B. -1/+1 für
 * Tastatur-Bedienung: Pfeiltaste links/rechts während des Sortiermodus).
 * Am Rand der Liste passiert einfach nichts.
 * @param {string[]} pinnedIds
 * @param {string} id
 * @param {number} delta
 * @returns {string[]}
 */
export function movePinnedBy(pinnedIds, id, delta) {
  const from = pinnedIds.indexOf(id);
  if (from === -1) return pinnedIds;
  const to = Math.max(0, Math.min(from + delta, pinnedIds.length - 1));
  if (to === from) return pinnedIds;
  const next = pinnedIds.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
