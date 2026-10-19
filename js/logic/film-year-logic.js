/*
 * „Dein Filmjahr" (Registerkarte „Filmjahr" unter Entertainment): ein
 * Jahresrückblick in Karten, berechnet aus dem Bewertungsdatum des
 * IMDb-Exports. „Gesehen" heißt hier „in diesem Jahr bewertet".
 *
 * Hier stehen nur die Zahlen und Funde je Karte - die Texte schreibt
 * js/ui/film-year.js (Dashboard „du", Website „ich"). Eine Karte, für die
 * die Daten nicht reichen, fällt einfach weg. Getestet in tests/film-year.test.mjs.
 */
import { genresOf, titleKind } from "./movies-logic.js";
import { ownScore, countriesDe, languagesDe } from "./detail-logic.js";
import { runtimeOf } from "./tonight-logic.js";
import { creditsOf, splitNames, personKey } from "./cast-logic.js";

/** Reihenfolge der Karten; die Oberfläche teilt sie in fünf Akte. */
export const CARD_ORDER = [
  "opening", "numbers",
  "weekday", "month", "streak", "longest",
  "genre", "decades", "world", "people", "series",
  "surprise", "letdown", "gem", "shelf", "top",
  "type", "poster",
];

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** Bewertungstag als {y, m (1–12), d, day (Tageszahl), weekday (0 = Montag)} oder null. */
export function ratedDay(movie) {
  const match = String(movie.dateRated || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d, day: Math.round(time / 864e5), weekday: (date.getUTCDay() + 6) % 7 };
}

/** Bewertet = Bewertungsdatum und eigene Note 1–10. */
const ratedEntries = movies => movies
  .map(movie => ({ movie, when: ratedDay(movie), score: ownScore(movie) }))
  .filter(entry => entry.when && entry.score !== null);

/**
 * Jahre mit Bewertungen, neuestes zuerst.
 * @returns {Array<{year: number, count: number}>}
 */
export function ratedYears(movies) {
  const counts = new Map();
  for (const { when } of ratedEntries(movies)) counts.set(when.y, (counts.get(when.y) || 0) + 1);
  return [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year);
}

/** Welches Jahr zuerst: das laufende, wenn es schon Bewertungen hat, sonst das neueste. */
export function defaultYear(years, today = new Date()) {
  const now = today.getFullYear();
  return years.find(entry => entry.year === now)?.year ?? years[0]?.year ?? null;
}

const num = value => {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const votesOf = movie => {
  const n = Number(String(movie.numVotes ?? "").replace(/[^\d]/g, ""));
  return n > 0 ? n : null;
};
const avg = list => (list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : null);
const byDate = (a, b) => a.when.day - b.when.day || String(a.movie.title).localeCompare(String(b.movie.title), "de");
/** Häufigste Werte zuerst, bei Gleichstand alphabetisch. */
const ranked = counts => [...counts].map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
const tally = (entries, keysOf) => {
  const counts = new Map();
  for (const entry of entries) for (const key of keysOf(entry)) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
};
const pick = ({ movie, score, when }) => ({ id: movie.id, title: movie.title || "", year: movie.year || "", score, cover: typeof movie.cover === "string" ? movie.cover.trim() : "", date: when });

/**
 * Längste Strecke an aufeinanderfolgenden Tagen mit mindestens einer
 * Bewertung: {length, runs: [[Tag, …], …]} - alle Strecken dieser Länge.
 */
export function longestStreak(days) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0, runs = [], start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
    const run = sorted.slice(start, i);
    if (run.length > best) { best = run.length; runs = [run]; } else if (run.length === best) runs.push(run);
    start = i;
  }
  return { length: best, runs };
}

/*
 * „Dein Filmtyp": Vorsilbe aus dem Lieblingstag, Hauptwort aus dem
 * Top-Genre - „Der Sonntags-Cineast", „Der Feierabend-Gruselkenner".
 */
const TYPE_NOUNS = {
  Drama: "Cineast", Thriller: "Nervenkitzel-Jäger", Komödie: "Spaßvogel", Action: "Actionheld", Abenteuer: "Abenteurer",
  Krimi: "Kommissar", "Science-Fiction": "Sternengucker", Mystery: "Rätselknacker", Fantasy: "Drachenreiter",
  Familienfilm: "Familienmensch", Horror: "Gruselkenner", Liebesfilm: "Romantiker", Animation: "Trickfilmfreund",
  Biografie: "Lebenslauf-Leser", Kriegsfilm: "Stratege", Musical: "Mitsinger", Geschichte: "Zeitreisende",
  Sportfilm: "Sofasportler", Musikfilm: "Ohrwurmfänger", Dokumentarfilm: "Besserwisser", Western: "Revolverheld",
};
const TYPE_PREFIX = { 4: "Freitags-", 5: "Samstags-", 6: "Sonntags-" };

/**
 * Filmtyp aus den Funden des Jahres.
 * @returns {{name: string, prefix: string, noun: string, traits: {day: number|null, genre: string, decade: number|null, recent: boolean, critic: "mild"|"strict"|"fair"|null}}}
 */
export function filmType({ weekdayCounts, total, topGenre, topDecade, latestDecade, belowShare }) {
  const max = Math.max(...weekdayCounts);
  const day = total >= 5 && max >= total * 0.25 ? weekdayCounts.indexOf(max) : null;
  const weekendShare = (weekdayCounts[4] + weekdayCounts[5] + weekdayCounts[6]) / Math.max(1, total);
  const prefix = day !== null && TYPE_PREFIX[day] ? TYPE_PREFIX[day]
    : total >= 5 && weekendShare < 0.3 ? "Feierabend-"
    : total >= 150 ? "Dauer-"
    : "";
  const noun = TYPE_NOUNS[topGenre] || "Cineast";
  const critic = belowShare === null ? null : belowShare < 0.3 ? "mild" : belowShare > 0.6 ? "strict" : "fair";
  return {
    name: `Der ${prefix}${noun}`, prefix, noun,
    traits: { day, genre: topGenre || "", decade: topDecade, recent: topDecade !== null && topDecade === latestDecade, critic },
  };
}

/**
 * Rückblick auf ein Jahr.
 * @param {Array} movies
 * @param {Object} castData - Besetzung und OMDb-Angaben (darf leer sein)
 * @param {number} year
 * @param {{today?: Date, media?: boolean}} [options] - media: Medium veröffentlicht/vorhanden
 * @returns {{year: number, partial: boolean, count: number, cards: Array<{id: string}>}}
 */
export function yearRecap(movies, castData, year, { today = new Date(), media = true } = {}) {
  const all = ratedEntries(movies);
  const entries = all.filter(entry => entry.when.y === year).sort(byDate);
  const partial = year === today.getFullYear();
  const count = entries.length;
  const cards = [];
  if (!count) return { year, partial, count, cards };
  const add = card => cards.push(card);

  const films = entries.filter(entry => titleKind(entry.movie) === "film");
  const series = entries.filter(entry => titleKind(entry.movie) === "series");
  const timed = films.map(entry => ({ ...entry, minutes: runtimeOf(entry.movie) })).filter(entry => entry.minutes);
  const filmMinutes = timed.reduce((sum, entry) => sum + entry.minutes, 0);
  const scores = entries.map(entry => entry.score);
  const average = avg(scores);
  const before = all.filter(entry => entry.when.y === year - 1).map(entry => entry.score);
  const distribution = Array.from({ length: 10 }, (_, i) => scores.filter(score => score === i + 1).length);
  const weekdayCounts = Array.from({ length: 7 }, (_, i) => entries.filter(entry => entry.when.weekday === i).length);
  const monthCounts = Array.from({ length: 12 }, (_, i) => entries.filter(entry => entry.when.m === i + 1).length);
  const genres = ranked(tally(entries, entry => genresOf(entry.movie)));
  const withYear = entries.map(entry => ({ ...entry, made: Number.parseInt(entry.movie.year, 10) })).filter(entry => entry.made > 1800);
  const decadeCounts = tally(withYear, entry => [Math.floor(entry.made / 10) * 10]);
  const imdbDiffs = entries.map(entry => ({ ...entry, imdb: num(entry.movie.imdbRating) })).filter(entry => entry.imdb !== null)
    .map(entry => ({ ...entry, diff: Math.round((entry.score - entry.imdb) * 10) / 10 }));
  const below = imdbDiffs.filter(entry => entry.diff < 0).length;
  const belowShare = imdbDiffs.length >= 5 ? below / imdbDiffs.length : null;

  // I · Dein Jahr
  add({ id: "opening", count, filmMinutes, topWeekday: null });
  add({
    id: "numbers", count, films: films.length, series: series.length, other: count - films.length - series.length,
    filmMinutes, filmsTimed: timed.length, average, previous: before.length >= 3 ? avg(before) : null,
    distribution, mode: distribution.indexOf(Math.max(...distribution)) + 1,
  });

  // II · Gewohnheiten
  if (count >= 5) {
    const top = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const workdays = weekdayCounts.slice(0, 5);
    const low = weekdayCounts.indexOf(Math.min(...weekdayCounts));
    cards[0].topWeekday = top;
    add({ id: "weekday", counts: weekdayCounts, top, topCount: weekdayCounts[top], low, lowCount: weekdayCounts[low], workdayAverage: avg(workdays), count });
  }
  const months = partial ? today.getMonth() + 1 : 12;
  if (count >= 5) {
    const top = monthCounts.indexOf(Math.max(...monthCounts));
    const inTop = entries.filter(entry => entry.when.m === top + 1);
    const active = monthCounts.slice(0, months);
    const lowest = Math.min(...active);
    add({
      id: "month", counts: monthCounts, months, top, topCount: monthCounts[top],
      first: pick(inTop[0]), last: pick(inTop[inTop.length - 1]),
      quiet: active.map((n, i) => (n === lowest ? i : -1)).filter(i => i >= 0), quietCount: lowest,
    });
  }
  const streak = longestStreak(entries.map(entry => entry.when.day));
  if (streak.length >= 2) {
    const run = streak.runs[0];
    add({
      id: "streak", length: streak.length, times: streak.runs.length,
      days: run.slice(0, 5).map(day => pick(entries.find(entry => entry.when.day === day))),
      otherMonths: [...new Set(streak.runs.slice(1).map(r => entries.find(entry => entry.when.day === r[0]).when.m))],
    });
  }
  const feature = timed.filter(entry => entry.minutes >= 40); // Kurzfilme zählen nicht als „kürzester Abend"
  if (feature.length >= 2) {
    const sorted = [...feature].sort((a, b) => b.minutes - a.minutes || String(a.movie.title).localeCompare(String(b.movie.title), "de"));
    const longest = sorted[0], shortest = sorted[sorted.length - 1];
    if (longest.minutes > shortest.minutes) add({ id: "longest", longest: { ...pick(longest), minutes: longest.minutes }, shortest: { ...pick(shortest), minutes: shortest.minutes }, average: feature.reduce((sum, entry) => sum + entry.minutes, 0) / feature.length });
  }

  // III · Geschmack
  if (genres.length) add({ id: "genre", top: genres[0], list: genres.slice(0, 6), count });
  if (withYear.length >= 3) {
    const decades = [...decadeCounts.keys()];
    const from = Math.min(...decades), to = Math.max(...decades);
    const list = [];
    for (let d = from; d <= to; d += 10) list.push({ decade: d, count: decadeCounts.get(d) || 0 });
    const top = list.reduce((best, entry) => (entry.count > best.count ? entry : best));
    const oldest = [...withYear].sort((a, b) => a.made - b.made || byDate(a, b))[0];
    add({ id: "decades", list, top, latest: to, oldest: { ...pick(oldest), made: oldest.made }, total: withYear.length });
  }
  const omdb = entries.map(entry => castData?.[String(entry.movie.imdbId || "").trim()]).filter(Boolean);
  const withCountry = omdb.filter(entry => Array.isArray(entry.c) && entry.c.length);
  if (withCountry.length >= 3) {
    const countries = ranked(tally(withCountry, entry => countriesDe(entry.c)));
    const languages = ranked(tally(omdb.filter(entry => Array.isArray(entry.l) && entry.l.length), entry => languagesDe(entry.l)));
    const once = countries.filter(entry => entry.count === 1).map(entry => entry.name).sort((a, b) => a.localeCompare(b, "de"));
    add({ id: "world", countries: countries.slice(0, 5), countryCount: countries.length, languages: languages.slice(0, 4), languageCount: languages.length, once: once[0] || "", titles: withCountry.length });
  }
  const roles = { dir: new Map(), act: new Map(), wri: new Map() };
  for (const entry of entries) {
    const credits = creditsOf(entry.movie, castData || {});
    const list = credits.length ? credits : splitNames(entry.movie.directors).map(name => ({ key: personKey(name), name, roles: new Set(["dir"]) }));
    for (const credit of list) for (const role of credit.roles) {
      const map = roles[role];
      if (!map) continue;
      if (!map.has(credit.key)) map.set(credit.key, { name: credit.name, titles: [] });
      map.get(credit.key).titles.push(entry.movie.title || "");
    }
  }
  const leader = role => [...roles[role].values()].filter(person => person.titles.length >= 2)
    .sort((a, b) => b.titles.length - a.titles.length || a.name.localeCompare(b.name, "de"))[0] || null;
  const people = { dir: leader("dir"), act: leader("act"), wri: leader("wri") };
  if (people.dir || people.act || people.wri) add({ id: "people", ...people });
  if (series.length) {
    const list = [...series].sort((a, b) => b.score - a.score || byDate(a, b)).map(pick);
    add({ id: "series", count: series.length, list: list.slice(0, 5), best: list[0] });
  }

  // IV · Höhepunkte
  const surprise = [...imdbDiffs].sort((a, b) => b.diff - a.diff || byDate(a, b));
  if (surprise.length && surprise[0].diff >= 1) {
    const [first, second] = surprise;
    add({ id: "surprise", title: { ...pick(first), imdb: first.imdb, diff: first.diff }, next: second && second.diff === first.diff ? pick(second) : null });
  }
  const letdown = [...imdbDiffs].sort((a, b) => a.diff - b.diff || byDate(a, b));
  if (letdown.length && letdown[0].diff < 0) {
    const [first, second] = letdown;
    add({
      id: "letdown", title: { ...pick(first), imdb: first.imdb, diff: first.diff },
      next: second && second.diff < 0 ? { ...pick(second), diff: second.diff } : null,
      below, compared: imdbDiffs.length, critic: belowShare === null ? null : belowShare < 0.3 ? "mild" : belowShare > 0.6 ? "strict" : "fair",
    });
  }
  const voted = entries.map(entry => ({ ...entry, votes: votesOf(entry.movie) })).filter(entry => entry.votes);
  const gems = voted.filter(entry => entry.score >= 8 && entry.votes < 50000).sort((a, b) => a.votes - b.votes || byDate(a, b));
  if (gems.length) {
    const famous = [...voted].sort((a, b) => b.votes - a.votes)[0];
    add({ id: "gem", title: { ...pick(gems[0]), votes: gems[0].votes }, famous: famous && famous !== gems[0] ? { ...pick(famous), votes: famous.votes } : null });
  }
  if (media) {
    const shelf = entries.filter(entry => typeof entry.movie.medium === "string" && entry.movie.medium.trim());
    if (shelf.length) {
      const sorted = [...shelf].sort((a, b) => b.score - a.score || byDate(a, b));
      add({ id: "shelf", count: shelf.length, total: count, media: ranked(tally(shelf, entry => [entry.movie.medium.trim()])), titles: sorted.slice(0, 14).map(entry => ({ ...pick(entry), medium: entry.movie.medium.trim() })) });
    }
  }
  const best = Math.max(...scores);
  const atBest = entries.filter(entry => entry.score === best);
  const nextScore = Math.max(0, ...scores.filter(score => score < best));
  add({
    id: "top", score: best, titles: atBest.slice(0, 3).map(pick), more: Math.max(0, atBest.length - 3),
    nextScore: nextScore || null, runnersUp: nextScore ? entries.filter(entry => entry.score === nextScore).slice(0, 6).map(pick) : [],
    runnersUpCount: nextScore ? entries.filter(entry => entry.score === nextScore).length : 0,
  });

  // Abspann
  if (count >= 5) {
    const decadeCard = cards.find(card => card.id === "decades");
    add({
      id: "type", ...filmType({
        weekdayCounts, total: count, topGenre: genres[0]?.name || "",
        topDecade: decadeCard ? decadeCard.top.decade : null, latestDecade: Math.floor(year / 10) * 10, belowShare,
      }),
    });
  }
  const stars = [...entries].sort((a, b) => b.score - a.score || (votesOf(b.movie) || 0) - (votesOf(a.movie) || 0) || byDate(a, b)).slice(0, 5).map(pick);
  add({ id: "poster", stars, count, filmMinutes });

  return { year, partial, count, cards };
}
