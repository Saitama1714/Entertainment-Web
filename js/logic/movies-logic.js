import { MEDIA_TYPES } from "../utils/media.js";

/**
 * Filtert Filme anhand eines Suchbegriffs über Titel, Originaltitel, Medium,
 * Genre, Regie und Jahr. Case-insensitive, deutsche Sortierregeln (ä/ö/ü).
 * @param {Array} movies
 * @param {string} query
 * @returns {Array} Gefilterte Filme.
 */
export function searchMovies(movies, query) {
  const normalized = query.trim().toLocaleLowerCase("de");
  if (!normalized) return movies;
  return movies.filter(movie =>
    [movie.title, movie.originalTitle, movie.medium, movie.genre, movie.directors, movie.year]
      .join(" ")
      .toLocaleLowerCase("de")
      .includes(normalized)
  );
}

/**
 * Zufällige Auswahl aus der ganzen Sammlung für die Vorschau auf der
 * Startseite (unabhängig vom Gesehen-Status). Bei jedem Aufruf - also bei
 * jedem neuen Tab bzw. jedem Neuladen - eine neue Mischung; bewusst nicht
 * gespeichert und nicht auf "zuletzt hinzugekommen" beschränkt.
 * @param {Array} movies
 * @param {number} count
 * @param {{rng?: Function}} [options] - rng liefert Zufallszahlen in [0, 1);
 *   Test-Code kann hier eine feste Folge einsetzen (siehe pickRandomUnseen).
 * @returns {Array}
 */
export function previewMovies(movies, count, { rng = Math.random } = {}) {
  const shuffled = [...movies];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/*
 * Filter-Chips: Art, Genre, Medium, Gesehen-Status, IMDb-Liste. Kombinierbar - innerhalb
 * einer Kategorie ODER-verknüpft ("4K" oder "Blu-ray"), zwischen Kategorien
 * UND-verknüpft ("4K" UND "Gesehen"). Bewusst nicht gespeichert: die Auswahl
 * gilt nur für die laufende Sitzung und setzt sich beim nächsten Öffnen der
 * Seite zurück.
 */

/** Feste Medium-Optionen für die Filter-Chips, unabhängig vom Datenbestand. */
export const MEDIA_FILTER_OPTIONS = [
  ...MEDIA_TYPES.map(value => ({ value, label: value })),
  { value: "", label: "Kein Medium" },
];

/*
 * Art eines Eintrags (Filtergruppe "Art" und Zufallspicker). IMDb kennt 13
 * Arten und schreibt sie je nach Export unterschiedlich ("TV Series",
 * "tvSeries"), OMDb wieder anders ("series") - und bei deutscher
 * Spracheinstellung auf Deutsch ("Fernsehserie", "Miniserie"). Verglichen
 * wird ohne Leer-/Sonderzeichen und Groß-/Kleinschreibung. Alles, was hier
 * nicht steht - auch Einträge ganz ohne Art -, zählt als "Sonstiges" (z. B.
 * TV Episode/Fernsehepisode, TV Special/Fernsehspecial).
 */
const TITLE_KIND_BY_TYPE = {
  // Englisch (IMDb neu und alt, OMDb)
  movie: "film", feature: "film", tvmovie: "film", video: "film", short: "film",
  tvseries: "series", series: "series", tvminiseries: "series", miniseries: "series",
  videogame: "game", game: "game",
  // Deutsch (IMDb mit deutscher Spracheinstellung)
  film: "film", fernsehfilm: "film", kurzfilm: "film",
  fernsehserie: "series", serie: "series", miniserie: "series", minifernsehserie: "series", fernsehminiserie: "series",
  videospiel: "game",
};

/**
 * Art eines Eintrags: "film", "series", "game" oder "other".
 * @param {{titleType: string}} movie
 * @returns {string}
 */
export function titleKind(movie) {
  const key = String(movie.titleType || "").toLowerCase().replace(/[^a-z]/g, "");
  return TITLE_KIND_BY_TYPE[key] || "other";
}

export const KIND_FILTER_OPTIONS = [
  { value: "film", label: "Film" },
  { value: "series", label: "Serie" },
  { value: "game", label: "Videospiel" },
  { value: "other", label: "Sonstiges" },
];

export const SEEN_FILTER_OPTIONS = [
  { value: "seen", label: "Gesehen" },
  { value: "unseen", label: "Offen" },
];

/** Ein leerer Filterzustand (keine Kategorie schränkt ein). */
export function emptyFilters() {
  return { kind: [], genres: [], media: [], seen: [], lists: [] };
}

/**
 * Genres eines Eintrags. IMDb liefert sie als Text mit Komma ("Drama, Sci-Fi");
 * doppelte und leere Angaben fallen weg.
 * @param {{genre: string}} movie
 * @returns {string[]}
 */
export function genresOf(movie) {
  return [...new Set(String(movie.genre || "").split(",").map(name => name.trim()).filter(Boolean))];
}

/**
 * Die Genres, die in der Sammlung vorkommen (für die Filtergruppe "Genre") -
 * kommen aus dem IMDb-Import, so wie IMDb sie schreibt.
 * @param {Array} movies
 * @returns {string[]} Alphabetisch sortiert (deutsche Regeln).
 */
export function genreFilterOptions(movies) {
  const names = new Set();
  for (const movie of movies) for (const name of genresOf(movie)) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

/** True, sobald irgendeine Kategorie mindestens einen Wert aktiv hat. */
export function hasActiveFilters(filters) {
  return Object.values(filters).some(values => values.length > 0);
}

/**
 * Die IMDb-Listennamen, die aktuell in der Sammlung vorkommen (für die
 * "Liste"-Filtergruppe) - erst vorhanden nach einem Import.
 * @param {Array} movies
 * @returns {string[]} Alphabetisch sortiert (deutsche Regeln).
 */
export function listFilterOptions(movies) {
  const names = new Set();
  for (const movie of movies) for (const name of movie.imdbLists) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Schaltet einen einzelnen Wert innerhalb einer Filterkategorie um (an/aus).
 * Liefert einen neuen Filterzustand, verändert `filters` nicht.
 * @param {{kind: string[], genres: string[], media: string[], seen: string[], lists: string[]}} filters
 * @param {"kind"|"genres"|"media"|"seen"|"lists"} category
 * @param {string} value
 */
export function toggleFilterValue(filters, category, value) {
  const active = filters[category] || [];
  const next = active.includes(value) ? active.filter(entry => entry !== value) : [...active, value];
  return { ...filters, [category]: next };
}

/** Status-Schlüssel eines Eintrags für die Gruppe "Status". */
const seenKey = movie => (movie.seen ? "seen" : "unseen");

/** Liest die Werte eines Eintrags, nach denen eine Kategorie filtert. */
const valuesOf = {
  kind: movie => [titleKind(movie)],
  genres: genresOf,
  media: movie => [movie.medium],
  seen: movie => [seenKey(movie)],
  lists: movie => movie.imdbLists,
};

/**
 * Wendet die Filter-Chips auf eine Titelliste an.
 * @param {Array} movies
 * @param {{kind: string[], media: string[], seen: string[], lists: string[]}} filters
 * @param {string} [ignore] - Kategorie, die dabei nicht einschränkt (für die Zählung).
 * @returns {Array}
 */
export function filterMovies(movies, filters, ignore = "") {
  // Fehlt eine Kategorie im Filterobjekt, schränkt sie nicht ein
  const active = Object.keys(valuesOf)
    .filter(category => category !== ignore && filters[category]?.length)
    .map(category => [category, new Set(filters[category])]);
  return movies.filter(movie =>
    active.every(([category, wanted]) => valuesOf[category](movie).some(value => wanted.has(value))));
}

/**
 * Zahlen für alle Chips auf einmal: wie viele Einträge jede Option ergäbe,
 * wenn man sie zu den *übrigen* aktiven Filtern hinzufügt. Die eigene
 * Kategorie zählt dabei nicht mit - so bleiben die Zahlen beim Umschalten
 * innerhalb einer Gruppe stabil, reagieren aber auf die anderen Gruppen und
 * die Suche. Ein Durchlauf je Kategorie, nicht je Chip.
 * @param {Array} movies - bereits durchsucht (searchMovies), noch ungefiltert.
 * @param {{kind: string[], media: string[], seen: string[], lists: string[]}} filters
 * @returns {Object<string, Map<string, number>>} Je Kategorie: Wert → Anzahl.
 */
export function facetCounts(movies, filters) {
  const counts = {};
  for (const category of Object.keys(valuesOf)) {
    const tally = new Map();
    for (const movie of filterMovies(movies, filters, category)) {
      for (const value of valuesOf[category](movie)) tally.set(value, (tally.get(value) || 0) + 1);
    }
    counts[category] = tally;
  }
  return counts;
}

/*
 * Sortierung. "recent" (Standard in Entertainment) zeigt die neuesten
 * zuerst; bei gleichem Zeitstempel gilt die spätere Position als neuer.
 * Fehlende Werte (keine Bewertung, kein Jahr) landen immer am Ende,
 * unabhängig von der gewählten Richtung. Die Vorschau auf der Startseite
 * nutzt dagegen previewMovies() (Zufallsauswahl, siehe oben).
 */
export const SORT_OPTIONS = [
  { value: "recent", label: "Zuletzt hinzugekommen" },
  { value: "title", label: "Titel (A–Z)" },
  { value: "yourRating", label: "Deine Bewertung (hoch → niedrig)" },
  { value: "imdbRating", label: "IMDb-Bewertung (hoch → niedrig)" },
  { value: "yearDesc", label: "Jahr (neu → alt)" },
  { value: "yearAsc", label: "Jahr (alt → neu)" },
];

/** Zahl aus einem Textfeld, oder null wenn keine Zahl darin steht. */
const toNumber = value => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
};

/** "Neueste zuerst": nach createdAt, bei Gleichstand gilt die spätere Position als neuer. */
const byRecent = (a, b) => (b.movie.createdAt || "").localeCompare(a.movie.createdAt || "") || b.index - a.index;

/**
 * Vergleich nach einem Zahlenfeld. Fehlende Werte landen immer am Ende,
 * unabhängig von der Richtung; bei Gleichstand entscheidet "neueste zuerst".
 * @param {string} field
 * @param {1|-1} direction - 1 = aufsteigend, -1 = absteigend.
 */
const byNumber = (field, direction) => (a, b) => {
  const left = toNumber(a.movie[field]);
  const right = toNumber(b.movie[field]);
  if (left === null || right === null) return (left === null) - (right === null) || byRecent(a, b);
  return direction * (left - right) || byRecent(a, b);
};

/** Vergleichsfunktion je Sortier-Option. */
const COMPARATORS = {
  recent: byRecent,
  title: (a, b) => a.movie.title.localeCompare(b.movie.title, "de") || byRecent(a, b),
  yourRating: byNumber("yourRating", -1),
  imdbRating: byNumber("imdbRating", -1),
  yearDesc: byNumber("year", -1),
  yearAsc: byNumber("year", 1),
};

/**
 * Sortiert eine Titelliste nach einer der SORT_OPTIONS (ohne das Original
 * zu verändern). Unbekannte Werte fallen auf "recent" zurück.
 * @param {Array} movies
 * @param {string} sortKey
 * @returns {Array}
 */
export function sortMovies(movies, sortKey) {
  const compare = COMPARATORS[sortKey] || COMPARATORS.recent;
  return movies
    .map((movie, index) => ({ movie, index }))
    .sort(compare)
    .map(entry => entry.movie);
}
