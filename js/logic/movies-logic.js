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
 * Filter-Chips: Art, Genre, Medium, Gesehen-Status, IMDb-Liste, Import. Kombinierbar - innerhalb
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

/*
 * Filtergruppe "Import": Einträge, die der IMDb-Import in den letzten
 * Wochen angelegt ("Neu") oder spürbar verändert ("Geändert") hat - Standard
 * 4 Wochen, einstellbar (setImportWindowDays, Einstellungen → Entertainment). Die
 * Zeitstempel setzt mergeImdbLists() (importAddedAt/importChangedAt). Ein
 * Eintrag kann beides sein (neu und danach noch einmal geändert).
 * Gerechnet wird ab jetzt - die Chips leeren sich also von selbst wieder.
 */
export const IMPORT_WINDOW_DAYS = 28;

/** Wählbare Zeiträume für den Filter "Import" (Einstellungen). */
export const IMPORT_WINDOW_OPTIONS = [
  { value: 7, label: "1 Woche" },
  { value: 14, label: "2 Wochen" },
  { value: 28, label: "4 Wochen" },
  { value: 56, label: "8 Wochen" },
  { value: 90, label: "3 Monate" },
];

let importWindowDays = IMPORT_WINDOW_DAYS;

/**
 * Legt den Zeitraum des Filters "Import" fest (in Tagen). Ungültige Werte
 * (leer, 0, Text) → Standard 4 Wochen.
 * @param {number|string} days
 */
export function setImportWindowDays(days) {
  const value = Number(days);
  importWindowDays = Number.isFinite(value) && value > 0 ? value : IMPORT_WINDOW_DAYS;
}

/** Aktueller Zeitraum des Filters "Import" in Tagen. */
export const getImportWindowDays = () => importWindowDays;

export const IMPORT_FILTER_OPTIONS = [
  { value: "new", label: "Neu" },
  { value: "changed", label: "Geändert" },
];

/**
 * Import-Status eines Eintrags im 4-Wochen-Fenster.
 * @param {{importAddedAt?: string, importChangedAt?: string}} movie
 * @param {number} [now] - aktuelle Zeit in ms (Tests setzen sie fest).
 * @returns {string[]} [], ["new"], ["changed"] oder ["new", "changed"].
 */
export function importStatus(movie, now = Date.now()) {
  const since = now - importWindowDays * 86400000;
  const recent = value => {
    const time = Date.parse(value || "");
    return Number.isFinite(time) && time >= since;
  };
  const status = [];
  if (recent(movie.importAddedAt)) status.push("new");
  if (recent(movie.importChangedAt)) status.push("changed");
  return status;
}

/**
 * Optionen der Gruppe "Import" - nur, wenn überhaupt ein Eintrag gerade
 * neu oder geändert ist (sonst entfällt die Gruppe, wie "Liste" vor dem
 * ersten Import).
 * @param {Array} movies - komplette Sammlung.
 * @returns {Array<{value: string, label: string}>}
 */
export function importFilterOptions(movies, now = Date.now()) {
  return movies.some(movie => importStatus(movie, now).length) ? IMPORT_FILTER_OPTIONS : [];
}

/** Ein leerer Filterzustand (keine Kategorie schränkt ein). */
export function emptyFilters() {
  return { kind: [], genres: [], media: [], seen: [], lists: [], import: [] };
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
 * @param {{kind: string[], genres: string[], media: string[], seen: string[], lists: string[], import: string[]}} filters
 * @param {"kind"|"genres"|"media"|"seen"|"lists"|"import"} category
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
  import: movie => importStatus(movie),
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
 * Sortierung: ein Kriterium plus Richtung (absteigend/aufsteigend, Pfeil-Knopf
 * neben der Auswahl). Jedes Kriterium hat eine sinnvolle Startrichtung
 * (Bewertungen, Jahr, Laufzeit, Gesehen am: absteigend; Titel: A–Z).
 * Fehlende Werte (keine Bewertung, kein Jahr, kein Datum) landen immer am
 * Ende, unabhängig von der Richtung. Bei Gleichstand entscheidet "neueste
 * zuerst" (createdAt). Standard: Website IMDb-Bewertung (DEFAULT_SORT), das
 * Dashboard nutzt "Deine Bewertung". Die Vorschau auf der Startseite nutzt
 * dagegen previewMovies() (Zufallsauswahl, siehe oben).
 */
export const DEFAULT_SORT = "imdbRating";

export const SORT_OPTIONS = [
  { value: "yourRating", label: "Deine Bewertung", direction: "desc" },
  { value: "imdbRating", label: "IMDb-Bewertung", direction: "desc" },
  { value: "title", label: "Titel", direction: "asc" },
  { value: "year", label: "Jahr", direction: "desc" },
  { value: "runtimeMinutes", label: "Laufzeit", direction: "desc" },
  { value: "seenAt", label: "Gesehen am", direction: "desc" },
];

/** Ältere Sortier-Werte (z. B. in einer gemerkten Ansicht der Website). */
const LEGACY_SORT = { yearDesc: ["year", "desc"], yearAsc: ["year", "asc"] };

/**
 * Löst Sortier-Wert und Richtung auf; Unbekanntes fällt auf `fallback` zurück.
 * @param {string} sortKey
 * @param {"asc"|"desc"} [direction] - fehlt sie, gilt die Startrichtung des Kriteriums.
 * @param {string} [fallback]
 * @returns {{key: string, direction: "asc"|"desc"}}
 */
export function resolveSort(sortKey, direction, fallback = DEFAULT_SORT) {
  const [legacyKey, legacyDirection] = LEGACY_SORT[sortKey] || [];
  const option = SORT_OPTIONS.find(item => item.value === (legacyKey || sortKey))
    || SORT_OPTIONS.find(item => item.value === fallback);
  const chosen = direction === "asc" || direction === "desc" ? direction : legacyDirection || option.direction;
  return { key: option.value, direction: chosen };
}

/** Zahl aus einem Textfeld, oder null wenn keine Zahl darin steht. */
const toNumber = value => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
};

/** Sortierwert eines Titels, oder null wenn er fehlt. */
function sortValue(movie, key) {
  if (key === "title") return String(movie.title || "").trim() || null;
  if (key === "seenAt") {
    const time = Date.parse(movie.seenAt || "");
    return Number.isFinite(time) ? time : null;
  }
  return toNumber(movie[key]);
}

/** "Neueste zuerst" (nur noch als Gleichstands-Regel): nach createdAt, sonst die spätere Position. */
const byRecent = (a, b) => (b.movie.createdAt || "").localeCompare(a.movie.createdAt || "") || b.index - a.index;

/**
 * Sortiert eine Titelliste (ohne das Original zu verändern).
 * @param {Array} movies
 * @param {string} sortKey - ein Wert aus SORT_OPTIONS (Unbekanntes → DEFAULT_SORT).
 * @param {"asc"|"desc"} [direction] - fehlt sie, gilt die Startrichtung des Kriteriums.
 * @returns {Array}
 */
export function sortMovies(movies, sortKey, direction) {
  const { key, direction: dir } = resolveSort(sortKey, direction);
  const sign = dir === "asc" ? 1 : -1;
  const compare = (a, b) => {
    const left = sortValue(a.movie, key);
    const right = sortValue(b.movie, key);
    if (left === null || right === null) return (left === null) - (right === null) || byRecent(a, b);
    const diff = key === "title" ? left.localeCompare(right, "de") : left - right;
    return sign * diff || byRecent(a, b);
  };
  return movies
    .map((movie, index) => ({ movie, index }))
    .sort(compare)
    .map(entry => entry.movie);
}
