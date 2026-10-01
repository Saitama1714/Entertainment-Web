import { normalizeMovies } from "./collection.js";
import { DATA_URL } from "./utils/constants.js";

/*
 * Lädt die Datendatei der Website (data/sammlung.json, erzeugt mit
 * werkzeug.html aus einer Dashboard-Sicherung) und bringt die Titel in die
 * Form, die die übernommenen Dashboard-Module erwarten.
 *
 * `include` sagt, welche wahlweisen Angaben in der Datei stecken (Medium,
 * Gesehen, eigene Bewertung, Listen, Notizen). Fehlt eine, blenden die Seiten
 * die zugehörigen Filter, Sortierungen und Zahlen aus.
 */

/** Das Ergebnis eines Ladevorgangs - einmal pro Seite. */
let cache = null;

/**
 * @returns {Promise<{movies: object[], include: Set<string>, exportedAt: string, generatedAt: string}>}
 * @throws {Error} wenn die Datei fehlt oder kaputt ist.
 */
export function loadCollection() {
  cache ??= fetch(DATA_URL, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Die Datendatei fehlt (${DATA_URL}).`);
      return response.json();
    })
    .then(data => {
      if (!data || data.version !== 1 || !Array.isArray(data.movies)) throw new Error("Die Datendatei hat ein unbekanntes Format.");
      const include = new Set(Array.isArray(data.include) ? data.include : []);
      let movies = normalizeMovies(data.movies.filter(movie => movie && typeof movie === "object"));
      // newMovie() setzt bei fehlendem Medium „DVD" (Altbestand im Dashboard) -
      // hier heißt „fehlt" aber „nicht veröffentlicht"
      if (!include.has("medium")) movies = movies.map(movie => ({ ...movie, medium: "" }));
      return {
        movies,
        include,
        exportedAt: String(data.exportedAt || ""),
        generatedAt: String(data.generatedAt || ""),
      };
    });
  return cache;
}

/** „Stand: 1. Oktober 2026" - Zeitpunkt der Sicherung, aus der die Datei entstand. */
export function standLabel(collection) {
  const time = Date.parse(collection.exportedAt || collection.generatedAt || "");
  if (!Number.isFinite(time)) return "";
  return `Stand: ${new Date(time).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`;
}
