/**
 * Kleine, wiederverwendbare DOM-Helfer.
 */

/** Kurzform für querySelector, gescoped auf einen optionalen Wurzelknoten. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Kurzform für querySelectorAll als echtes Array. */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Escaped HTML-Sonderzeichen, um XSS bei String-Konkatenation zu verhindern.
 * @param {*} value - Beliebiger Wert, wird zu String konvertiert.
 * @returns {string} Sicherer HTML-String.
 */
export const escapeHtml = value =>
  String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[char]));

/**
 * Lässt nur Web-Adressen (http/https) als Link-Ziel durch. Schützt davor, dass
 * über eine manipulierte Sicherung oder einen Import z. B. "javascript:"-Links
 * im Dashboard landen. Alles andere wird zu "#".
 * @param {string} url
 * @returns {string}
 */
export function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "#";
  } catch {
    return "#";
  }
}

/** Markup für einen Leerzustand - formuliert als Einladung, nicht als Fehler. */
export const emptyState = text => `<div class="empty-state"><p>${escapeHtml(text)}</p></div>`;

/**
 * Verzögert Funktionsaufrufe, bis für `ms` Millisekunden keine neuen kamen.
 * Wird für die Suche genutzt, damit nicht bei jedem Tastendruck neu gerendert wird.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function} Die verzögerte Funktion.
 */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
