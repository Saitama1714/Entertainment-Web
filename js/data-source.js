import { normalizeMovies } from "./collection.js";
import { DATA_URL } from "./utils/constants.js";
import { setImportWindowDays } from "./logic/movies-logic.js";
import { readAccess } from "./logic/access-logic.js";

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
 * Bringt den Inhalt der Datendatei in die Form der Dashboard-Module.
 * Reine Funktion (getestet in tests/parity.test.mjs).
 * @param {*} data - Geparste data/sammlung.json.
 * @throws {Error} bei unbekanntem Format.
 */
export function parseCollection(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.movies)) throw new Error("Die Datendatei hat ein unbekanntes Format.");
  const include = new Set(Array.isArray(data.include) ? data.include : []);
  // newMovie() setzt bei fehlendem Medium „DVD" (Altbestand im Dashboard).
  // Hier heißt ein fehlendes Medium aber immer „keins": Das Werkzeug schreibt
  // es stets aus, wenn es veröffentlicht wird (Dateien aus Werkzeug 1.0.0
  // haben leere Medien weggelassen).
  const movies = normalizeMovies(data.movies
    .filter(movie => movie && typeof movie === "object")
    .map(movie => ({ ...movie, medium: include.has("medium") && typeof movie.medium === "string" ? movie.medium : "" })));
  return {
    movies,
    include,
    importWindowDays: Number(data.importWindowDays) > 0 ? Number(data.importWindowDays) : 28,
    exportedAt: String(data.exportedAt || ""),
    generatedAt: String(data.generatedAt || ""),
    // Dekoration unten links (wie im Dashboard gewählt), "" = Standard der Website
    decor: typeof data.decor === "string" ? data.decor : "",
    // Passwort-Prüfwert für den Einlass (js/ui/site-gate.js), null = ohne
    access: readAccess(data.access),
  };
}

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
    .then(parseCollection)
    .then(collection => {
      setImportWindowDays(collection.importWindowDays); // Filter "Import" wie im Dashboard
      return collection;
    });
  return cache;
}

/** „Stand: 1. Oktober 2026" - Zeitpunkt der Sicherung, aus der die Datei entstand. */
export function standLabel(collection) {
  const time = Date.parse(collection.exportedAt || collection.generatedAt || "");
  if (!Number.isFinite(time)) return "";
  return `Stand: ${new Date(time).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`;
}
