/**
 * Datenmodell der Titel - übernommen aus dem Dashboard (dort zusätzlich mit
 * IMDb-Import). Hier nur die Normalisierung: Jeder Titel hat danach alle
 * Felder, fehlende als leerer Text.
 */

/**
 * IMDb-Spalten und die Felder, auf die sie abgebildet werden. Einzige Quelle
 * dafür: Parser, Normalisierung und Import-Logik lesen alle von hier.
 */
export const IMDB_COLUMNS = {
  title: "Title",
  originalTitle: "Original Title",
  imdbUrl: "URL",
  titleType: "Title Type",
  imdbRating: "IMDb Rating",
  runtimeMinutes: "Runtime (mins)",
  year: "Year",
  genre: "Genres",
  numVotes: "Num Votes",
  releaseDate: "Release Date",
  directors: "Directors",
  yourRating: "Your Rating",
  dateRated: "Date Rated",
  imdbCreated: "Created",
  imdbModified: "Modified",
  imdbDescription: "Description",
  position: "Position",
};

/** Felder, die aus IMDb kommen und bei jedem Import aktualisiert werden. */
export const IMDB_FIELDS = Object.keys(IMDB_COLUMNS);

/** Textfelder, die nur das Dashboard pflegt (ein Import fasst sie nie an). */
const LOCAL_TEXT_FIELDS = ["seenAt", "cover", "notes", "imdbId"];

/**
 * Erstellt ein vollständiges Eintrags-Objekt mit Standardwerten für alle
 * Felder. Wird auch auf gespeicherte Daten angewendet, damit ältere Stände
 * (denen neuere Felder fehlen) überall gleich aussehen.
 * @param {object} [values]
 * @returns {object}
 */
export function newMovie(values = {}) {
  const movie = {
    id: values.id || crypto.randomUUID(),
    // "" = kein Medium (z. B. nur auf der Watchlist); nur ganz fehlend → DVD
    medium: typeof values.medium === "string" ? values.medium : "DVD",
    seen: Boolean(values.seen),
    createdAt: values.createdAt || new Date().toISOString(),
    // Namen der IMDb-Listen, in denen der Eintrag beim letzten Import stand
    imdbLists: Array.isArray(values.imdbLists) ? values.imdbLists.filter(name => typeof name === "string") : [],
    // IMDb-Felder, die von Hand festgelegt wurden und die ein Import nicht überschreibt
    lockedFields: Array.isArray(values.lockedFields) ? values.lockedFields.filter(field => IMDB_FIELDS.includes(field)) : [],
  };
  for (const field of [...IMDB_FIELDS, ...LOCAL_TEXT_FIELDS]) movie[field] = values[field] || "";
  return movie;
}

/** Wendet newMovie() auf eine ganze Liste an (z. B. nach dem Laden aus Storage). */
export function normalizeMovies(movies) {
  return movies.map(newMovie);
}
