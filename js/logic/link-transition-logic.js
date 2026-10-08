/*
 * Klick-Animationen für Links - reine Regeln und Rechnungen, ohne DOM, damit
 * sie sich ohne Browser prüfen lassen (tests/link-transition.test.mjs).
 * Die Darstellung steckt in js/ui/link-transition.js.
 */

export const CLICK_EFFECTS = ["zoom", "off"]; // "off" = keine Animation, sofortige Navigation
export const CLICK_DURATIONS = [250, 450, 800];
export const DEFAULT_CLICK_EFFECT = "zoom";
export const DEFAULT_CLICK_DURATION = 450;

/** Unbekannte Werte (z. B. der frühere Effekt "curtain" aus einer alten Sicherung) fallen auf den Standard zurück. */
export function normalizeClickEffect(value) {
  return CLICK_EFFECTS.includes(value) ? value : DEFAULT_CLICK_EFFECT;
}

export function normalizeClickDuration(value) {
  const number = Number(value);
  return CLICK_DURATIONS.includes(number) ? number : DEFAULT_CLICK_DURATION;
}

/**
 * Wann die Navigation startet (ms nach dem Klick): erst wenn die Animation
 * vollständig abgelaufen ist - auch bei langsamen Seiten (z. B. YouTube), die
 * sonst schon mitten in der Animation übernehmen würden. Danach bleibt das
 * Endbild stehen, bis der Browser die neue Seite zeigt.
 * @param {number} duration - Dauer der Animation in ms.
 */
export function navigationDelay(duration) {
  return Math.round(duration);
}

/**
 * Entscheidet, ob ein Klick auf einen Link mit Effekt navigieren soll.
 * Alles, was der Browser anders behandelt (neuer Tab, Download, Anker auf
 * derselben Seite, fremde Protokolle), bleibt beim Browser-Standard.
 *
 * @param {{button: number, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean,
 *          defaultPrevented?: boolean, href: string|null, target?: string|null, download?: boolean,
 *          optOut?: boolean}} click - Angaben zum Klick und zum Link (href = Attributwert).
 * @param {string} pageHref - Adresse der aktuellen Seite.
 * @returns {{url: string, internal: boolean}|null} null = nichts tun.
 */
export function classifyLinkClick(click, pageHref) {
  if (click.defaultPrevented || click.optOut || click.download) return null;
  if (click.button !== 0) return null;                                   // Mittel-/Rechtsklick
  if (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return null;
  const target = (click.target || "").trim().toLowerCase();
  if (target && target !== "_self") return null;                        // _blank & Co.
  const raw = (click.href || "").trim();
  if (!raw || raw.startsWith("#")) return null;

  let url, page;
  try {
    page = new URL(pageHref);
    url = new URL(raw, page);
  } catch {
    return null;
  }
  // Protokoll + Host statt origin: Erweiterungs-Adressen haben je nach Umgebung
  // nur den Origin "null" - sonst gälte z. B. chrome://settings als "intern".
  const internal = url.protocol === page.protocol && url.host === page.host;
  if (!internal && url.protocol !== "http:" && url.protocol !== "https:") return null; // mailto:, javascript:, chrome:// …
  // Nur ein Sprung innerhalb derselben Seite
  const strip = u => u.href.replace(/#.*$/, "");
  if (internal && url.hash && strip(url) === strip(page)) return null;
  return { url: url.href, internal };
}

/**
 * Ausschnitt (CSS clip-path) für den Kachel-Zoom: startet exakt auf dem
 * angeklickten Element und öffnet sich auf das ganze Fenster.
 * @param {{left: number, top: number, right: number, bottom: number}} rect - getBoundingClientRect().
 * @param {{width: number, height: number}} viewport
 * @param {number} radius - Eckenradius des Elements in px.
 * @returns {{from: string, to: string}}
 */
export function zoomClip(rect, viewport, radius = 0) {
  const px = value => `${Math.max(0, Math.round(value * 10) / 10)}px`;
  const top = Math.min(rect.top, viewport.height);
  const left = Math.min(rect.left, viewport.width);
  const right = Math.min(viewport.width - rect.right, viewport.width - left);
  const bottom = Math.min(viewport.height - rect.bottom, viewport.height - top);
  return {
    from: `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${px(radius)})`,
    to: "inset(0px 0px 0px 0px round 0px)",
  };
}

/** Monogramm für den Zoom: erster Buchstabe bzw. erste Ziffer des Linktexts. */
export function monogramOf(text) {
  const match = String(text || "").match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase("de") : "•";
}
