import { matchRank } from "./suggest-logic.js";

/*
 * Seite Lesezeichen (2.46): Chrome-Ordner werden zu Gruppen, eine Suche mit
 * Vorschlägen findet Seiten, und auf Wunsch stehen oft genutzte vorn.
 * Reine Rechnung auf dem Chrome-Baum, getestet in
 * tests/bookmark-groups.test.mjs; Darstellung und Bearbeiten in
 * js/views/bookmarks-view.js und js/ui/bookmark-menu.js.
 */

const usable = node => node.url && !/^javascript:/i.test(node.url);

/**
 * Gruppen aus dem Chrome-Baum: jeder Ordner mit eigenen Lesezeichen wird eine
 * Gruppe (verschachtelte Ordner mit Pfad „Film › Serien"), in Chrome-Reihenfolge.
 * Die obersten Behälter (Lesezeichenleiste, Weitere Lesezeichen) zählen mit,
 * erscheinen aber ohne Pfad-Vorsatz.
 * @param {Array} tree - Ergebnis von chrome.bookmarks.getTree()
 * @returns {Array<{id: string, title: string, path: string[], items: Array<{id, title, url, parentId, index, folder}>}>}
 */
export function bookmarkGroups(tree) {
  const groups = [];
  const walk = (node, path) => {
    const items = (node.children || []).filter(usable).map(child => ({
      id: child.id, title: child.title || child.url, url: child.url, parentId: node.id, index: child.index ?? 0, folder: node.title || "",
    }));
    if (items.length) groups.push({ id: node.id, title: node.title || "Lesezeichen", path, items });
    for (const child of node.children || []) {
      if (!child.url) walk(child, node.title ? [...path, node.title] : path);
    }
  };
  for (const root of tree || []) walk(root, []);
  return groups;
}

/** Alle Ordner zum Verschieben, mit lesbarem Pfad („Leiste › Film"). */
export function folderOptions(tree) {
  const out = [];
  const walk = (node, path) => {
    for (const child of node.children || []) {
      if (child.url) continue;
      const label = [...path, child.title || "Ordner"];
      out.push({ id: child.id, label: label.join(" › ") });
      walk(child, label);
    }
  };
  for (const root of tree || []) walk(root, []);
  return out;
}

/** Name der Seite ohne „www." für Suche und Anzeige. */
export const hostOf = url => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};

/**
 * Vorschläge für die Suche: Titel zählt vor Adresse, Anfang vor Wortanfang
 * vor „steckt drin"; bei Gleichstand die öfter genutzte Seite.
 * @param {Array<{id, title, url}>} items
 * @param {string} query
 * @param {{usage?: object, limit?: number}} [options]
 */
export function searchBookmarks(items, query, { usage = {}, limit = 8 } = {}) {
  if (String(query || "").trim().length < 1) return [];
  return items
    .map(item => ({ item, rank: Math.max(matchRank(item.title, query) * 2, matchRank(hostOf(item.url), query) * 2 - 1, matchRank(item.url, query) > 0 ? 1 : 0) }))
    .filter(hit => hit.rank > 0)
    .sort((a, b) => b.rank - a.rank || (usage[b.item.id]?.count || 0) - (usage[a.item.id]?.count || 0) || a.item.title.localeCompare(b.item.title, "de"))
    .slice(0, limit)
    .map(hit => hit.item);
}

/** Einmal geöffnet: Zähler und Zeitpunkt (höchstens 500 Einträge, älteste fallen raus). */
export function recordOpen(usage, id, now = Date.now()) {
  const next = { ...(usage || {}), [id]: { count: ((usage || {})[id]?.count || 0) + 1, last: now } };
  const ids = Object.keys(next);
  if (ids.length > 500) {
    ids.sort((a, b) => next[a].last - next[b].last).slice(0, ids.length - 500).forEach(old => delete next[old]);
  }
  return next;
}

export const BOOKMARK_SORT_OPTIONS = [
  { value: "own", label: "Eigene Reihenfolge (wie in Chrome)" },
  { value: "used", label: "Oft genutzt zuerst" },
];

/** Reihenfolge innerhalb einer Gruppe: wie in Chrome oder oft genutzte vorn. */
export function sortGroupItems(items, sort, usage = {}) {
  if (sort !== "used") return items;
  return [...items].sort((a, b) => (usage[b.id]?.count || 0) - (usage[a.id]?.count || 0) || a.index - b.index);
}
