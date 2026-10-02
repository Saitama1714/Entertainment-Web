/**
 * Datenmodell der Einträge (Titel) unter Entertainment: Normalisierung,
 * Upsert und das Parsen von IMDb-CSV-Exporten. Das Zusammenführen mehrerer
 * Listen steht in logic/imdb-import-logic.js.
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

/** Fügt einen Film hinzu oder ersetzt ihn, falls die ID bereits existiert. */
export function upsertMovie(movies, values) {
  const movie = newMovie(values);
  const index = movies.findIndex(item => item.id === movie.id);
  return index < 0 ? [...movies, movie] : movies.map(item => (item.id === movie.id ? movie : item));
}

/**
 * Parst einen IMDb-CSV-Export (Bewertungen, Watchlist oder eigene Liste;
 * RFC-4180-artig, mit Quoting).
 * Bewertungs-Exporte erkennt man daran, dass ihnen die Listen-Spalte
 * "Position" fehlt; Watchlist und eigene Listen sehen gleich aus.
 * @param {string} text - Roher Dateiinhalt.
 * @returns {{kind: "ratings"|"list", movies: Array}}
 * @throws {Error} Wenn die Datei leer ist oder nicht dem IMDb-Format entspricht.
 */
export function parseImdbExport(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index++; }
    else if (char === '"') { quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index++;
      row.push(value);
      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else { value += char; }
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  if (rows.length < 2) throw new Error("Die CSV-Datei enthält keine Einträge.");

  const headers = rows.shift().map(header => header.replace(/^\uFEFF/, "").trim());
  if (!headers.includes("Title") || !headers.includes("Const")) {
    throw new Error("Die CSV-Datei entspricht nicht dem IMDb-Exportformat.");
  }

  // Spaltenposition je Feld einmal nachschlagen statt pro Zeile und Feld
  const columns = Object.entries(IMDB_COLUMNS).map(([field, header]) => [field, headers.indexOf(header)]);
  const idColumn = headers.indexOf("Const");
  const kind = headers.includes("Position") ? "list" : "ratings";
  const movies = rows
    .map(cells => {
      const movie = { imdbId: cells[idColumn]?.trim() || "" };
      for (const [field, column] of columns) movie[field] = column < 0 ? "" : cells[column]?.trim() || "";
      return movie;
    })
    .filter(movie => movie.title && movie.imdbId);
  return { kind, movies };
}
