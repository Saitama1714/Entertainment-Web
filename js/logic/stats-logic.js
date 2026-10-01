import { titleKind } from "./movies-logic.js";

/**
 * Zahlen und Zufallsauswahl für die Statistik-Kachel auf der Startseite.
 * Reine Funktionen, keine DOM-Abhängigkeit.
 */

/** Gesamt/Gesehen/Offen-Zahlen für die Sammlung. */
export function collectionStats(movies) {
  const seen = movies.filter(movie => movie.seen).length;
  return { total: movies.length, seen, unseen: movies.length - seen };
}

/**
 * Wählt bis zu `count` zufällige noch ungesehene Filme aus.
 * Meidet dabei, wenn möglich, die in `exclude` genannten IDs (z. B. die
 * gerade angezeigten), damit "Neu mischen" wirklich etwas Neues zeigt -
 * reicht der Vorrat nicht aus, werden sie doch wieder einbezogen, statt
 * weniger Vorschläge zu zeigen.
 * @param {Array} movies
 * @param {number} count
 * @param {{exclude?: string[], kind?: string, rng?: Function}} [options] - kind
 *   beschränkt auf eine Art (siehe titleKind, leer = alle); rng liefert
 *   Zufallszahlen in [0, 1); Test-Code kann hier eine feste Folge einsetzen.
 * @returns {Array}
 */
export function pickRandomUnseen(movies, count, { exclude = [], kind = "", rng = Math.random } = {}) {
  const unseen = movies.filter(movie => !movie.seen && (!kind || titleKind(movie) === kind));
  const excludeSet = new Set(exclude);
  const fresh = unseen.filter(movie => !excludeSet.has(movie.id));
  const pool = fresh.length >= count ? fresh : unseen;

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
