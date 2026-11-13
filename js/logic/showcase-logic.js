import { genresOf } from "./movies-logic.js";
import { splitNames, personKey } from "./cast-logic.js";
import { seededRandom } from "./foyer-logic.js";

/*
 * Foyer: Reihe „Kinothek" mit Thema (2.48, Nutzerwahl). Statt zufälliger
 * Plakate gibt es ein Thema aus der eigenen Kinothek - ein Genre, ein
 * Jahrzehnt, eine Regie, die Zehner, „heute vor x Jahren bewertet" … -, das
 * in einem einstellbaren Takt wechselt (jeder neue Tab, jede Stunde, jeden
 * Tag). Damit sich nichts ständig wiederholt:
 *   - kein Thema, das in den letzten Durchgängen schon dran war,
 *   - innerhalb des Themas zuerst Titel, die am längsten nicht im Foyer hingen.
 * Reine Rechnung, getestet in tests/showcase.test.mjs; Zeichnen und Merken
 * in js/ui/home.js.
 */

export const SHOWCASE_TAKT_OPTIONS = [
  { value: "tab", label: "Bei jedem neuen Tab" },
  { value: "hour", label: "Jede Stunde" },
  { value: "day", label: "Einmal am Tag" },
];
export const DEFAULT_SHOWCASE_TAKT = "day";
const MIN_TITLES = 5;        // so viele braucht ein Thema mindestens
const HISTORY = 12;          // so viele zuletzt gezeigte Themen werden gemieden

/** Schlüssel des aktuellen Durchgangs (gleicher Schlüssel → gleiche Reihe). */
export function periodKey(takt, now = new Date(), tabCounter = 0) {
  if (takt === "tab") return `tab-${tabCounter}`;
  const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return takt === "hour" ? `${day}-${now.getHours()}` : day;
}

const yearOf = movie => Number(String(movie.year || "").slice(0, 4)) || 0;
const watchable = movie => !/game|spiel/i.test(String(movie.titleType || ""));

/**
 * Alle Themen, die die Kinothek gerade hergibt.
 * @returns {Array<{id: string, label: string, ids: string[]}>}
 */
export function showcaseThemes(movies, now = new Date()) {
  const list = (movies || []).filter(watchable);
  const themes = [];
  const add = (id, label, items) => { if (items.length >= MIN_TITLES) themes.push({ id, label, ids: items.map(m => m.id) }); };
  const group = keyOf => {
    const map = new Map();
    for (const movie of list) for (const key of [].concat(keyOf(movie) || [])) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(movie);
    }
    return map;
  };
  for (const [genre, items] of group(genresOf)) add(`genre:${genre}`, `Genre: ${genre}`, items);
  for (const [decade, items] of group(m => (yearOf(m) ? `${Math.floor(yearOf(m) / 10) * 10}` : null))) {
    const d = Number(decade);
    add(`decade:${decade}`, d >= 2000 ? `Die ${d}er` : `Die ${String(d).slice(2)}er`, items);
  }
  const names = new Map();
  for (const [key, items] of group(m => splitNames(m.directors).map(name => { const k = personKey(name); names.set(k, name); return k; }))) {
    add(`director:${key}`, `Regie: ${names.get(key)}`, items);
  }
  add("tens", "Deine Zehner", list.filter(m => Number(m.yourRating) === 10));
  add("open", "Noch nicht gesehen", list.filter(m => !m.seen));
  add("uhd", "Im Regal: 4K", list.filter(m => /uhd|4k/i.test(String(m.medium || ""))));
  const md = `-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  add("onthisday", "An diesem Tag bewertet", list.filter(m => String(m.dateRated || "").slice(4, 10) === md && !String(m.dateRated).startsWith(String(now.getFullYear()))));
  return themes;
}

/**
 * Thema und Reihenfolge für einen Durchgang.
 * @param {Array} movies
 * @param {{key: string, history?: string[], shown?: Record<string, number>, count?: number, now?: Date}} options
 *   history: zuletzt gezeigte Themen-IDs (neueste zuletzt); shown: Titel → Zeitpunkt, zuletzt im Foyer.
 * @returns {{theme: {id, label}|null, ids: string[]}}
 */
export function pickShowcase(movies, { key, history = [], shown = {}, count = 16, now = new Date() } = {}) {
  const themes = showcaseThemes(movies, now);
  if (!themes.length) {
    // Zu wenig für ein Thema: einfach die am längsten nicht gezeigten
    const ids = (movies || []).filter(watchable).map(m => m.id);
    return { theme: null, ids: byLeastShown(ids, shown, seededRandom(key)).slice(0, count) };
  }
  const random = seededRandom(key);
  const recent = new Set(history.slice(-HISTORY));
  const fresh = themes.filter(theme => !recent.has(theme.id));
  const pool = fresh.length ? fresh : themes.filter(theme => theme.id !== history[history.length - 1]);
  const choice = (pool.length ? pool : themes)[Math.floor(random() * (pool.length || themes.length))];
  return { theme: { id: choice.id, label: choice.label }, ids: byLeastShown(choice.ids, shown, random).slice(0, count) };
}

/** Am längsten nicht gezeigt zuerst, bei Gleichstand gemischt (fest je Durchgang). */
function byLeastShown(ids, shown, random) {
  return ids
    .map(id => ({ id, last: shown[id] || 0, r: random() }))
    .sort((a, b) => a.last - b.last || a.r - b.r)
    .map(entry => entry.id);
}

/** Gezeigte Titel merken (höchstens 3.000, älteste fallen raus). */
export function rememberShown(shown, ids, now = Date.now()) {
  const next = { ...(shown || {}) };
  for (const id of ids) next[id] = now;
  const keys = Object.keys(next);
  if (keys.length > 3000) keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - 3000).forEach(k => delete next[k]);
  return next;
}
