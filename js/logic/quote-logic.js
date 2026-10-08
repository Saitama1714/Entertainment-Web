/*
 * Reine Logik für das "Filmzitat des Tages" auf der Startseite. Die Zitate
 * selbst stehen in data/movie-quotes.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wählt das Zitat des Tages: über den Kalendertag (lokale Zeitzone), damit
 * es sich innerhalb eines Tages nie ändert (kein Wechsel bei jedem neuen
 * Tab) und die Liste ohne Wiederholung einmal komplett durchläuft, bevor sie
 * von vorn beginnt.
 * @param {Array<{quote: string, source: string}>} quotes
 * @param {Date} [date] - Standard: jetzt.
 * @returns {{quote: string, source: string}|null} null, wenn quotes leer ist.
 */
export function quoteOfDay(quotes, date = new Date()) {
  if (!quotes.length) return null;
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayIndex = Math.floor(utcMidnight / DAY_MS);
  const index = ((dayIndex % quotes.length) + quotes.length) % quotes.length;
  return quotes[index];
}
