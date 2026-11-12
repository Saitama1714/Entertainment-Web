/*
 * Cover-Stimmung (2.42): aus den Pixeln eines Covers die tragenden Farben
 * bestimmen - für den Lichtschein der Detailseite und das Leuchten beim
 * Darüberfahren im Raster. Reine Rechnung, getestet in tests/ambient.test.mjs;
 * das Bild selbst holt js/ui/ambient.js.
 */

/** RGB (0-255) → HSL (h 0-360, s/l 0-1). */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** HSL → RGB (gerundet, 0-255). */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const part = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(part(h + 1 / 3) * 255), g: Math.round(part(h) * 255), b: Math.round(part(h - 1 / 3) * 255) };
}

const BUCKETS = 18; // je 20° Farbton

/**
 * Tragende Farben eines Covers.
 * @param {ArrayLike<number>} data - RGBA-Pixel (wie ImageData.data), klein skaliert genügt.
 * @returns {{primary: {r:number,g:number,b:number}, secondary: {r:number,g:number,b:number}}|null}
 *   null, wenn das Cover praktisch farblos ist (schwarz-weiß, fast leer).
 */
export function coverPalette(data) {
  const buckets = Array.from({ length: BUCKETS }, () => ({ w: 0, r: 0, g: 0, b: 0, h: 0 }));
  let colorful = 0, total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    total++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 0.2 || l < 0.1 || l > 0.92) continue; // Grau, Schwarz, Weiß tragen keine Stimmung
    colorful++;
    // Kräftige, mittelhelle Farben zählen mehr als blasse oder sehr dunkle
    const weight = (0.35 + s) * (1 - Math.abs(l - 0.5) * 1.2);
    const bucket = buckets[Math.min(BUCKETS - 1, Math.floor(h / (360 / BUCKETS)))];
    bucket.w += weight; bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight; bucket.h += h * weight;
  }
  if (!total || colorful / total < 0.04) return null;
  const ranked = buckets
    .map((bucket, index) => ({ ...bucket, index }))
    .filter(bucket => bucket.w > 0)
    .sort((a, b) => b.w - a.w);
  const mean = bucket => ({ r: Math.round(bucket.r / bucket.w), g: Math.round(bucket.g / bucket.w), b: Math.round(bucket.b / bucket.w) });
  const first = ranked[0];
  // Zweite Farbe: deutlich anderer Farbton (mind. 3 Fächer = 60°) und nennenswert vertreten
  const distance = (a, b) => { const d = Math.abs(a - b); return Math.min(d, BUCKETS - d); };
  const second = ranked.find(bucket => distance(bucket.index, first.index) >= 3 && bucket.w >= first.w * 0.12) || first;
  return { primary: mean(first), secondary: mean(second) };
}

/**
 * Farbe für den Lichtschein: im Farbton des Covers, aber gezähmt, damit
 * Kino-Noir dunkel und edel bleibt (nie grell, nie schmutzig).
 * @param {{r:number,g:number,b:number}} color
 * @param {"dark"|"light"} [theme]
 * @returns {{r:number,g:number,b:number}}
 */
export function glowTone(color, theme = "dark") {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  // 2.42.1: kräftiger (Nutzerwunsch - bunte Cover sollen man auch sehen)
  const sat = Math.min(0.88, Math.max(0.45, s * 1.15));
  const light = theme === "light" ? Math.min(0.64, Math.max(0.52, l)) : Math.min(0.62, Math.max(0.48, l));
  return hslToRgb(h, sat, light);
}

/** "r g b" für CSS (rgb(var(--amb-1) / .4)). */
export const cssTriplet = ({ r, g, b }) => `${r} ${g} ${b}`;

/** Für den Zwischenspeicher: "r,g,b;r,g,b" ↔ Palette. */
export const packPalette = palette => palette ? [palette.primary, palette.secondary].map(({ r, g, b }) => `${r},${g},${b}`).join(";") : "-";
export function unpackPalette(text) {
  if (typeof text !== "string" || text === "-") return null;
  const parts = text.split(";").map(part => part.split(",").map(Number));
  if (parts.length !== 2 || parts.some(p => p.length !== 3 || p.some(v => !Number.isInteger(v) || v < 0 || v > 255))) return null;
  const [[r1, g1, b1], [r2, g2, b2]] = parts;
  return { primary: { r: r1, g: g1, b: b1 }, secondary: { r: r2, g: g2, b: b2 } };
}
