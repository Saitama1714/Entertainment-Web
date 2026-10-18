import { newMovie, normalizeMovies, IMDB_FIELDS } from "../collection.js";
import { ageReminder } from "./reminder-logic.js";

/*
 * IMDb ist die Quelle der Filme, das Dashboard ergänzt eigene Angaben.
 * Diese Datei enthält nur reine Funktionen (kein DOM, kein Speicher),
 * damit sie sich ohne Browser prüfen lassen.
 */

/*
 * Felder, die nur im Dashboard gepflegt werden und ein Import nie anfasst:
 * id, notes, cover, createdAt.
 *
 * Gesehen = auf IMDb bewertet. Meldet IMDb eine Bewertung, wird der Titel
 * gesehen. Wird der Bewertungs-Export mitimportiert (list.isRatings) und ein
 * Titel, der im Dashboard eine Bewertung hat, steht nicht mehr darin, war die
 * Bewertung bei IMDb entfernt: Bewertung und Bewertungsdatum werden gelöscht,
 * der Titel wird ungesehen. Ohne Bewertungs-Export bleibt das unberührt.
 *
 * Medium: kommt aus der IMDb-Liste, die beim Import als "physische Sammlung"
 * markiert ist (list.isCollection), und zwar aus der Beschreibung des
 * Listeneintrags (mediumFromDescription). IMDb gewinnt immer: Bei jedem
 * Import wird das Medium dieser Titel neu gesetzt - ohne erkennbares
 * Stichwort auf "Kein Medium". Fällt ein Titel aus der Sammlungsliste heraus,
 * wird sein Medium ebenfalls auf "Kein Medium" gesetzt. Titel, die nie in
 * der Sammlungsliste standen, behalten ihr Medium.
 *
 * Gesehen setzt die Sammlungsliste nicht: gesehen = auf IMDb bewertet.
 *
 * Zeitstempel für den Filter "Import" (Neu/Geändert): importAddedAt setzt der
 * Import, wenn er einen Eintrag anlegt; importChangedAt, wenn er einen
 * vorhandenen Eintrag spürbar verändert (siehe IMPORT_CHANGE_FIELDS). Was
 * IMDb ohnehin laufend nachzieht - IMDb-Bewertung, Stimmenzahl, Position,
 * Änderungsdatum der Liste - zählt bewusst nicht, sonst wäre nach jedem
 * Import fast alles "geändert".
 */

/** Felder, deren Änderung durch einen Import als "geändert" zählt. */
export const IMPORT_CHANGE_FIELDS = [
  "title", "originalTitle", "year", "directors", "genre", "titleType",
  "yourRating", "seen", "medium", "imdbLists",
];

/** Vergleichswert der relevanten Felder; Listen ohne Rücksicht auf die Reihenfolge. */
const relevantSnapshot = movie => JSON.stringify(IMPORT_CHANGE_FIELDS.map(key =>
  key === "imdbLists" ? [...movie.imdbLists].sort() : key === "seen" ? Boolean(movie.seen) : movie[key]));

/** Setzt importChangedAt, falls sich ein relevantes Feld geändert hat. */
const markChange = (before, after, stamp) =>
  (relevantSnapshot(before) === relevantSnapshot(after) ? after : { ...after, importChangedAt: stamp });

const isIsoDay = value => /^\d{4}-\d{2}-\d{2}/.test(value || "");

/*
 * Stichwörter in der Beschreibung (Groß-/Kleinschreibung egal, Zusätze wie
 * "Steelbook" stören nicht). Bei mehreren gewinnt die höchste Qualität.
 */
const MEDIUM_KEYWORDS = [
  ["UHD Blu-ray", /\b(uhd|4k)\b/i],
  ["Blu-ray", /blu-?\s?ray|\bbd\b/i],
  ["DVD", /\bdvd\b/i],
  ["Digital", /\bdigital\b/i],
];

/**
 * Medium aus der Beschreibung eines Eintrags der Sammlungsliste.
 * @param {string} text - z. B. "UHD Steelbook", "Blu-ray", "DVD".
 * @returns {string} Ein Wert aus MEDIA_TYPES oder "" (kein Medium erkannt).
 */
export function mediumFromDescription(text) {
  return MEDIUM_KEYWORDS.find(([, pattern]) => pattern.test(String(text || "")))?.[0] || "";
}

const MEDIUM_RANK = MEDIUM_KEYWORDS.map(([medium]) => medium);
const better = (a, b) => (!a ? b : !b ? a : MEDIUM_RANK.indexOf(a) <= MEDIUM_RANK.indexOf(b) ? a : b);

/**
 * Schlägt einen Namen für eine Liste vor. Leerer String = der Nutzer muss
 * selbst benennen (z. B. bei nichtssagenden Dateinamen aus dem IMDb-Export).
 * @param {string} fileName
 * @param {"ratings"|"list"} kind
 */
export function suggestListName(fileName, kind) {
  if (kind === "ratings") return "Bewertungen";
  const stem = String(fileName || "").replace(/\.csv$/i, "").trim()
    // Beim erneuten Download derselben Datei hängen Browser/Betriebssystem
    // automatisch "(1)", "(2)", … bzw. "- Kopie" an - das darf beim erneuten
    // Import nicht wie eine andere, neue Liste aussehen.
    .replace(/\s*\(\d+\)$/, "")
    .replace(/\s*-\s*Kopie(?:\s*\(\d+\))?$/i, "")
    .trim();
  if (/watchlist/i.test(stem)) return "Watchlist";
  if (!stem || /^[0-9a-f-]{16,}$/i.test(stem) || /^ls\d+$/i.test(stem)) return "";
  return stem.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Prüft die Listennamen eines geplanten Imports.
 * @param {string[]} names
 * @returns {string} Fehlermeldung oder "" wenn alles passt.
 */
export function validateListNames(names) {
  const cleaned = names.map(name => String(name || "").trim());
  if (cleaned.some(name => !name)) return "Bitte jeder Liste einen Namen geben.";
  const lower = cleaned.map(name => name.toLowerCase());
  if (new Set(lower).size !== lower.length) return "Zwei Dateien haben denselben Listennamen.";
  return "";
}

/**
 * Datenstand eines Imports: der Zeitpunkt der ältesten Datei (= wann sie bei
 * IMDb heruntergeladen wurde). So zählt die Erinnerung ab dem Export, nicht
 * ab dem Import. Unplausible Werte (0, Zukunft) werden ignoriert.
 * @param {number[]} lastModifiedValues - File.lastModified in ms.
 * @param {number} now - aktuelle Zeit in ms.
 * @returns {number} Zeitstempel in ms.
 */
export function dataTimestamp(lastModifiedValues, now) {
  const valid = lastModifiedValues.filter(value => Number.isFinite(value) && value > 0 && value <= now + 60000);
  return valid.length ? Math.min(...valid) : now;
}

/**
 * Führt mehrere IMDb-Listen mit der Sammlung zusammen.
 *
 * - Verknüpft wird über die IMDb-Kennung (tt…), nicht über den Titel.
 * - Leere Felder überschreiben nie vorhandene Werte (die Exporte haben
 *   unterschiedliche Spalten).
 * - Mitgliedschaft: Für jede importierte Liste wird neu bestimmt, welche Filme
 *   darin stehen. Nicht importierte Listen bleiben unberührt.
 * - Es wird nichts gelöscht. Filme, die in keiner Liste mehr stehen, werden
 *   nur gezählt (detached), damit man sie später gezielt aufräumen kann.
 *
 * @param {Array} movies - aktuelle Sammlung.
 * @param {Array<{name: string, movies: Array, isCollection?: boolean, isRatings?: boolean}>} lists - geparste
 *   Listen mit Namen; isCollection markiert eine Liste als eigene (physische) Sammlung,
 *   isRatings den Bewertungs-Export. replaces: Listennamen, die diese Liste ersetzt
 *   (umbenannt) - sie verschwinden bei allen Titeln.
 * @param {number} now - aktuelle Zeit in ms (für neue Einträge ohne Datum und
 *   als Zeitstempel importAddedAt/importChangedAt).
 * @returns {{movies: Array, added: number, updated: number, unchanged: number, detached: number}}
 */
export function mergeImdbLists(movies, lists, now) {
  const current = normalizeMovies(movies);
  const stamp = new Date(now).toISOString();
  const importedNames = new Set([...lists.map(list => list.name), ...lists.flatMap(list => list.replaces || [])]);

  // Pro IMDb-Kennung alles einsammeln, was die Listen wissen
  const incoming = new Map();
  const collectionIds = new Set(); // Titel aus einer als "eigene Sammlung" markierten Liste
  const collectionMedium = new Map(); // IMDb-Kennung → Medium aus der Beschreibung der Sammlungsliste
  const collectionNames = new Set(lists.filter(list => list.isCollection).map(list => list.name));
  const ratingsImported = lists.some(list => list.isRatings);
  const ratedIds = new Set(lists.filter(list => list.isRatings).flatMap(list => list.movies.map(row => row.imdbId)));
  // Bewertung bei IMDb entfernt → im Dashboard ebenfalls weg, Titel ungesehen
  const dropRating = movie => (ratingsImported && movie.imdbId && !ratedIds.has(movie.imdbId) && String(movie.yourRating || "").trim()
    ? { ...movie, yourRating: "", dateRated: "", seen: false }
    : movie);
  for (const list of lists) {
    for (const row of list.movies) {
      const entry = incoming.get(row.imdbId) || { fields: {}, lists: new Set(), created: [] };
      for (const field of IMDB_FIELDS) {
        const value = row[field];
        if (value !== undefined && value !== null && String(value).trim() !== "") entry.fields[field] = String(value).trim();
      }
      if (isIsoDay(row.imdbCreated)) entry.created.push(row.imdbCreated);
      entry.lists.add(list.name);
      incoming.set(row.imdbId, entry);
      if (list.isCollection) {
        collectionIds.add(row.imdbId);
        collectionMedium.set(row.imdbId, better(collectionMedium.get(row.imdbId) || "", mediumFromDescription(row.imdbDescription)));
      }
    }
  }

  const snapshot = movie => JSON.stringify([...IMDB_FIELDS, "imdbLists", "seen", "medium"].map(key => movie[key]));
  const known = new Set();
  let updated = 0;
  let unchanged = 0;
  let detached = 0;

  const merged = current.map(movie => {
    const keptLists = movie.imdbLists.filter(name => !importedNames.has(name));
    const entry = movie.imdbId ? incoming.get(movie.imdbId) : null;
    const wasOwned = movie.imdbLists.some(name => collectionNames.has(name));

    if (!entry) {
      // Nicht in den importierten Listen: Mitgliedschaften bereinigen
      if (movie.imdbLists.length && !keptLists.length) detached++;
      let next = movie;
      // Aus der Sammlung gefallen → kein Medium mehr
      if (keptLists.length !== movie.imdbLists.length) next = { ...movie, imdbLists: keptLists, ...(wasOwned ? { medium: "" } : {}) };
      next = dropRating(next);
      if (next === movie) { unchanged++; return movie; }
      updated++;
      return markChange(movie, next, stamp);
    }

    known.add(movie.imdbId);
    // Von Hand festgelegte Felder (lockedFields) überschreibt der Import nicht
    const updates = Object.fromEntries(Object.entries(entry.fields).filter(([field]) => !movie.lockedFields.includes(field)));
    let next = {
      ...movie,
      ...updates,
      imdbLists: [...new Set([...keptLists, ...entry.lists])],
    };
    // Bewertet = gesehen. Das Datum bleibt das Bewertungsdatum (dateRated) -
    // wann der Titel wirklich gesehen wurde, weiß IMDb nicht
    if (entry.fields.yourRating) next.seen = true;
    if (collectionIds.has(movie.imdbId)) {
      next.medium = collectionMedium.get(movie.imdbId) || ""; // IMDb gewinnt immer
    } else if (wasOwned) {
      next.medium = ""; // aus der Sammlungsliste genommen
    }
    next = dropRating(next);
    if (snapshot(next) === snapshot(movie)) unchanged++; else updated++;
    return markChange(movie, next, stamp);
  });

  let added = 0;
  for (const [imdbId, entry] of incoming) {
    if (known.has(imdbId)) continue;
    const rated = Boolean(entry.fields.yourRating);
    const owned = collectionIds.has(imdbId);
    // "Erfasst am" = wann der Film bei IMDb auf eine Liste kam bzw. bewertet
    // wurde - so stimmt "Neueste Filme" auf der Startseite auch nach Importen.
    const dates = [...entry.created, isIsoDay(entry.fields.dateRated) ? entry.fields.dateRated : null].filter(Boolean).sort();
    merged.push(newMovie({
      ...entry.fields,
      imdbId,
      medium: owned ? collectionMedium.get(imdbId) || "" : "",
      seen: rated,
      imdbLists: [...entry.lists],
      createdAt: dates[0] || stamp,
      importAddedAt: stamp,
    }));
    added++;
  }

  return { movies: merged, added, updated, unchanged, detached };
}

/**
 * Wann ist eine Erinnerung an einen neuen IMDb-Export fällig?
 * @param {{lastImdbImportAt?: string, importReminderDays?: number, importReminderSnoozedUntil?: string}} settings
 * @param {number} now - aktuelle Zeit in ms.
 * @returns {{due: boolean, off: boolean, never: boolean, ageDays: number|null, intervalDays: number}}
 */
export function reminderStatus(settings, now) {
  return ageReminder({
    lastAt: settings.lastImdbImportAt,
    intervalDays: settings.importReminderDays,
    snoozedUntil: settings.importReminderSnoozedUntil,
  }, now);
}

/*
 * "Gesehen mit IMDb abgleichen" (Menü "Mehr"): Gesehen gilt als gesehen,
 * wenn der Titel auf IMDb bewertet ist. Titel, die als gesehen markiert
 * sind, aber keine eigene IMDb-Bewertung haben, lassen sich damit zurücksetzen.
 */

/** Als gesehen markierte Titel ohne eigene IMDb-Bewertung. */
export function seenWithoutRating(movies) {
  return movies.filter(movie => movie.seen && !String(movie.yourRating || "").trim());
}

/**
 * Setzt die genannten Titel auf ungesehen.
 * @param {Array} movies
 * @param {string[]} ids
 * @returns {Array} Neue Liste; das Original bleibt unverändert.
 */
export function markUnseen(movies, ids) {
  const chosen = new Set(ids);
  return movies.map(movie => (chosen.has(movie.id) ? { ...movie, seen: false } : movie));
}

/*
 * "Titel ohne IMDb-Liste aufräumen" (Menü "Mehr"): Titel, die in keiner
 * IMDb-Liste mehr stehen (der Import löscht nie selbst), lassen sich gezielt
 * entfernen. Sie kommen beim nächsten Import nicht zurück.
 */

/** Titel ohne IMDb-Liste (nach Titel sortiert). */
export function moviesWithoutList(movies) {
  return movies.filter(movie => !(movie.imdbLists || []).length)
    .sort((a, b) => (a.title || "").localeCompare(b.title || "", "de"));
}

/**
 * Entfernt die genannten Titel.
 * @param {Array} movies
 * @param {string[]} ids
 * @returns {Array} Neue Liste; das Original bleibt unverändert.
 */
export function removeMovies(movies, ids) {
  const chosen = new Set(ids);
  return movies.filter(movie => !chosen.has(movie.id));
}

/**
 * Erkennt eine exportierte IMDb-Liste am Inhalt statt am Dateinamen (IMDb
 * vergibt zufällige Namen): Vergleicht die Titel der Datei mit den Listen,
 * die das Dashboard schon kennt, und liefert die ähnlichste - wenn sie
 * deutlich übereinstimmt (gemeinsame Titel geteilt durch die größere der
 * beiden Listen - so verkraftet auch eine kleine Watchlist ein paar Änderungen).
 * @param {Array<{imdbId: string}>} rows - Titel der Datei.
 * @param {Array} movies - aktuelle Sammlung.
 * @param {number} [minShare=0.6]
 * @param {{avoid?: string[]}} [options] - Namen, die bei Gleichstand nachrangig sind
 *   (z. B. der automatische Name „Bewertungen“ neben deinem eigenen).
 * @returns {{name: string, share: number}|null}
 */
export function recognizeList(rows, movies, minShare = 0.6, { avoid = [] } = {}) {
  const ids = new Set(rows.map(row => row.imdbId).filter(Boolean));
  if (!ids.size) return null;
  const members = new Map();
  for (const movie of movies) {
    if (!movie.imdbId) continue;
    for (const name of movie.imdbLists || []) {
      if (!members.has(name)) members.set(name, new Set());
      members.get(name).add(movie.imdbId);
    }
  }
  let best = null;
  for (const [name, set] of members) {
    let common = 0;
    for (const id of ids) if (set.has(id)) common++;
    const share = common / Math.max(ids.size, set.size);
    const better = !best || share > best.share + 1e-9
      || (Math.abs(share - best.share) <= 1e-9 && avoid.includes(best.name) && !avoid.includes(name));
    if (better) best = { name, share };
  }
  return best && best.share >= minShare ? best : null;
}
