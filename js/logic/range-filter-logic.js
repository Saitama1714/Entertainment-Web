/*
 * Filter „Bereiche“ unter Entertainment (2.49): Für jedes Sortier-Kriterium
 * mit Zahlen ein Bereich von … bis (Regler mit zwei Griffen, js/ui/range-filter.js).
 * Hier die reine Rechnung: Grenzen aus der Sammlung, Werte eines Titels,
 * Prüfen, Balken (Verteilung), Schnellwahl und Beschriftung.
 * Gespeichert im Filterzustand als filters.ranges = { year: [1980, 1987], … }.
 * Ein Titel ohne Wert (z. B. ohne eigene Bewertung) fällt heraus, sobald für
 * dieses Kriterium ein Bereich gesetzt ist.
 * Getestet in tests/range-filter.test.mjs.
 */

/** Monatsnummer (Jahr * 12 + Monat - 1) aus einem Datum, oder null. */
export function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ""));
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}
const monthText = index => `${String((index % 12) + 1).padStart(2, "0")}/${Math.floor(index / 12)}`;
const decimal = value => value.toFixed(1).replace(".", ",");
const number = value => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Die Kriterien. step: Rasterweite der Griffe; site: Angabe, die auf der
 * Website veröffentlicht sein muss (js/utils/host.js has()).
 */
export const RANGE_FIELDS = [
  { key: "year", label: "Jahr", step: 1, value: movie => number(movie.year), format: value => String(value) },
  { key: "yourRating", label: "Deine Bewertung", siteLabel: "Meine Bewertung", step: 1, site: "rating", value: movie => number(movie.yourRating), format: value => `${value}★`, fixed: [1, 10] },
  { key: "imdbRating", label: "IMDb-Bewertung", step: 0.1, value: movie => number(movie.imdbRating), format: decimal, fixed: [1, 10] },
  { key: "runtimeMinutes", label: "Laufzeit", step: 5, value: movie => number(movie.runtimeMinutes), format: value => `${value} min` },
  { key: "dateRated", label: "Bewertet am", step: 1, site: "rating", value: movie => monthIndex(movie.dateRated), format: monthText, month: true },
];
export const RANGE_KEYS = RANGE_FIELDS.map(field => field.key);
export const rangeField = key => RANGE_FIELDS.find(field => field.key === key);

const snap = (value, step) => (step < 1 ? Math.round(value * 10) / 10 : Math.round(value / step) * step);

/**
 * Grenzen eines Kriteriums aus der ganzen Sammlung (auf das Raster gerundet).
 * @returns {[number, number]|null} null, wenn kein Titel einen Wert hat.
 */
export function rangeBounds(movies, key) {
  const field = rangeField(key);
  if (field.fixed) {
    const values = movies.map(field.value).filter(value => value !== null);
    if (!values.length) return null;
    if (key === "imdbRating") return [Math.max(1, Math.floor(Math.min(...values))), 10];
    return field.fixed;
  }
  let low = Infinity;
  let high = -Infinity;
  for (const movie of movies) {
    const value = field.value(movie);
    if (value === null) continue;
    if (value < low) low = value;
    if (value > high) high = value;
  }
  if (low === Infinity) return null;
  return [Math.floor(low / field.step) * field.step, Math.ceil(high / field.step) * field.step];
}

/**
 * Bereich in Ordnung bringen: aufs Raster, in die Grenzen, von ≤ bis.
 * Deckt er alles ab, ist er nicht gesetzt.
 * @returns {[number, number]|null}
 */
export function normalizeRange(key, low, high, bounds) {
  const field = rangeField(key);
  if (!field || !bounds || !Number.isFinite(low) || !Number.isFinite(high)) return null;
  let [from, to] = [snap(low, field.step), snap(high, field.step)];
  if (from > to) [from, to] = [to, from];
  from = Math.min(bounds[1], Math.max(bounds[0], from));
  to = Math.min(bounds[1], Math.max(bounds[0], to));
  return from <= bounds[0] && to >= bounds[1] ? null : [from, to];
}

/** Gültige Bereiche aus einem (gespeicherten) Wert; Unbekanntes fällt weg. */
export function readRanges(value) {
  const ranges = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return ranges;
  for (const key of RANGE_KEYS) {
    const range = value[key];
    if (Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)) ranges[key] = range[0] <= range[1] ? [range[0], range[1]] : [range[1], range[0]];
  }
  return ranges;
}

/** Erfüllt ein Titel alle gesetzten Bereiche (außer `ignore`)? */
export function inRanges(movie, ranges, ignore = "") {
  for (const key of RANGE_KEYS) {
    const range = ranges?.[key];
    if (!range || key === ignore) continue;
    const value = rangeField(key).value(movie);
    if (value === null || value < range[0] - 1e-9 || value > range[1] + 1e-9) return false;
  }
  return true;
}

/** Gibt es mindestens einen gesetzten Bereich? */
export const hasRanges = ranges => RANGE_KEYS.some(key => Array.isArray(ranges?.[key]));

/**
 * Verteilung für die Balken über dem Regler.
 * @returns {{count: number, from: number, to: number}[]}
 */
export function rangeHistogram(movies, key, bounds, bins = 24) {
  const field = rangeField(key);
  const span = bounds[1] - bounds[0];
  const count = Math.max(1, Math.min(bins, Math.round(span / field.step) + 1));
  const buckets = Array.from({ length: count }, (_, index) => ({
    count: 0,
    from: bounds[0] + (span * index) / count,
    to: bounds[0] + (span * (index + 1)) / count,
  }));
  if (!span) { buckets[0].count = movies.filter(movie => field.value(movie) !== null).length; return buckets; }
  for (const movie of movies) {
    const value = field.value(movie);
    if (value === null) continue;
    const index = Math.min(count - 1, Math.max(0, Math.floor(((value - bounds[0]) / span) * count)));
    buckets[index].count += 1;
  }
  return buckets;
}

/**
 * Schnellwahl je Kriterium (nur, was in die Grenzen fällt).
 * @param {number} [nowMonth] - aktueller Monat als monthIndex (für „Letzte 12 Monate“).
 * @returns {{label: string, range: [number, number]}[]}
 */
export function rangePresets(key, bounds, nowMonth = monthIndex(new Date().toISOString())) {
  if (!bounds) return [];
  const [low, high] = bounds;
  const list = [];
  if (key === "year") {
    for (let decade = Math.floor(low / 10) * 10; decade <= high; decade += 10) {
      const name = decade >= 2000 ? `${decade}er` : `${String(decade).slice(2)}er`;
      list.push({ label: name, range: [Math.max(low, decade), Math.min(high, decade + 9)] });
    }
    if (list.length > 6) list.splice(0, list.length - 6); // nur die letzten sechs Jahrzehnte als Knopf
  } else if (key === "yourRating") {
    list.push({ label: "Ab 8", range: [8, 10] }, { label: "Nur 10", range: [10, 10] }, { label: "Bis 5", range: [low, 5] });
  } else if (key === "imdbRating") {
    list.push({ label: "Ab 7,0", range: [7, 10] }, { label: "Ab 8,0", range: [8, 10] }, { label: "Unter 6,0", range: [low, 5.9] });
  } else if (key === "runtimeMinutes") {
    list.push({ label: "Bis 90 min", range: [low, 90] }, { label: "Bis 2 Std.", range: [low, 120] }, { label: "Über 2,5 Std.", range: [150, high] });
  } else if (key === "dateRated") {
    const year = Math.floor(high / 12);
    list.push({ label: "Letzte 12 Monate", range: [Math.max(low, Math.min(high, nowMonth) - 11), high] });
    for (let y = year; y > year - 3; y -= 1) list.push({ label: String(y), range: [y * 12, y * 12 + 11] });
  }
  return list
    .filter(preset => preset.range[0] <= preset.range[1] && preset.range[1] >= low && preset.range[0] <= high) // passt nicht zur Sammlung
    .map(preset => ({ ...preset, range: normalizeRange(key, preset.range[0], preset.range[1], bounds) }))
    .filter(preset => preset.range);
}

/** „Jahr: 1980–1987“ für Pille und Knopf. */
export function rangeLabel(key, range, { site = false } = {}) {
  const field = rangeField(key);
  const label = site && field.siteLabel ? field.siteLabel : field.label;
  const [from, to] = range;
  return from === to ? `${label}: ${field.format(from)}` : `${label}: ${field.format(from)} – ${field.format(to)}`;
}

/** Wert für das Eingabefeld (Monate als „2024-03“ für <input type="month">). */
export function rangeInputValue(key, value) {
  const field = rangeField(key);
  if (field.month) return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
  return field.step < 1 ? decimal(value) : String(value);
}

/** Eingabe zurück in eine Zahl (Komma erlaubt), oder null. */
export function parseRangeInput(key, text) {
  if (rangeField(key).month) return monthIndex(text);
  return number(String(text).replace(",", "."));
}
