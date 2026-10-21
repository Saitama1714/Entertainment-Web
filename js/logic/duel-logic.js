/*
 * „Du gegen IMDb" – „Das Duell" (Registerkarte unter Entertainment): eigene
 * Note gegen IMDb-Wertung - wie einig, wo deutlich anders, in welchen Genres
 * milder oder strenger als sonst, die Kampfwerte je Bereich und die Lage
 * der Titel im Feld (Abstand als Achse). Reine Funktionen, getestet in
 * tests/duel.test.mjs; Oberfläche in js/ui/duel.js.
 */
import { genresOf, titleKind } from "./movies-logic.js";
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

/* ------------------------------------------------------------ Das Feld */

/** Ein Abstand je Spalte im Feld (0,1 Punkte). */
export const FIELD_STEP = 0.1;

/** Ausschnitt der Abstandsachse: mindestens −2 bis +2, ganze Punkte, etwas Luft. */
export function fieldDomain(entries) {
  const diffs = entries.map(e => e.diff);
  const min = diffs.length ? Math.min(...diffs) : 0, max = diffs.length ? Math.max(...diffs) : 0;
  return { lo: Math.min(-2, Math.floor(min - 0.15)), hi: Math.max(2, Math.ceil(max + 0.15)) };
}

/*
 * Lage im Feld: waagerecht der Abstand (links die Welt höher, rechts du),
 * Titel mit gleichem Abstand stapeln sich von der Mittellinie aus - die
 * bekanntesten (meiste Stimmen) innen. Jede Zelle hat Platz für ein Cover
 * (2:3), Punkte sitzen in ihrer Mitte. Bei breiten Spalten zwei Titel
 * nebeneinander, sonst einer. Koordinaten in Pixeln, y relativ zur Mitte.
 */
export function fieldLayout(entries, { width = 1000, minCell = 12 } = {}) {
  const { lo, hi } = fieldDomain(entries);
  const bins = Math.max(1, Math.round((hi - lo) / FIELD_STEP));
  const binW = width / bins;
  const cols = binW >= minCell ? 2 : 1;
  const cellW = binW / cols;
  const coverW = cellW * 0.86, coverH = coverW * 1.5;
  const cellH = coverH + Math.max(1, cellW * 0.16);
  const xOf = diff => (diff - lo) / (hi - lo) * width;
  const groups = new Map();
  for (const entry of entries) {
    const key = Math.round(entry.diff / FIELD_STEP);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const points = [];
  let maxRows = 0;
  for (const [key, items] of [...groups].sort((a, b) => a[0] - b[0])) {
    items.sort((a, b) => votesOf(b.movie) - votesOf(a.movie) || String(a.movie.id).localeCompare(String(b.movie.id)));
    const rows = Math.ceil(items.length / cols), mid = (rows - 1) / 2;
    maxRows = Math.max(maxRows, rows);
    const order = Array.from({ length: rows }, (_, r) => r).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    const cx = xOf(key * FIELD_STEP);
    items.forEach((entry, k) => {
      const slot = Math.floor(k / cols), col = k % cols;
      const inRow = Math.min(cols, items.length - slot * cols); // unvollständige Reihe mittig
      points.push({ entry, x: Math.round((cx + (col - (inRow - 1) / 2) * cellW) * 10) / 10, y: Math.round((order[slot] - mid) * cellH * 10) / 10 });
    });
  }
  return { lo, hi, width, cols, cellW, cellH, coverW, coverH, maxRows, height: maxRows * cellH, points, xOf };
}

/* ------------------------------------------------------- Die Kampfwerte */

const mean = list => list.reduce((s, v) => s + v, 0) / list.length;
const side = rows => ({ count: rows.length, you: mean(rows.map(e => e.you)), imdb: mean(rows.map(e => e.imdb)) });

/**
 * Kampfwerte: Ø eigene Note und Ø IMDb je Bereich, aus den Daten gewählt -
 * insgesamt, Filme und Serien (wenn es beide gibt), das mildeste und das
 * strengste Jahrzehnt (genug Titel vorausgesetzt) und die eigenen Zehner.
 * @returns {Array<{key: "all"|"films"|"series"|"mild-decade"|"strict-decade"|"tens", count, you, imdb, decade?: number}>}
 */
export function tapeRows(entries) {
  if (!entries.length) return [];
  const rows = [{ key: "all", ...side(entries) }];
  const min = entries.length >= 200 ? 15 : 5;
  const films = entries.filter(e => titleKind(e.movie) === "film"), series = entries.filter(e => titleKind(e.movie) === "series");
  if (films.length >= min && series.length >= min) rows.push({ key: "films", ...side(films) }, { key: "series", ...side(series) });
  const decades = new Map();
  for (const e of entries) {
    const year = Number.parseInt(e.movie.year, 10);
    if (!(year > 1800)) continue;
    const d = Math.floor(year / 10) * 10;
    if (!decades.has(d)) decades.set(d, []);
    decades.get(d).push(e);
  }
  const ranked = [...decades].filter(([, list]) => list.length >= min)
    .map(([decade, list]) => ({ decade, ...side(list), diff: mean(list.map(e => e.diff)) }))
    .sort((a, b) => b.diff - a.diff || b.decade - a.decade);
  if (ranked.length >= 2) {
    const { diff: _a, ...mild } = ranked[0], { diff: _b, ...strict } = ranked[ranked.length - 1];
    rows.push({ key: "mild-decade", ...mild }, { key: "strict-decade", ...strict });
  }
  const tens = entries.filter(e => e.you === 10);
  if (tens.length >= 3) rows.push({ key: "tens", ...side(tens) });
  return rows;
}

/**
 * Was das Plakat erzählt: wie oft auf den Zehntel genau einig (mit dem
 * bekanntesten Beispiel), die wildesten Ausreißer in beide Richtungen, die
 * Zehner, das härteste eigene Urteil und die höchste IMDb-Wertung.
 */
export function duelHighlights(entries) {
  const byVotes = (a, b) => votesOf(b.movie) - votesOf(a.movie) || String(a.movie.title).localeCompare(String(b.movie.title), "de");
  const exact = entries.filter(e => e.diff === 0).sort(byVotes);
  const pick = (cmp) => entries.length ? [...entries].sort((a, b) => cmp(a, b) || byVotes(a, b))[0] : null;
  return {
    exact: exact.length,
    exactExample: exact[0] || null,
    wildest: pick((a, b) => b.diff - a.diff),
    harshest: pick((a, b) => a.diff - b.diff),
    tens: entries.filter(e => e.you === 10).length,
    lowest: entries.length ? Math.min(...entries.map(e => e.you)) : null,
    imdbTop: pick((a, b) => b.imdb - a.imdb),
  };
}

/** Der Stempel: „Der milde Richter" usw. (null bei zu wenig Titeln). */
export const VERDICTS = { mild: "Der milde Richter", strict: "Der strenge Richter", fair: "Der faire Richter" };

/** Auftritt beim Öffnen (Punkte fliegen ein, Ring, Stempel): Standard jede Stunde. */
export const DEFAULT_DUEL_INTRO = "hourly";
