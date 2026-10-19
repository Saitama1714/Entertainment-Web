import { saveDashboardData } from "./storage.js";
import { pruneDeletedPins } from "./logic/bookmarks-logic.js";
import { showToast } from "./utils/toast.js";

/*
 * Zugriff auf die Chrome-Lesezeichen. Die Lesezeichen selbst bleiben immer in
 * Chrome; das Dashboard speichert nur die IDs der angehefteten.
 */

/**
 * Liest alle Lesezeichen (ohne Ordner) aus dem gesamten Chrome-Baum, in
 * Chrome-Reihenfolge. Bookmarklets ("javascript:") werden ausgelassen: Chrome
 * blockiert sie auf Extension-Seiten, ein Klick würde nichts tun.
 * @returns {Promise<Array<{id: string, title: string, url: string}>>}
 */
export async function getAllBookmarks() {
  const roots = await chrome.bookmarks.getTree();
  const items = [];
  const walk = nodes => {
    for (const node of nodes) {
      if (node.url && !/^javascript:/i.test(node.url)) items.push({ id: node.id, title: node.title || node.url, url: node.url });
      if (node.children) walk(node.children);
    }
  };
  walk(roots);
  return items;
}

/**
 * Lädt alle Lesezeichen und entfernt angeheftete IDs, die es in Chrome nicht
 * mehr gibt (gespeichert wird nur, wenn sich etwas geändert hat). Bei einem
 * Fehler gibt es eine Meldung und eine leere Liste statt eines Absturzes.
 * @param {object} state - pinnedBookmarkIds wird ggf. bereinigt.
 * @returns {Promise<Array>} Alle Lesezeichen.
 */
export async function loadBookmarks(state) {
  try {
    const bookmarks = await getAllBookmarks();
    const pruned = pruneDeletedPins(bookmarks, state.pinnedBookmarkIds);
    if (pruned.length !== state.pinnedBookmarkIds.length) {
      state.pinnedBookmarkIds = pruned;
      await saveDashboardData({ pinnedBookmarkIds: pruned });
    }
    return bookmarks;
  } catch (error) {
    console.error("Lesezeichen konnten nicht geladen werden:", error);
    showToast("Chrome-Lesezeichen konnten nicht geladen werden.", "warning");
    return [];
  }
}

/**
 * Chrome-interne Adresse des Favicons zu einer Seite (Berechtigung "favicon").
 * @param {string} pageUrl
 */
export function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}
