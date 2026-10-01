/*
 * Logo-Medaillon oben links (js/ui/brand-medallion.js): ab wann es beim
 * Scrollen auf die kleine Größe in der Kopfleiste schrumpft.
 *
 * Zwei Schwellen (Hysterese), damit es an der Grenze nicht hin und her
 * springt, wenn man nur ein paar Pixel scrollt oder das Mausrad nachfedert.
 */

/** Ab dieser Scroll-Tiefe (px) wird das Medaillon klein. */
export const SHRINK_AT = 48;
/** Erst unterhalb dieser Scroll-Tiefe (px) wird es wieder groß. */
export const GROW_BELOW = 16;

/**
 * Neuer Zustand des Medaillons.
 * @param {number} scrollY - Aktuelle Scroll-Tiefe der Seite.
 * @param {boolean} compact - Ist es gerade klein?
 * @returns {boolean} true = klein (in der Leiste), false = groß (hängt über die Leiste).
 */
export function isCompact(scrollY, compact) {
  const y = Number.isFinite(scrollY) ? scrollY : 0;
  return compact ? y >= GROW_BELOW : y > SHRINK_AT;
}
