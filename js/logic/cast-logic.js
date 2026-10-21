/** Eigene Note 1–10 oder null (für die Reihenfolge des Abrufs). */
const ownRating = movie => {
  const n = Number(movie?.yourRating);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};

/*
 * Besetzung der Titel: wer hat Regie geführt, gespielt, das Drehbuch
 * geschrieben? Genutzt von Suche, Detailseite und Filmuniversum
 * (js/logic/universe-logic.js). Reine Rechenlogik ohne DOM (getestet in
 * tests/cast.test.mjs).
 *
 * Datenquellen:
 * - Regie: aus dem IMDb-Export (movie.directors), sonst aus OMDb.
 * - Darsteller und Drehbuch: nur aus OMDb (die ersten drei bis vier
 *   Darsteller je Titel). Gespeichert getrennt von den Titeln unter
 *   `castData` (IMDb-Kennung → {a, w, d, t, v, …}), damit der Abruf im Hintergrund
 *   nie mit dem Speichern der Titel kollidiert (js/cast-fetch.js).
 * - Seit Stand 2 (CAST_VERSION, Dashboard 2.35) bringt derselbe Abruf auch
 *   Angaben für die Detailseite mit: Altersfreigabe (r), Länder (c),
 *   Sprachen (l), Rotten Tomatoes (rt), Metascore (mc), Staffeln (s).
 *   Ältere Einträge werden einmal neu abgefragt.
 */

export const ROLES = ["dir", "act", "wri"];
export const ROLE_LABELS = { dir: "Regie", act: "Darsteller", wri: "Drehbuch" };

const NA = /^n\/a$/i;

/** Einheitlicher Schlüssel für einen Namen (Groß-/Kleinschreibung, Leerzeichen egal). */
export const personKey = name => String(name || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("de");

/**
 * Namen aus einem OMDb-Feld („A, B, C"), ohne Zusätze in Klammern, ohne
 * Doppelte und ohne „N/A".
 * @param {string} text
 * @returns {string[]}
 */
export function splitNames(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(",")) {
    const name = part.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const key = personKey(name);
    if (!name || NA.test(name) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/*
 * Drehbuch: OMDb nennt auch Vorlagen („Bob Kane (characters)", „Stephen King
 * (novel)"). Die sind keine Drehbuch-Autoren und bleiben draußen;
 * „(screenplay)", „(story)", „(written by)", „(teleplay)" oder ohne Zusatz zählen.
 */
const SOURCE_CREDIT = /\b(characters?|based on|novel|book|books|comic|comics|play|article|created by|creator|inspired|source|original film|poem|series|graphic)\b/i;

/**
 * Drehbuch-Namen aus dem OMDb-Feld „Writer".
 * @param {string} text
 * @returns {string[]}
 */
export function splitWriters(text) {
  const kept = String(text || "").split(",").filter(part => {
    const note = (part.match(/\(([^)]*)\)/) || [])[1] || "";
    return !SOURCE_CREDIT.test(note);
  });
  return splitNames(kept.join(","));
}

/** Stand der gespeicherten Einträge; ältere werden einmal neu abgefragt. */
export const CAST_VERSION = 2;

/** OMDb-Text ohne „N/A". */
const clean = value => {
  const text = String(value ?? "").trim();
  return !text || NA.test(text) ? "" : text;
};

/** Liste aus einem OMDb-Feld („United States, Canada"), ohne „N/A". */
const splitList = value => clean(value).split(",").map(part => part.trim()).filter(part => part && !NA.test(part));

/**
 * Besetzung und Angaben für die Detailseite aus einem OMDb-Datensatz.
 * @param {object} data - Antwort von OMDb.
 * @param {string} [today] - Datum des Abrufs (ISO), Standard: jetzt.
 * @returns {{a: string[], w: string[], d: string[], t: string, v: number,
 *   r: string, c: string[], l: string[], rt: string, mc: string, s: string}}
 */
export function parseOmdbCast(data, today = new Date().toISOString()) {
  const rating = source => clean((Array.isArray(data?.Ratings) ? data.Ratings : []).find(item => item?.Source === source)?.Value);
  const rated = clean(data?.Rated);
  const meta = clean(data?.Metascore) || rating("Metacritic").replace(/\/100$/, "");
  const seasons = clean(data?.totalSeasons);
  return {
    a: splitNames(data?.Actors),
    w: splitWriters(data?.Writer),
    d: splitNames(data?.Director),
    t: today.slice(0, 10),
    v: CAST_VERSION,
    r: /^(not rated|unrated|approved|passed)$/i.test(rated) ? "" : rated,
    c: splitList(data?.Country),
    l: splitList(data?.Language).filter(name => !/^none$/i.test(name)),
    rt: rating("Rotten Tomatoes"),
    mc: /^\d+$/.test(meta) ? meta : "",
    s: /^\d+$/.test(seasons) && Number(seasons) > 0 ? seasons : "",
  };
}

/** Liest einen gespeicherten castData-Wert; Kaputtes fällt weg. */
export function readCastData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const list = v => (Array.isArray(v) ? v.filter(name => typeof name === "string" && name.trim()) : []);
  const out = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!/^tt\d+$/i.test(id) || !entry || typeof entry !== "object") continue;
    const text = v => (typeof v === "string" ? v : "");
    out[id] = {
      a: list(entry.a), w: list(entry.w), d: list(entry.d), t: text(entry.t),
      v: Number.isInteger(entry.v) ? entry.v : 1,
      r: text(entry.r), c: list(entry.c), l: list(entry.l), rt: text(entry.rt), mc: text(entry.mc), s: text(entry.s),
    };
  }
  return out;
}

/** Hat der Eintrag irgendeine Angabe (oder kannte OMDb den Titel ohne Besetzung)? */
const hasCast = entry => entry && (entry.a.length || entry.w.length);

/** Ist der Eintrag auf dem neuesten Stand (CAST_VERSION)? */
export const castCurrent = entry => Boolean(entry) && (entry.v || 1) >= CAST_VERSION;

/**
 * Titel, deren Besetzung noch fehlt oder veraltet ist - in der Reihenfolge
 * des Abrufs: erst fehlende, dann veraltete; jeweils zuerst Titel ohne Cover
 * (dieselbe Anfrage bringt das Cover mit, Cover gehen vor), dann bewertete
 * (die Standard-Ansicht füllt sich zuerst), dann nach eigener Bewertung.
 * @param {Array} movies
 * @param {Object} castData
 * @returns {Array} Titel (je IMDb-Kennung nur einmal).
 */
export function castTargets(movies, castData) {
  const seen = new Set();
  const out = [];
  for (const movie of movies) {
    const id = String(movie.imdbId || "").trim();
    if (!id || seen.has(id) || castCurrent(castData[id])) continue;
    seen.add(id);
    out.push(movie);
  }
  const outdated = movie => (castData[String(movie.imdbId).trim()] ? 1 : 0);
  const noCover = movie => (String(movie.cover || "").trim() ? 1 : 0);
  return out.sort((a, b) => outdated(a) - outdated(b) || noCover(a) - noCover(b) || (ownRating(b) ?? 0) - (ownRating(a) ?? 0));
}

/**
 * Stand des Abrufs: wie viele Titel (mit IMDb-Kennung) es gibt, wie viele
 * auf dem neuesten Stand abgefragt sind und bei wie vielen OMDb keine
 * Besetzung kennt.
 * @returns {{total: number, done: number, empty: number, remaining: number}}
 */
export function castStatus(movies, castData) {
  const ids = new Set(movies.map(movie => String(movie.imdbId || "").trim()).filter(Boolean));
  let done = 0, empty = 0;
  for (const id of ids) {
    if (!castCurrent(castData[id])) continue;
    done++;
    if (!hasCast(castData[id])) empty++;
  }
  return { total: ids.size, done, empty, remaining: ids.size - done };
}

/** castData ohne Titel, die es nicht mehr gibt. */
export function pruneCastData(castData, movies) {
  const ids = new Set(movies.map(movie => String(movie.imdbId || "").trim()).filter(Boolean));
  return Object.fromEntries(Object.entries(castData).filter(([id]) => ids.has(id)));
}

/** castData ohne die Einträge, bei denen OMDb nichts wusste („erneut versuchen"). */
export const dropEmptyCast = castData => Object.fromEntries(Object.entries(castData).filter(([, entry]) => hasCast(entry)));

/**
 * Wann das OMDb-Tageslimit wieder frei ist: Mitternacht (UTC) plus ein paar
 * Minuten Sicherheitsabstand. Liegt OMDb daneben, kostet das nur eine
 * Anfrage, die erneut am Limit scheitert.
 * @param {number} now - ms
 * @returns {string} ISO-Zeitpunkt.
 */
export function nextQuotaReset(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 10)).toISOString();
}

/**
 * Wer bei einem Titel mitgewirkt hat, je Person einmal mit allen Rollen.
 * Regie aus dem IMDb-Export, sonst aus OMDb.
 * @returns {Array<{key: string, name: string, roles: Set<string>}>}
 */
export function creditsOf(movie, castData) {
  const entry = castData[String(movie.imdbId || "").trim()];
  const directors = splitNames(movie.directors);
  const byKey = new Map();
  const add = (name, role) => {
    const key = personKey(name);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, name, roles: new Set() });
    byKey.get(key).roles.add(role);
  };
  (directors.length ? directors : entry?.d || []).forEach(name => add(name, "dir"));
  (entry?.w || []).forEach(name => add(name, "wri"));
  (entry?.a || []).forEach(name => add(name, "act"));
  return [...byKey.values()];
}

/** „Regie · Drehbuch" usw. in fester Reihenfolge. */
export function roleLabel(roles) {
  return ["dir", "wri", "act"].filter(role => roles[role] > 0).map(role => ROLE_LABELS[role]).join(" · ") || "Mitwirkende";
}
