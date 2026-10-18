import { titleKind, genresOf } from "./movies-logic.js";
import { MEDIA_TYPES } from "../utils/media.js";

/*
 * Registerkarte „Heute" („Was schaue ich heute?"): aus welchen Titeln gezogen
 * wird und welche Eingrenzungen es gibt. Reine Funktionen, getestet in
 * tests/tonight.test.mjs. Die Auswahl gilt nur für die laufende Sitzung.
 */

/** Schieberegler „Höchstens so lang": Schritte in Minuten; ganz rechts = egal. */
export const RUNTIME_MIN = 60;
export const RUNTIME_STEP = 10;
export const RUNTIME_MAX = 240; // ganz rechts: keine Grenze

/** Laufzeit in Minuten oder null. */
export function runtimeOf(movie) {
  const value = Number(String(movie.runtimeMinutes || "").match(/\d+/)?.[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** „1 Std. 45 Min." / „45 Min." */
export function runtimeLabel(minutes) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} Std.${m ? ` ${m} Min.` : ""}` : `${m} Min.`;
}

/** Text zum Schieberegler: „Höchstens 2 Std." oder „Egal wie lang". */
export const runtimeLimitLabel = max => (max >= RUNTIME_MAX ? "Egal wie lang" : `Höchstens ${runtimeLabel(max)}`);

export const emptyTonight = () => ({ unseenOnly: true, maxMinutes: RUNTIME_MAX, kind: "", media: [], genre: "" });

/** Grundmenge: ungesehene Titel (oder alle, wenn „Nur ungesehene" aus ist). */
const baseOf = (movies, unseenOnly) => (unseenOnly ? movies.filter(movie => !movie.seen) : movies);

/**
 * Titel, die zu den Eingrenzungen passen (Medien: eines der gewählten). Mit Laufzeit-Grenze fallen Titel
 * ohne bekannte Laufzeit weg.
 * @param {Array} movies
 * @param {ReturnType<typeof emptyTonight>} options
 */
export function tonightPool(movies, { unseenOnly = true, maxMinutes = RUNTIME_MAX, kind = "", media = [], genre = "" } = {}) {
  const mediaSet = new Set(media); // mehrere Medien: ODER
  return baseOf(movies, unseenOnly).filter(movie => {
    if (maxMinutes < RUNTIME_MAX) { const r = runtimeOf(movie); if (r === null || r > maxMinutes) return false; }
    if (kind && titleKind(movie) !== kind) return false;
    if (mediaSet.size && !mediaSet.has(movie.medium)) return false;
    if (genre && !genresOf(movie).includes(genre)) return false;
    return true;
  });
}

/**
 * Was sich auswählen lässt - aus der Grundmenge (ungesehene bzw. alle):
 * Genres mit Anzahl (häufigste zuerst), Medien in fester Reihenfolge, Arten.
 * @returns {{genres: Array<{name: string, n: number}>, media: string[], kinds: string[]}}
 */
export function tonightChoices(movies, { unseenOnly = true } = {}) {
  const base = baseOf(movies, unseenOnly);
  const tally = new Map();
  for (const movie of base) for (const name of genresOf(movie)) tally.set(name, (tally.get(name) || 0) + 1);
  const genres = [...tally].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
  const mediaSet = new Set(base.map(movie => movie.medium).filter(Boolean));
  const media = MEDIA_TYPES.filter(type => mediaSet.has(type));
  const kindSet = new Set(base.map(titleKind));
  const kinds = ["film", "series"].filter(kind => kindSet.has(kind));
  return { genres, media, kinds };
}

/** Passen weniger Titel als so viele, füllen die übrigen ungesehenen den Roulette-Streifen auf. */
export const REEL_MIN_POOL = 30;

const hasCover = movie => typeof movie.cover === "string" && movie.cover.trim() !== "";

/**
 * Kulisse für das Cover-Roulette: die passenden Titel; passen weniger als
 * REEL_MIN_POOL, dazu alle übrigen der Grundmenge (ungesehene - bzw. alle,
 * wenn „Nur ungesehene" aus ist). Gesehene erscheinen also nie, solange
 * „Nur ungesehene" an ist. Titel mit Cover zuerst - nur wenn es davon zu
 * wenige gibt, auch Ersatzplakate.
 * @param {Array} movies
 * @param {Array} pool - passende Titel (tonightPool)
 * @param {{unseenOnly?: boolean}} [options]
 * @returns {Array}
 */
export function reelCandidates(movies, pool, { unseenOnly = true } = {}) {
  let base = pool;
  if (pool.length < REEL_MIN_POOL) {
    const ids = new Set(pool.map(movie => movie.id));
    base = [...pool, ...baseOf(movies, unseenOnly).filter(movie => !ids.has(movie.id))];
  }
  const covered = base.filter(hasCover);
  return covered.length >= 6 ? covered : base;
}

/** Gleicher Film = gleiche IMDb-Kennung, sonst gleicher Titel + Jahr. */
const filmKey = movie => String(movie.imdbId || "").trim() || `${String(movie.title || "").trim().toLocaleLowerCase("de")}|${movie.year || ""}`;

/**
 * Reihenfolge im Roulette-Streifen: jeder Film höchstens einmal, der
 * gezogene an Platz `target` (bei wenig Auswahl früher - der Streifen wird
 * dann kürzer, statt Cover zu wiederholen).
 * @param {object} pick
 * @param {Array} candidates - Kulisse (reelCandidates)
 * @param {{length?: number, target?: number, rng?: () => number}} [options]
 * @returns {{items: Array, target: number}}
 */
export function reelSequence(pick, candidates, { length = 32, target = 29, rng = Math.random } = {}) {
  const seen = new Set([filmKey(pick)]);
  const unique = [];
  for (const movie of candidates) {
    const key = filmKey(movie);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(movie);
  }
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  const others = unique.slice(0, length - 1);
  const at = Math.min(target, others.length);
  return { items: [...others.slice(0, at), pick, ...others.slice(at)], target: at };
}

/**
 * Zieht einen Hauptvorschlag und bis zu zwei Alternativen (alle verschieden).
 * Meidet, wenn möglich, den zuletzt gezogenen Hauptvorschlag.
 * @param {Array} pool
 * @param {{avoid?: string, rng?: () => number}} [options]
 * @returns {{pick: object|null, alts: Array}}
 */
export function drawTonight(pool, { avoid = "", rng = Math.random } = {}) {
  if (!pool.length) return { pick: null, alts: [] };
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.length > 1 && shuffled[0].id === avoid) shuffled.push(shuffled.shift());
  return { pick: shuffled[0], alts: shuffled.slice(1, 3) };
}
