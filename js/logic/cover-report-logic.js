/*
 * Ergebnis von „Fehlende Cover laden“ als Bericht (Fenster nach dem Lauf,
 * js/ui/cover-report.js): wie viele Cover gerade geladen wurden und welche
 * Titel weiterhin kein Cover haben - nach Grund gruppiert.
 */

const hasCover = movie => Boolean(String(movie.cover || "").trim());
const byTitle = (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "de");

/**
 * @param {object[]} movies - Kinothek nach dem Lauf.
 * @param {{ loaded?: number, failedIds?: string[], triedIds?: string[], fatal?: string }} run
 * @returns {{ loaded: number, fatal: string, total: number, groups: Array<{ key: string, label: string, help: string, movies: object[] }> }}
 */
export function coverReport(movies, { loaded = 0, failedIds = [], triedIds = null, fatal = "" } = {}) {
  const failed = new Set(failedIds);
  const tried = triedIds ? new Set(triedIds) : null;
  const missing = (movies || []).filter(movie => !hasCover(movie)).sort(byTitle);
  const groups = [
    { key: "failed", label: "Fehler beim Laden", help: "Später noch einmal „Fehlende Cover laden“.", movies: missing.filter(m => m.imdbId && failed.has(m.id)) },
    { key: "skipped", label: "Nicht mehr geprüft", help: "Der Lauf wurde abgebrochen – später noch einmal versuchen.", movies: missing.filter(m => m.imdbId && !failed.has(m.id) && tried && !tried.has(m.id)) },
    { key: "omdb", label: "OMDb hat kein Cover", help: "Auf der Detailseite lässt sich unter „Cover ändern“ ein eigenes Bild setzen.", movies: missing.filter(m => m.imdbId && !failed.has(m.id) && (!tried || tried.has(m.id))) },
    { key: "noimdb", label: "Ohne IMDb-Kennung", help: "Diese lädt „Fehlende Cover laden“ nicht – auf der Detailseite „Cover ändern“.", movies: missing.filter(m => !m.imdbId) },
  ].filter(group => group.movies.length);
  return { loaded, fatal, total: missing.length, groups };
}
