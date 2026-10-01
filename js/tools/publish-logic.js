/*
 * Umwandlung: Dashboard-Sicherung → öffentliche Datendatei der Website.
 *
 * Arbeitet mit einer Positivliste: In die Website-Datei kommen nur die hier
 * genannten Felder der Titel. Alles andere aus der Sicherung - OMDb-Schlüssel,
 * Einstellungen, Favoriten, interne Felder - bleibt immer draußen, auch wenn
 * das Dashboard später neue Felder bekommt.
 *
 * Reine Funktionen, keine DOM-Abhängigkeit (getestet in tests/publish.test.mjs).
 */

/** Diese Felder sind immer dabei (öffentliche Angaben von IMDb plus Cover). */
export const BASE_FIELDS = [
  "id", "createdAt", "title", "originalTitle", "year", "titleType", "genre",
  "directors", "runtimeMinutes", "releaseDate", "imdbRating", "numVotes",
  "imdbUrl", "imdbId", "imdbDescription", "cover",
];

/**
 * Wahlweise Angaben - im Werkzeug als Häkchen. `fields` sind die Felder der
 * Titel, die mitkommen; `standard` ist die Vorauswahl.
 */
export const OPTIONAL_GROUPS = [
  { key: "medium", label: "Medium (DVD, Blu-ray, 4K …)", fields: ["medium"], standard: true },
  { key: "seen", label: "Gesehen-Status und „Gesehen am“", fields: ["seen", "seenAt"], standard: true },
  { key: "rating", label: "Meine eigene Bewertung", fields: ["yourRating", "dateRated"], standard: true },
  { key: "lists", label: "Namen meiner IMDb-Listen (z. B. „Watchlist“)", fields: ["imdbLists"], standard: true },
  { key: "notes", label: "Meine Notizen", fields: ["notes"], standard: false },
];

/** Vorauswahl der Häkchen: { medium: true, … }. */
export const defaultOptions = () => Object.fromEntries(OPTIONAL_GROUPS.map(group => [group.key, group.standard]));

/** Nur echte Web-Adressen als Cover/IMDb-Link (keine javascript:-Links o. Ä.). */
function webUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/** Ein Titel, reduziert auf die erlaubten Felder. */
function publicMovie(movie, fields) {
  const out = {};
  for (const field of fields) {
    const value = movie[field];
    if (field === "seen") { out.seen = value === true; continue; }
    if (field === "imdbLists") { out.imdbLists = Array.isArray(value) ? value.filter(name => typeof name === "string" && name) : []; continue; }
    if (value === undefined || value === null || value === "") continue;
    if (field === "cover" || field === "imdbUrl") {
      const url = webUrl(value);
      if (url) out[field] = url;
      continue;
    }
    out[field] = typeof value === "number" ? value : String(value);
  }
  return out;
}

/**
 * Prüft die Sicherungsdatei und liefert ihre Titel.
 * @param {*} backup - Inhalt der Datei „Sicherung speichern" (bereits als JSON gelesen).
 * @throws {Error} mit verständlicher Meldung, wenn es keine Dashboard-Sicherung ist.
 */
export function readBackup(backup) {
  if (!backup || typeof backup !== "object" || backup.version !== 1 || !backup.data || typeof backup.data !== "object") {
    throw new Error("Das ist keine Dashboard-Sicherung. Bitte die Datei aus „Einstellungen → Sicherung speichern“ wählen.");
  }
  const movies = backup.data.movies;
  if (!Array.isArray(movies)) throw new Error("Die Sicherung enthält keine Titel.");
  return movies.filter(movie => movie && typeof movie === "object" && typeof movie.title === "string" && movie.title.trim());
}

/**
 * Baut die Datendatei der Website.
 * @param {object} backup - Inhalt der Sicherungsdatei.
 * @param {Object<string, boolean>} [options] - Häkchen je OPTIONAL_GROUPS-Schlüssel.
 * @param {{now?: Date}} [context]
 * @returns {{version: 1, generatedAt: string, exportedAt: string, include: string[], movies: object[]}}
 */
export function buildPublicData(backup, options = defaultOptions(), { now = new Date() } = {}) {
  const movies = readBackup(backup);
  const include = OPTIONAL_GROUPS.filter(group => options[group.key]).map(group => group.key);
  const fields = [...BASE_FIELDS, ...OPTIONAL_GROUPS.filter(group => options[group.key]).flatMap(group => group.fields)];
  return {
    version: 1,
    generatedAt: now.toISOString(),
    exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : "",
    include,
    movies: movies.map(movie => publicMovie(movie, fields)),
  };
}

/** Kurze Zusammenfassung für das Werkzeug: Anzahl, mit/ohne Cover, Auswahl. */
export function summarize(data) {
  const withCover = data.movies.filter(movie => movie.cover).length;
  const labels = OPTIONAL_GROUPS.filter(group => data.include.includes(group.key)).map(group => group.label);
  return { total: data.movies.length, withCover, labels };
}
