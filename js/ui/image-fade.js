/*
 * Kleine Bilder ohne Aufploppen (2.54): Favicons (Lesezeichen, Suche,
 * Detailseite) erscheinen weich, sobald sie geladen sind - waren sie beim
 * Einsetzen schon da (Cache), sofort ohne Blende. Aussehen: css/page-enter.css
 * (img.favicon / .is-faded-in). Ein MutationObserver je Seite, eingebunden über
 * js/ui/app-shell.js.
 */

const SELECTOR = "img.favicon";

function settle(img) {
  if (img.dataset.fade) return;
  if (img.complete) { img.dataset.fade = "done"; return; } // schon da (auch kaputt): sofort zeigen
  img.dataset.fade = "wait";
  const show = () => { img.dataset.fade = "in"; };
  img.addEventListener("load", show, { once: true });
  img.addEventListener("error", show, { once: true });
}

function scan(node) {
  if (node.nodeType !== 1) return;
  if (node.matches(SELECTOR)) settle(node);
  node.querySelectorAll?.(SELECTOR).forEach(settle);
}

let started = false;

/** Beobachtet die Seite; mehrfacher Aufruf ist harmlos. */
export function initImageFade() {
  if (started || typeof MutationObserver === "undefined") return;
  started = true;
  scan(document.body);
  new MutationObserver(list => {
    for (const record of list) record.addedNodes.forEach(scan);
  }).observe(document.body, { childList: true, subtree: true });
}
