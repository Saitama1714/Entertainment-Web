import { genresOf } from "./movies-logic.js";

/*
 * „Ähnlich in deiner Sammlung" auf der Detailseite: Titel mit möglichst
 * derselben Genre-Kombination. Ähnlichkeit = Anteil gemeinsamer Genres an
 * allen Genres beider Titel (Jaccard); dieselbe Regie zählt etwas dazu.
 * Bei Gleichstand: deine Bewertung, dann IMDb-Bewertung.
 * Getestet in tests/similar.test.mjs.
 */

const MIN_SCORE = 0.5;   // mindestens die Hälfte der Genres gemeinsam
const DIRECTOR_BONUS = 0.15;

const directorsOf = movie => String(movie.directors || "").split(",").map(name => name.trim().toLowerCase()).filter(Boolean);

/**
 * @param {object} movie - der angezeigte Titel.
 * @param {Array} movies - die ganze Sammlung.
 * @param {{limit?: number}} [options]
 * @returns {Array<{movie: object, score: number, shared: string[]}>}
 */
export function similarMovies(movie, movies, { limit = 8 } = {}) {
  const own = new Set(genresOf(movie));
  if (!own.size) return [];
  const directors = new Set(directorsOf(movie));
  const results = [];
  for (const other of movies) {
    if (other.id === movie.id) continue;
    const theirs = genresOf(other);
    const shared = theirs.filter(name => own.has(name));
    if (!shared.length) continue;
    const union = new Set([...own, ...theirs]).size;
    let score = shared.length / union;
    if (score < MIN_SCORE) continue;
    if (directors.size && directorsOf(other).some(name => directors.has(name))) score += DIRECTOR_BONUS;
    results.push({ movie: other, score, shared });
  }
  const num = value => (Number.isFinite(Number(value)) && String(value).trim() !== "" ? Number(value) : -1);
  results.sort((a, b) => b.score - a.score
    || num(b.movie.yourRating) - num(a.movie.yourRating)
    || num(b.movie.imdbRating) - num(a.movie.imdbRating)
    || String(a.movie.title).localeCompare(String(b.movie.title), "de"));
  return results.slice(0, limit);
}
