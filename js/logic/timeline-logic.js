/*
 * Zeitleiste unter Entertainment (Registerkarte „Zeitleiste"): reine
 * Rechenfunktionen ohne DOM - welche Zeitpunkte ein Titel hat, welcher
 * Ausschnitt der Achse zu sehen ist, wie die Striche gestapelt werden und wie
 * der Abstand zwischen Erscheinen und Bewertung als Text lautet. Die
 * Oberfläche dazu steht in js/ui/timeline.js.
 *
 * Zwei Ansichten (Modus):
 *   "rated"   - wann du den Titel auf IMDb bewertet hast (dateRated)
 *   "release" - wann er erschienen ist (releaseDate, sonst nur das Jahr)
 */

const DAY_MS = 86400000;
const YEAR_MS = 365.2425 * DAY_MS;

export const TIMELINE_MODES = [
  { value: "release", label: "Erschienen" },
  { value: "rated", label: "Bewertet" },
];
export const DEFAULT_TIMELINE_MODE = "rated";

/**
 * Liest ein Tagesdatum (IMDb schreibt „2024-03-01", auch ISO mit Uhrzeit)
 * als Zeitpunkt in UTC.
 * @param {string} value
 * @returns {number|null} Millisekunden oder null.
 */
export function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

/**
 * Wann ein Titel erschienen ist. Ohne genaues Datum zählt die Mitte des
 * Jahres (`approx: true`) - dann nennt die Oberfläche den Abstand nur in
 * Jahren.
 * @param {{releaseDate?: string, year?: string}} movie
 * @returns {{time: number, approx: boolean}|null}
 */
export function releaseInfo(movie) {
  const exact = parseDay(movie.releaseDate);
  if (exact !== null) return { time: exact, approx: false };
  const year = Number.parseInt(movie.year, 10);
  return Number.isFinite(year) && year > 1800 ? { time: Date.UTC(year, 6, 1), approx: true } : null;
}

/**
 * Wann du den Titel bewertet hast (IMDb-Bewertungsdatum).
 * @param {{dateRated?: string}} movie
 * @returns {number|null}
 */
export const ratedTime = movie => parseDay(movie.dateRated);

/** Zeitpunkt eines Titels in der gewählten Ansicht, oder null. */
export function timeOf(movie, mode) {
  return mode === "release" ? releaseInfo(movie)?.time ?? null : ratedTime(movie);
}

/**
 * Titel, die in der Ansicht einen Zeitpunkt haben, aufsteigend nach Zeit
 * (bei Gleichstand nach Titel), dazu die Zahl der übrigen (für den Hinweis
 * „12 Titel noch nicht bewertet").
 * @param {Array} movies - bereits gesucht und gefiltert.
 * @param {"rated"|"release"} mode
 * @returns {{entries: Array<{movie: object, time: number}>, missing: number}}
 */
export function timelineEntries(movies, mode) {
  const entries = [];
  for (const movie of movies) {
    const time = timeOf(movie, mode);
    if (time !== null) entries.push({ movie, time });
  }
  entries.sort((a, b) => a.time - b.time || String(a.movie.title || "").localeCompare(String(b.movie.title || ""), "de"));
  return { entries, missing: movies.length - entries.length };
}

/**
 * Sichtbarer Ausschnitt der Achse: von der frühesten bis zur spätesten
 * Markierung (mit etwas Rand). Ist ein Titel ausgewählt, reicht der
 * Ausschnitt so weit, dass Erscheinen und Bewertung beide zu sehen sind.
 * @param {Array<{time: number}>} entries
 * @param {{from: number, to: number}|null} [span] - Zeitspanne des ausgewählten Titels.
 * @returns {[number, number]} Start und Ende in ms.
 */
export function timelineDomain(entries, span = null) {
  const times = entries.map(entry => entry.time);
  if (span) times.push(span.from, span.to);
  if (!times.length) {
    const now = Date.now();
    return [now - YEAR_MS, now + YEAR_MS / 12];
  }
  let start = Math.min(...times);
  let end = Math.max(...times);
  if (end - start < YEAR_MS / 2) {
    const middle = (start + end) / 2;
    start = middle - YEAR_MS / 4;
    end = middle + YEAR_MS / 4;
  }
  const pad = Math.max((end - start) * 0.03, 20 * DAY_MS);
  return [start - pad, end + pad];
}

/**
 * Beschriftung der Achse: ganze Jahre in einer Schrittweite, die zur Breite
 * passt (etwa alle 80 px eine Marke); bei kurzen Zeiträumen Monate.
 * @param {[number, number]} domain
 * @param {number} width - Breite der Achse in Pixeln.
 * @returns {Array<{time: number, label: string, major: boolean}>}
 */
export function axisTicks([start, end], width) {
  const room = Math.max(2, Math.floor(width / 80));
  const years = (end - start) / YEAR_MS;
  const ticks = [];
  if (years >= 2) {
    const step = [1, 2, 5, 10, 20, 25, 50, 100].find(candidate => years / candidate <= room) || 100;
    const first = Math.ceil(new Date(start).getUTCFullYear() / step) * step;
    for (let year = first; ; year += step) {
      const time = Date.UTC(year, 0, 1);
      if (time > end) break;
      if (time >= start) ticks.push({ time, label: String(year), major: true });
    }
    return ticks;
  }
  const months = years * 12;
  const step = [1, 2, 3, 6].find(candidate => months / candidate <= room) || 6;
  const begin = new Date(start);
  let year = begin.getUTCFullYear();
  let month = Math.ceil(begin.getUTCMonth() / step) * step;
  for (;;) {
    year += Math.floor(month / 12);
    month %= 12;
    const time = Date.UTC(year, month, 1);
    if (time > end) break;
    if (time >= start) {
      const label = month === 0
        ? String(year)
        : new Date(time).toLocaleDateString("de-DE", { month: "short", timeZone: "UTC" });
      ticks.push({ time, label, major: month === 0 });
    }
    month += step;
  }
  return ticks;
}

/**
 * Stapelt Striche, die zu dicht beieinander liegen: abwechselnd oberhalb
 * und unterhalb der Achse, und mit jedem weiteren eine Stufe weiter außen.
 * So bleibt jeder Titel sichtbar, und dichte Zeiträume wachsen in die Höhe.
 * @param {number[]} xs - Positionen in Pixeln (in beliebiger Reihenfolge).
 * @param {number} [gap=5] - Mindestabstand in Pixeln, ab dem nicht gestapelt wird.
 * @returns {Array<{side: -1|1, level: number}>} Je Eingabe: oben (-1) / unten (1) und Stufe ab 0.
 */
export function stackMarks(xs, gap = 5) {
  const counts = new Map();
  return xs.map(x => {
    const bin = Math.round(x / gap);
    const count = (counts.get(bin) || 0) + 1;
    counts.set(bin, count);
    return { side: count % 2 ? -1 : 1, level: Math.floor((count - 1) / 2) };
  });
}

/** Abstand in ganzen Kalendermonaten (angefangene zählen nicht). */
function wholeMonths(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

const unit = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Abstand zwischen zwei Zeitpunkten als Text: „3 Jahre, 2 Monate",
 * „5 Monate", „12 Tage", „am selben Tag". Ist der Anfang nur ein Jahr
 * (`approx`), wird auf ganze Jahre gerundet („rund 14 Jahre").
 * @param {number} from - Erscheinen.
 * @param {number} to - Bewertung.
 * @param {{approx?: boolean}} [options]
 * @returns {{text: string, before: boolean}} before = Bewertung lag vor dem Erscheinen
 *   (z. B. Festival- oder Pressevorführung).
 */
export function formatGap(from, to, { approx = false } = {}) {
  const before = to < from;
  const [start, end] = before ? [to, from] : [from, to];
  if (approx) {
    const years = Math.round((end - start) / YEAR_MS);
    return { text: years < 1 ? "im selben Jahr" : `rund ${unit(years, "Jahr", "Jahre")}`, before };
  }
  const months = wholeMonths(start, end);
  if (months < 1) {
    const days = Math.round((end - start) / DAY_MS);
    return { text: days === 0 ? "am selben Tag" : unit(days, "Tag", "Tage"), before };
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(unit(years, "Jahr", "Jahre"));
  if (rest) parts.push(unit(rest, "Monat", "Monate"));
  return { text: parts.join(", "), before };
}

/**
 * Zeitspanne eines Titels von Erscheinen bis Bewertung (für Balken und
 * Achsen-Ausschnitt), oder null, wenn eines der beiden Daten fehlt.
 * @param {object} movie
 * @returns {{from: number, to: number, approx: boolean}|null}
 */
export function movieSpan(movie) {
  const release = releaseInfo(movie);
  const rated = ratedTime(movie);
  return release && rated !== null ? { from: release.time, to: rated, approx: release.approx } : null;
}

/**
 * Index des Eintrags, dessen Zeitpunkt `time` am nächsten liegt (für den
 * Wechsel der Ansicht oder geänderte Filter, wenn der bisherige Titel fehlt).
 * @param {Array<{time: number}>} entries - aufsteigend sortiert.
 * @param {number} time
 * @returns {number} -1 bei leerer Liste.
 */
export function nearestIndex(entries, time) {
  let best = -1;
  let bestDistance = Infinity;
  entries.forEach((entry, index) => {
    const distance = Math.abs(entry.time - time);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}
