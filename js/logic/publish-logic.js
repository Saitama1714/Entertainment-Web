/*
 * Umwandlung: Dashboard-Sicherung → öffentliche Datendatei der Website.
 *
 * Arbeitet mit einer Positivliste: In die Website-Datei kommen nur die hier
 * genannten Felder der Titel. Alles andere aus der Sicherung - OMDb-Schlüssel,
 * Einstellungen, Favoriten, interne Felder - bleibt immer draußen, auch wenn
 * das Dashboard später neue Felder bekommt.
 *
 * 1:1 wie im Dashboard: Jeder Titel wird zuerst genauso aufbereitet wie im
 * Dashboard selbst (newMovie() aus js/collection.js - identisch mit dem
 * Dashboard). Veröffentlicht wird also, was das Dashboard anzeigt, nicht die
 * rohe Sicherung. tests/parity.test.mjs prüft das Feld für Feld.
 *
 * Reine Funktionen, keine DOM-Abhängigkeit (getestet in tests/publish.test.mjs).
 *
 * Gemeinsam mit der Website (gemeinsam.txt), Quelle ist das Dashboard: Die
 * Website nutzt sie im Werkzeug (werkzeug.html), das Dashboard bei der
 * automatischen Sicherung (js/ui/auto-backup.js), die sammlung.json gleich
 * mit erzeugt.
 */
import { newMovie } from "../collection.js";

/** Diese Felder sind immer dabei (öffentliche Angaben von IMDb plus Cover). */
export const BASE_FIELDS = [
  "id", "createdAt", "title", "originalTitle", "year", "titleType", "genre",
  "directors", "runtimeMinutes", "releaseDate", "imdbRating", "numVotes",
  "imdbUrl", "imdbId", "imdbDescription", "cover",
  "imdbCreated", "imdbModified", "position",
  // Wann der IMDb-Import den Titel angelegt/verändert hat (Filter "Import")
  "importAddedAt", "importChangedAt",
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

/**
 * Links unverändert übernehmen, aber nur echte Web-Adressen (Cover zusätzlich
 * eingebettete Bilder) - keine javascript:-Links o. Ä. auf einer öffentlichen
 * Seite. Im Dashboard würde so ein Cover ohnehin nur als Platzhalter erscheinen.
 */
function safeLink(field, value) {
  const text = String(value).trim();
  if (field === "cover" && /^data:image\//i.test(text)) return String(value);
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? String(value) : "";
  } catch {
    return "";
  }
}

/**
 * Ein Titel, reduziert auf die erlaubten Felder - nach der Aufbereitung des
 * Dashboards. Leere Textfelder entfallen (die Website ergänzt sie wieder als
 * leer); Medium, Gesehen und Listen stehen immer drin, weil dort „leer" bzw.
 * „fehlt" etwas anderes bedeuten könnte.
 */
function publicMovie(raw, fields) {
  const movie = newMovie(raw);
  const out = {};
  for (const field of fields) {
    const value = movie[field];
    if (field === "seen" || field === "medium" || field === "imdbLists") { out[field] = value; continue; }
    if (value === "") continue;
    if (field === "cover" || field === "imdbUrl") {
      const link = safeLink(field, value);
      if (link) out[field] = link;
      continue;
    }
    out[field] = value;
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
  // Wie im Dashboard: jeder Eintrag zählt, auch einer ohne Titel
  return movies.filter(movie => movie && typeof movie === "object" && !Array.isArray(movie));
}

/**
 * Baut die Datendatei der Website.
 * @param {object} backup - Inhalt der Sicherungsdatei.
 * @param {Object<string, boolean>} [options] - Häkchen je OPTIONAL_GROUPS-Schlüssel.
 * @param {{now?: Date, access?: {salt: string, hash: string}|null}} [context] - access:
 *   Prüfwert des Passworts (js/logic/access-logic.js), null = ohne Passwort.
 * @returns {{version: 1, generatedAt: string, exportedAt: string, include: string[], importWindowDays: number, decor: string, movies: object[], access?: object}}
 */
export function buildPublicData(backup, options = defaultOptions(), { now = new Date(), access = null } = {}) {
  const movies = readBackup(backup);
  const include = OPTIONAL_GROUPS.filter(group => options[group.key]).map(group => group.key);
  const fields = [...BASE_FIELDS, ...OPTIONAL_GROUPS.filter(group => options[group.key]).flatMap(group => group.fields)];
  return {
    version: 1,
    generatedAt: now.toISOString(),
    exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : "",
    include,
    // Zeitraum des Filters "Import" wie im Dashboard eingestellt (Standard 28 Tage)
    importWindowDays: Number(backup.data.importWindowDays) > 0 ? Number(backup.data.importWindowDays) : 28,
    // Dekoration unten links wie im Dashboard gewählt (Name aus CURTAIN_ICONS, "none" = keine)
    decor: typeof backup.data.curtainIcon === "string" ? backup.data.curtainIcon : "",
    movies: movies.map(movie => publicMovie(movie, fields)),
    // Nur der Prüfwert, nie das Passwort selbst
    ...(access ? { access: { salt: access.salt, hash: access.hash } } : {}),
  };
}

/** Kurze Zusammenfassung für das Werkzeug: Anzahl, mit/ohne Cover, Auswahl. */
export function summarize(data) {
  const withCover = data.movies.filter(movie => movie.cover).length;
  const labels = OPTIONAL_GROUPS.filter(group => data.include.includes(group.key)).map(group => group.label);
  return { total: data.movies.length, withCover, labels };
}
