import { KIND_FILTER_OPTIONS, SEEN_FILTER_OPTIONS, MEDIA_FILTER_OPTIONS, emptyFilters } from "./movies-logic.js";

/*
 * Filter merken (2.43): Eine Filterkombination, die man oft braucht, wird
 * zum Schnellfilter über der Filterleiste - ein Klick setzt sie wieder.
 * Gemerkt werden nur die Gruppen, die dauerhaft gleich bleiben (Art, Genre,
 * Medium, Status, Liste, Schnittmenge); „Import" (ändert sich mit der Zeit)
 * und die Titel einer Person (feste Kennungen) nicht. Gespeichert in
 * chrome.storage („savedFilters"), nur im Dashboard.
 * Getestet in tests/saved-filters.test.mjs.
 */

export const SAVABLE = ["seen", "kind", "media", "genres", "lists", "genresAll"]; // Reihenfolge = Reihenfolge im Namen
export const MAX_SAVED = 8;
const NAME_MAX = 48;

const labelOf = (options, value) => options.find(option => option.value === value)?.label ?? value;
const LABELS = {
  seen: value => labelOf(SEEN_FILTER_OPTIONS, value),
  kind: value => labelOf(KIND_FILTER_OPTIONS, value),
  media: value => labelOf(MEDIA_FILTER_OPTIONS, value),
  genres: value => value,
  lists: value => value,
};

/** Nur die merkbaren Gruppen mit Auswahl, Werte sortiert (für den Vergleich). */
export function savablePart(filters) {
  const part = {};
  for (const key of SAVABLE) {
    const values = Array.isArray(filters?.[key]) ? filters[key].filter(value => typeof value === "string") : [];
    if (values.length) part[key] = [...new Set(values)].sort((a, b) => a.localeCompare(b, "de"));
  }
  return part;
}

/** Gibt es etwas zu merken? */
export const canSave = filters => Object.keys(savablePart(filters)).length > 0;

/** Gleiche Auswahl (Reihenfolge egal)? */
export const sameFilters = (a, b) => JSON.stringify(savablePart(a)) === JSON.stringify(savablePart(b));

/** Name aus der Auswahl: „Offen · Film · Blu-ray". */
export function filterName(filters) {
  const part = savablePart(filters);
  const pieces = [];
  for (const key of SAVABLE) {
    if (!part[key]) continue;
    if (key === "genresAll") pieces.push(part[key].join(" + "));
    else pieces.push(part[key].map(LABELS[key]).join(" / "));
  }
  const name = pieces.join(" · ");
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1).trimEnd()}…` : name;
}

/** Gespeicherte Liste lesen; Kaputtes fällt weg. */
export function readSaved(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(entry => entry && typeof entry.id === "string" && typeof entry.name === "string" && canSave(entry.filters))
    .map(entry => ({ id: entry.id, name: entry.name, filters: savablePart(entry.filters) }))
    .slice(0, MAX_SAVED);
}

/**
 * Aktuelle Auswahl merken. Schon vorhanden oder nichts zu merken: Liste bleibt.
 * Ist die Liste voll, fällt der älteste heraus.
 * @returns {{list: Array, entry: object|null, added: boolean}}
 */
export function addSaved(list, filters, { id = `f${Date.now().toString(36)}` } = {}) {
  if (!canSave(filters)) return { list, entry: null, added: false };
  const existing = list.find(entry => sameFilters(entry.filters, filters));
  if (existing) return { list, entry: existing, added: false };
  const entry = { id, name: filterName(filters), filters: savablePart(filters) };
  return { list: [...list, entry].slice(-MAX_SAVED), entry, added: true };
}

export const removeSaved = (list, id) => list.filter(entry => entry.id !== id);

/** Schnellfilter anwenden: genau diese Auswahl, alles andere leer. */
export const applySaved = entry => ({ ...emptyFilters(), ...savablePart(entry.filters) });
