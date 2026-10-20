/*
 * „Du gegen IMDb" (Registerkarte unter Entertainment): eigene Note gegen
 * IMDb-Wertung - wie einig, wo deutlich anders, in welchen Genres milder
 * oder strenger als sonst. Dazu die Anordnung der Punkte als Schwarm (je
 * Note eine Säule, nach IMDb-Wertung aufgefächert). Reine Funktionen,
 * getestet in tests/duel.test.mjs; Oberfläche in js/ui/duel.js.
 */
import { genresOf } from "./movies-logic.js";
import { ownScore } from "./detail-logic.js";

/** Schwelle für „Geheimtipps" und „Unterschätzt": 0,5 bis 3 in halben Punkten. */
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 3;
export const THRESHOLD_STEP = 0.5;
export const DEFAULT_THRESHOLD = 1.5;
/** Bis hierhin gilt eine Note als „einig" mit IMDb. */
export const AGREE = 0.5;

/** Gespeicherten Wert lesen: auf halbe Punkte gerundet, im Bereich, sonst 1,5. */
export function readThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || value === null || value === "") return DEFAULT_THRESHOLD;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, Math.round(n / THRESHOLD_STEP) * THRESHOLD_STEP));
}

const num = value => {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const votesOf = movie => Number(String(movie.numVotes ?? "").replace(/[^\d]/g, "")) || 0;

/**
 * Titel mit eigener Note (1–10) und IMDb-Wertung.
 * @returns {Array<{movie: object, you: number, imdb: number, diff: number}>} diff auf eine Stelle gerundet
 */
export function duelEntries(movies) {
  const out = [];
  for (const movie of movies) {
    const you = ownScore(movie);
    const imdb = num(movie.imdbRating);
    if (you === null || imdb === null || imdb <= 0) continue;
    out.push({ movie, you, imdb, diff: Math.round((you - imdb) * 10) / 10 });
  }
  return out;
}

/** Einordnung eines Abstands: "high" (≥ Schwelle), "up", "same" (± AGREE), "down", "low". */
export function tone(diff, threshold = DEFAULT_THRESHOLD) {
  if (diff >= threshold) return "high";
  if (diff <= -threshold) return "low";
  if (diff > AGREE) return "up";
  if (diff < -AGREE) return "down";
  return "same";
}

/**
 * Wie einig mit der Welt?
 * @returns {{count, higher, same, lower, sameShare, mean, meanAbs, critic: "mild"|"strict"|"fair"|null}}
 */
export function duelSummary(entries) {
  const count = entries.length;
  const higher = entries.filter(e => e.diff > AGREE).length;
  const lower = entries.filter(e => e.diff < -AGREE).length;
  const same = count - higher - lower;
  const mean = count ? entries.reduce((s, e) => s + e.diff, 0) / count : 0;
  const meanAbs = count ? entries.reduce((s, e) => s + Math.abs(e.diff), 0) / count : 0;
  const critic = count < 5 ? null : mean > 0.2 ? "mild" : mean < -0.2 ? "strict" : "fair";
  return { count, higher, same, lower, sameShare: count ? same / count : 0, mean, meanAbs, critic };
}

/**
 * Die beiden Listen: deutlich über IMDb (größter Abstand zuerst) und
 * deutlich darunter. Bei gleichem Abstand: bekanntere Titel zuerst.
 */
export function duelLists(entries, threshold = DEFAULT_THRESHOLD) {
  const order = (a, b) => votesOf(b.movie) - votesOf(a.movie) || String(a.movie.title).localeCompare(String(b.movie.title), "de");
  return {
    tips: entries.filter(e => e.diff >= threshold).sort((a, b) => b.diff - a.diff || order(a, b)),
    low: entries.filter(e => e.diff <= -threshold).sort((a, b) => a.diff - b.diff || order(a, b)),
  };
}

/**
 * Genres gemessen am eigenen Schnitt: Ø Abstand zu IMDb im Genre minus
 * Ø Abstand insgesamt (> 0 = hier milder als sonst). Nur Genres mit
 * genug Titeln (ab 15, bei kleiner Auswahl ab 5).
 * @returns {{mean: number, min: number, list: Array<{name, count, bias}>}} milder zuerst
 */
export function genreBias(entries) {
  const mean = entries.length ? entries.reduce((s, e) => s + e.diff, 0) / entries.length : 0;
  const min = entries.length >= 200 ? 15 : 5;
  const groups = new Map();
  for (const e of entries) for (const name of genresOf(e.movie)) {
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(e.diff);
  }
  const list = [...groups].filter(([, diffs]) => diffs.length >= min)
    .map(([name, diffs]) => ({ name, count: diffs.length, bias: Math.round((diffs.reduce((s, d) => s + d, 0) / diffs.length - mean) * 100) / 100 }))
    .sort((a, b) => b.bias - a.bias || b.count - a.count || a.name.localeCompare(b.name, "de"));
  return { mean, min, list };
}

/*
 * Schwarm: je Note (1–10) eine Säule; senkrecht die IMDb-Wertung. Punkte,
 * die sich überdecken würden, weichen abwechselnd nach links und rechts aus
 * (Abstand `gap`). Passt einer nicht mehr in die Säule, landet er an einer
 * festen, aus der Kennung abgeleiteten Stelle in der Säule (überlappt dann
 * leicht, aber gleichmäßig verteilt statt als Wand am Rand). Koordinaten im
 * Diagramm-Raster.
 */
export const CHART = { width: 760, height: 470, left: 46, top: 14, right: 14, bottom: 40, imdbMin: 1, imdbMax: 10.2 };

/** Feste Zahl 0–1 je Kennung (FNV-1a) - gleiche Daten, gleiches Bild. */
const spread = id => {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
};

/** x-Mitte der Säule einer Note und y einer IMDb-Wertung. */
export function chartScales(chart = CHART) {
  const w = chart.width - chart.left - chart.right;
  const h = chart.height - chart.top - chart.bottom;
  return {
    x: note => chart.left + (note - 0.5) / 10 * w,
    y: imdb => chart.top + h - (Math.min(chart.imdbMax, Math.max(chart.imdbMin, imdb)) - chart.imdbMin) / (chart.imdbMax - chart.imdbMin) * h,
    column: w / 10,
  };
}

/**
 * Lage aller Punkte.
 * @param {Array} entries - aus duelEntries
 * @param {{gapX?: number, gapY?: number, chart?: object}} [options]
 * @returns {Array<{entry, x: number, y: number}>} in der Reihenfolge der Säulen
 */
export function swarmLayout(entries, { gapX = 4.4, gapY = 4.4, chart = CHART } = {}) {
  const { x: xOf, y: yOf, column } = chartScales(chart);
  const half = column / 2 - 3;
  const out = [];
  for (let note = 1; note <= 10; note++) {
    const cx = xOf(note);
    const items = entries.filter(e => e.you === note)
      .sort((a, b) => b.imdb - a.imdb || String(a.movie.id).localeCompare(String(b.movie.id)));
    const placed = [];
    for (const entry of items) {
      const y = yOf(entry.imdb);
      // nur Nachbarn in Reichweite prüfen (nach y sortiert)
      const near = [];
      for (let i = placed.length - 1; i >= 0 && Math.abs(placed[i].y - y) < gapY; i--) near.push(placed[i].x);
      let x = cx;
      for (let k = 0; ; k++) {
        const offset = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gapX;
        if (Math.abs(offset) > half) { x = cx + (spread(entry.movie.id) * 2 - 1) * half; break; }
        x = cx + offset;
        if (!near.some(px => Math.abs(px - x) < gapX - 0.01)) break;
      }
      placed.push({ entry, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
    out.push(...placed);
  }
  return out;
}
