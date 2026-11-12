import { genresOf } from "./movies-logic.js";
import { creditsOf } from "./cast-logic.js";

/*
 * Suchvorschläge (2.43): Beim Tippen ins Suchfeld klappt eine Liste auf -
 * passende Titel (mit Cover), Personen und Genres, der Treffer markiert.
 * Reine Rechnung, getestet in tests/suggest.test.mjs; die Liste zeichnet
 * js/ui/search-suggest.js.
 */

export const SUGGEST_MIN = 2; // ab so vielen Zeichen

const fold = text => String(text || "").toLocaleLowerCase("de");

/**
 * Wie gut passt ein Text? 3 = beginnt damit, 2 = ein Wort beginnt damit,
 * 1 = steckt irgendwo drin, 0 = gar nicht.
 */
export function matchRank(text, query) {
  const hay = fold(text), needle = fold(query).trim();
  if (!needle) return 0;
  const at = hay.indexOf(needle);
  if (at < 0) return 0;
  if (at === 0) return 3;
  return new RegExp(`(^|[\\s\\-:.,'(„"])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(hay) ? 2 : 1;
}

/**
 * Text in Stücke zerlegen, die Treffer markiert: [{text, hit}].
 * Groß-/Kleinschreibung egal; jeder Treffer wird markiert.
 */
export function matchSegments(text, query) {
  const source = String(text || "");
  const needle = fold(query).trim();
  const hay = fold(source);
  // Ganz selten ändert die Kleinschreibung die Länge (z. B. „İ") - dann lieber unmarkiert
  if (!needle || hay.length !== source.length) return [{ text: source, hit: false }];
  const parts = [];
  let from = 0;
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
    if (at > from) parts.push({ text: source.slice(from, at), hit: false });
    parts.push({ text: source.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < source.length) parts.push({ text: source.slice(from), hit: false });
  return parts.length ? parts : [{ text: source, hit: false }];
}

/**
 * Personen der Sammlung mit ihren Titeln (für die Vorschläge vorab gebaut).
 * @returns {Map<string, {key: string, name: string, ids: string[]}>}
 */
export function peopleIndex(movies, castData) {
  const index = new Map();
  for (const movie of movies || []) {
    for (const credit of creditsOf(movie, castData || {})) {
      if (!index.has(credit.key)) index.set(credit.key, { key: credit.key, name: credit.name, ids: [] });
      index.get(credit.key).ids.push(movie.id);
    }
  }
  return index;
}

const byRank = (a, b) => b.rank - a.rank || b.count - a.count || a.label.localeCompare(b.label, "de");

/**
 * Vorschläge zu einer Eingabe.
 * @param {Array} movies
 * @param {string} query
 * @param {{people?: Map, titles?: number, persons?: number, genres?: number}} [options]
 * @returns {{titles: Array<{movie: object}>, people: Array<{key: string, name: string, ids: string[]}>, genres: Array<{name: string, count: number}>}}
 */
export function suggestions(movies, query, { people = null, titles = 5, persons = 3, genres = 3 } = {}) {
  const empty = { titles: [], people: [], genres: [] };
  if (fold(query).trim().length < SUGGEST_MIN) return empty;

  const titleHits = [];
  const genreCount = new Map();
  for (const movie of movies || []) {
    const rank = Math.max(matchRank(movie.title, query), matchRank(movie.originalTitle, query) - 0.5);
    if (rank > 0) titleHits.push({ movie, rank, count: Number(movie.numVotes) || 0, label: movie.title || "" });
    for (const name of genresOf(movie)) genreCount.set(name, (genreCount.get(name) || 0) + 1);
  }
  const genreHits = [...genreCount]
    .map(([name, count]) => ({ name, count, rank: matchRank(name, query), label: name }))
    .filter(item => item.rank > 0);
  const personHits = [...(people?.values() || [])]
    .map(person => ({ ...person, rank: matchRank(person.name, query), count: person.ids.length, label: person.name }))
    .filter(item => item.rank > 1); // Personen nur bei Namens- oder Wortanfang, sonst rauscht es

  return {
    titles: titleHits.sort(byRank).slice(0, titles).map(({ movie }) => ({ movie })),
    people: personHits.sort(byRank).slice(0, persons).map(({ key, name, ids }) => ({ key, name, ids })),
    genres: genreHits.sort(byRank).slice(0, genres).map(({ name, count }) => ({ name, count })),
  };
}
