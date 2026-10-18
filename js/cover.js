import { CONFIG } from "./utils/constants.js";

/*
 * Anbindung an OMDb (omdbapi.com): Cover und Eckdaten zu einer IMDb-Kennung.
 * OMDb braucht einen kostenlosen Schlüssel (Einstellungen); das Free-Tier
 * erlaubt rund 1.000 Anfragen pro Tag.
 */

const OMDB_BASE = "https://www.omdbapi.com/";
const IMDB_ID_PATTERN = /tt\d{6,9}/i;

/**
 * Fehler, bei dem jede weitere Anfrage genauso scheitern würde (Schlüssel
 * fehlt/ungültig, Tageslimit, kein Netz). Sammel-Abrufe brechen dann ab,
 * statt hunderte Anfragen ins Leere zu schicken.
 */
export class OmdbFatalError extends Error {
  /**
   * @param {string} message
   * @param {"key"|"limit"|"network"} [kind] - Schlüssel fehlt/ungültig, Tageslimit, kein Netz.
   */
  constructor(message, kind = "key") {
    super(message);
    this.kind = kind;
  }
}

/** Kurze Pause zwischen aufeinanderfolgenden Anfragen (Rate-Limit). */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** OMDb schreibt "N/A" für fehlende Werte; im Dashboard ist das "". */
const cleanField = value => (!value || value === "N/A" ? "" : value);

/**
 * Erkennt eine IMDb-Kennung in einem Text - als vollständigen Link
 * ("https://www.imdb.com/title/tt1375666/") oder als reine Kennung.
 * @param {string} input
 * @returns {string|null} Kennung in Kleinbuchstaben oder null.
 */
export function extractImdbId(input) {
  const match = String(input || "").match(IMDB_ID_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Fragt den vollständigen OMDb-Datensatz zu einer IMDb-Kennung ab.
 * @param {string} imdbId
 * @param {string} apiKey
 * @returns {Promise<object|null>} Rohdaten oder null, wenn OMDb den Titel nicht kennt.
 * @throws {OmdbFatalError} Schlüssel fehlt/ungültig, Tageslimit, kein Netz.
 * @throws {Error} Sonstige Serverfehler.
 */
async function fetchOmdbRecord(imdbId, apiKey) {
  if (!imdbId) return null;
  if (!apiKey) throw new OmdbFatalError("Kein OMDb-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.");

  const url = new URL(OMDB_BASE);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("apikey", apiKey);

  let response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new OmdbFatalError("OMDb war nicht erreichbar. Internetverbindung prüfen.", "network");
  }
  if (response.status === 401) throw new OmdbFatalError("OMDb-Schlüssel ungültig.");
  if (!response.ok) throw new Error(`OMDb-Anfrage fehlgeschlagen (Status ${response.status}).`);

  const data = await response.json();
  if (data.Response === "False") {
    const message = data.Error || "";
    if (/invalid api key/i.test(message)) throw new OmdbFatalError("OMDb-Schlüssel ungültig.");
    if (/limit/i.test(message)) throw new OmdbFatalError("OMDb-Tageslimit erreicht. Morgen geht es weiter.", "limit");
    return null; // Titel unbekannt - kein harter Fehler
  }
  return data;
}

/**
 * Poster-Adresse zu einer IMDb-Kennung.
 * @returns {Promise<string|null>} Adresse oder null (kein Poster/Titel unbekannt).
 */
export async function fetchOmdbCover(imdbId, apiKey) {
  const data = await fetchOmdbRecord(imdbId, apiKey);
  return cleanField(data?.Poster) || null;
}

/**
 * Roher OMDb-Datensatz (für den Abruf der Besetzung, js/cast-fetch.js).
 * @returns {Promise<object|null>} null, wenn OMDb den Titel nicht kennt.
 * @throws {OmdbFatalError}
 */
export const fetchOmdbData = (imdbId, apiKey) => fetchOmdbRecord(imdbId, apiKey);

/**
 * Eckdaten zu einer IMDb-Kennung, abgebildet auf die Felder des Datenmodells
 * (collection.js). Leere Werte werden weggelassen, damit sie beim Übernehmen
 * nie vorhandene Angaben überschreiben.
 * @returns {Promise<object|null>} Teilobjekt oder null, wenn OMDb den Titel nicht kennt.
 */
export async function fetchOmdbDetails(imdbId, apiKey) {
  const data = await fetchOmdbRecord(imdbId, apiKey);
  if (!data) return null;

  const details = {
    title: cleanField(data.Title),
    year: cleanField(data.Year),
    genre: cleanField(data.Genre),
    directors: cleanField(data.Director),
    runtimeMinutes: cleanField(data.Runtime).match(/\d+/)?.[0] || "",
    imdbRating: cleanField(data.imdbRating),
    numVotes: cleanField(data.imdbVotes),
    releaseDate: cleanField(data.Released),
    titleType: cleanField(data.Type),
    imdbDescription: cleanField(data.Plot),
    imdbId: cleanField(data.imdbID),
    imdbUrl: data.imdbID ? `https://www.imdb.com/title/${data.imdbID}/` : "",
    cover: cleanField(data.Poster),
  };
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value));
}

/**
 * Lädt fehlende Cover nach (nur Einträge mit IMDb-Kennung und ohne Cover),
 * nacheinander mit kurzer Pause. Bricht bei einem OmdbFatalError ab und
 * meldet ihn in `fatal`; bis dahin geladene Cover bleiben erhalten.
 * @param {Array} movies - komplette Sammlung (wird nicht verändert).
 * @param {string} apiKey
 * @param {Function} [onProgress] - (erledigt, gesamt, aktualisierterEintrag) nach jedem Versuch.
 * @returns {Promise<{movies: Array, updated: number, failed: number, fatal: string}>}
 */
export async function fetchMissingCovers(movies, apiKey, onProgress) {
  const targets = movies.filter(movie => movie.imdbId && !movie.cover);
  const byId = new Map(movies.map(movie => [movie.id, movie]));
  let updated = 0;
  let failed = 0;
  let fatal = "";

  for (let index = 0; index < targets.length; index++) {
    const movie = targets[index];
    try {
      const poster = await fetchOmdbCover(movie.imdbId, apiKey);
      if (poster) {
        byId.set(movie.id, { ...byId.get(movie.id), cover: poster });
        updated++;
      }
    } catch (error) {
      if (error instanceof OmdbFatalError) { fatal = error.message; break; }
      failed++;
    }
    onProgress?.(index + 1, targets.length, byId.get(movie.id));
    if (index < targets.length - 1) await wait(CONFIG.OMDB_FETCH_DELAY_MS);
  }

  return { movies: [...byId.values()], updated, failed, fatal };
}
