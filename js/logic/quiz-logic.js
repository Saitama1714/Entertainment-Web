/*
 * Reine Logik für den Quizabend (Filmquiz, Ziel 8): Fragen aus fünf
 * Kategorien - Zitate und Trivia (feste Kataloge in data/), Personen,
 * Fakten & Zahlen und Deine Kinothek (aus der Kinothek errechnet). Geantwortet
 * wird immer über vier Cover. Dazu: Zuordnung Quelle → Titel der Kinothek,
 * plausible falsche Antworten, Tipps, Stapel ohne Wiederholung, Trefferquote.
 * Die Oberfläche steht in ui/quiz.js.
 */

/** Titel vergleichbar machen: nur Buchstaben und Ziffern, ohne Akzente. */
export const normTitle = value => String(value || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, "and").replace(/^(the|a|an|der|die|das) /, "")
  .replace(/[^a-z0-9]/g, "");

/** "Heat (1995)" → { title: "Heat", year: 1995 }. */
export function parseSource(source) {
  const match = String(source || "").match(/^(.*)\s\((\d{4})\)$/);
  return match ? { title: match[1].trim(), year: Number(match[2]) } : { title: String(source || "").trim(), year: 0 };
}

const NOT_A_FILM = /seri|episode|game|spiel|podcast|special|video|kurzfilm|short/i; // IMDb-Typen deutsch und englisch
export const isFilm = movie => !NOT_A_FILM.test(movie.titleType || "");
const starWarsShort = key => key.replace(/^starwarsepisode[ivx]+/, "starwars");

/**
 * Sucht den Titel der Kinothek zu einer Zitat-Quelle: gleicher Titel
 * (Original oder deutsch) und Jahr ± 1; zur Not enthält der eine Titel den
 * anderen ("The Force Awakens" ↔ "Star Wars: Episode VII - The Force Awakens").
 * @returns {object|null}
 */
export function matchMovie(movies, source) {
  const { title, year } = parseSource(source);
  const key = normTitle(title);
  if (!key) return null;
  const near = movie => !year || !movie.year || Math.abs(Number(movie.year) - year) <= 1;
  const keys = movie => [normTitle(movie.originalTitle), normTitle(movie.title)].filter(Boolean);
  const pool = movies.filter(movie => isFilm(movie) && near(movie));
  const exact = pool.find(movie => keys(movie).some(k => k === key || starWarsShort(k) === starWarsShort(key)));
  if (exact) return exact;
  if (key.length < 4) return null;
  return pool.find(movie => keys(movie).some(k => k.length >= 4 && (k.includes(key) || key.includes(k)))) || null;
}

/** Gehört ein Titel zur selben Reihe wie die Antwort (gleiche ersten 6 Zeichen)? */
export function sameFamily(answer) {
  const stems = [answer?.originalTitle, answer?.title].map(normTitle).filter(k => k.length >= 4).map(k => k.slice(0, 6));
  return movie => [movie.originalTitle, movie.title].map(normTitle).filter(Boolean)
    .some(k => stems.some(stem => k.slice(0, stem.length) === stem));
}

const decade = year => Math.floor(Number(year || 0) / 10);
const genres = movie => String(movie.genre || "").split(/,\s*/).filter(Boolean);

/**
 * Drei falsche Antworten aus der Kinothek, die passen könnten: am liebsten
 * gleiches Jahrzehnt und gemeinsames Genre, nie derselbe Titel und nie ein
 * Teil derselben Reihe (gleicher Titelanfang: „Star Wars …“, „Harry Potter …“),
 * damit keine zweite Antwort ebenfalls stimmen könnte.
 * @param {object[]} movies
 * @param {object|null} answer - Titel der Kinothek oder Ersatz { title, year, genre }.
 * @param {{ needCover?: boolean, random?: () => number, count?: number }} [options]
 */
export function pickDistractors(movies, answer, { needCover = false, random = Math.random, count = 3, accept = () => true } = {}) {
  const answerKey = normTitle(answer?.originalTitle || answer?.title);
  const answerGenres = new Set(genres(answer || {}));
  const seen = new Set([answerKey]);
  const family = sameFamily(answer);
  const scored = movies
    .filter(movie => isFilm(movie) && movie.id !== answer?.id && (!needCover || movie.cover) && !family(movie) && accept(movie))
    .map(movie => {
      let score = random() * 1.5;
      if (decade(movie.year) === decade(answer?.year)) score += 3;
      else if (Math.abs(decade(movie.year) - decade(answer?.year)) === 1) score += 1;
      score += Math.min(2, genres(movie).filter(g => answerGenres.has(g)).length) * 1.5;
      return { movie, score };
    })
    .sort((a, b) => b.score - a.score);
  const picks = [];
  for (const { movie } of scored) {
    const key = normTitle(movie.originalTitle || movie.title);
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(movie);
    if (picks.length === count) break;
  }
  return picks;
}

/** Mischt eine Liste (Fisher-Yates, eigener Zufall für Tests). */
export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Nächstes Zitat aus einem gemischten Stapel: jedes Zitat kommt einmal dran,
 * erst dann wird neu gemischt (der Stapel steht im localStorage).
 * @param {number} total - Anzahl Zitate.
 * @param {{ order?: number[], pos?: number }} deck
 * @returns {{ index: number, deck: { order: number[], pos: number } }}
 */
export function nextFromDeck(total, deck = {}, random = Math.random) {
  let order = Array.isArray(deck.order) && deck.order.length === total ? deck.order : null;
  let pos = Number.isInteger(deck.pos) ? deck.pos : 0;
  if (!order || pos >= total) {
    const last = order ? order[total - 1] : -1;
    order = shuffle([...Array(total).keys()], random);
    if (total > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
    pos = 0;
  }
  return { index: order[pos], deck: { order, pos: pos + 1 } };
}

/**
 * Tipps der Reihe nach: Jahr, dann Regie (sonst Genre), dann wird eine
 * falsche Antwort weggenommen.
 * @returns {Array<{ kind: "text"|"remove", text: string }>}
 */
export function quizHints(answer, source) {
  const year = answer?.year || parseSource(source).year;
  const hints = [];
  if (year) hints.push({ kind: "text", text: `Erschienen ${year}` });
  const directors = String(answer?.directors || "").split(/,\s*/).filter(Boolean);
  if (directors.length) hints.push({ kind: "text", text: `Regie: ${directors.slice(0, 2).join(", ")}` });
  else if (genres(answer || {}).length) hints.push({ kind: "text", text: `Genre: ${genres(answer).slice(0, 2).join(", ")}` });
  hints.push({ kind: "remove", text: "Eine falsche Antwort fällt weg" });
  return hints;
}

/** Leerer Spielstand. */
export const emptyQuizStats = () => ({ played: 0, correct: 0, streak: 0, best: 0 });

/** Spielstand nach einer Antwort. */
export function scoreAnswer(stats, correct) {
  const base = { ...emptyQuizStats(), ...(stats || {}) };
  const streak = correct ? base.streak + 1 : 0;
  return { played: base.played + 1, correct: base.correct + (correct ? 1 : 0), streak, best: Math.max(base.best, streak) };
}

/** "12 von 15 richtig" usw. für die Leiste neben dem Tipp-Knopf. */
export function statsLine(stats) {
  const s = { ...emptyQuizStats(), ...(stats || {}) };
  const rate = s.played ? Math.round((s.correct / s.played) * 100) : 0;
  return { hits: `${s.correct} von ${s.played} richtig`, rate: s.played ? `${rate} %` : "–", streak: `Serie ${s.streak}`, best: `Rekord ${s.best}` };
}

/* ---- Kategorien --------------------------------------------------------- */

/** Kategorien des Quizabends (Reihenfolge der Checkboxen). */
export const QUIZ_CATEGORIES = [
  { id: "quotes", label: "Zitate" },
  { id: "trivia", label: "Trivia" },
  { id: "people", label: "Personen" },
  { id: "facts", label: "Fakten & Zahlen" },
  { id: "mine", label: "Deine Kinothek" },
];

/** Gespeicherte Auswahl lesen: unbekannte raus, leer = alle (Standard: alle an). */
export function readCategories(value) {
  const ids = QUIZ_CATEGORIES.map(c => c.id);
  const list = Array.isArray(value) ? value.filter(id => ids.includes(id)) : [];
  return list.length ? ids.filter(id => list.includes(id)) : ids;
}

/* ---- Fragen aus der Kinothek ------------------------------------------- */

const pickOne = (list, random) => list[Math.floor(random() * list.length)];
const firstOf = value => String(value || "").split(/,\s*/).filter(Boolean);
const castOf = (cast, movie) => (movie.imdbId && cast?.[movie.imdbId]) || {};
const runtimeText = minutes => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} Std.${m ? ` ${m} Min.` : ""}` : `${m} Min.`;
};
const de = value => String(value).replace(".", ",");
const dayText = value => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
};
const votesText = n => (n >= 1e6 ? `${de((n / 1e6).toFixed(1))} Mio. Stimmen` : `${Math.round(n / 1000)} Tsd. Stimmen`);

/** Länder (OMDb, englisch) → deutsch; USA fehlt absichtlich (zu häufig für eine Frage). */
const COUNTRIES = {
  "United Kingdom": "Großbritannien", UK: "Großbritannien", France: "Frankreich", Germany: "Deutschland", "West Germany": "Deutschland",
  Italy: "Italien", Spain: "Spanien", Japan: "Japan", "South Korea": "Südkorea", Canada: "Kanada", Australia: "Australien",
  Mexico: "Mexiko", Sweden: "Schweden", Denmark: "Dänemark", India: "Indien", China: "China", "Hong Kong": "Hongkong",
  "New Zealand": "Neuseeland", Brazil: "Brasilien", Ireland: "Irland", Norway: "Norwegen", Belgium: "Belgien", Austria: "Österreich",
};
const MEDIA = { DVD: "DVD", "Blu-ray": "Blu-ray", "UHD Blu-ray": "4K-Blu-ray" };

/** Vier verschiedene Titel mit deutlich verschiedenen Werten (für „Welcher am …?“). */
function spreadPick(pool, value, gap, random) {
  const list = pool.filter(m => Number.isFinite(value(m)));
  for (let attempt = 0; attempt < 12; attempt++) {
    const picks = [];
    for (const movie of [...list].sort(() => random() - 0.5)) {
      if (picks.some(p => Math.abs(value(p) - value(movie)) < gap || sameFamily(p)(movie))) continue;
      picks.push(movie);
      if (picks.length === 4) return picks;
    }
  }
  return null;
}

/** Frage, bei der der größte oder kleinste Wert gesucht ist. */
function superlative({ category, pool, value, gap, max, prompt, detail, random }) {
  const picks = spreadPick(pool, value, gap, random);
  if (!picks) return null;
  const answer = picks.reduce((best, m) => ((max ? value(m) > value(best) : value(m) < value(best)) ? m : best));
  return { category, prompt, answer, choices: picks, details: Object.fromEntries(picks.map(m => [m.id, detail(m)])) };
}

/** Frage „Welcher erfüllt X?“ – Antwort erfüllt es, die drei anderen nicht. */
function oneOf({ category, pool, answer, test, prompt, detail, random }) {
  const wrong = pickDistractors(pool, answer, { needCover: true, random, accept: m => !test(m) });
  if (wrong.length < 3) return null;
  const choices = [answer, ...wrong];
  return { category, prompt, answer, choices, details: detail ? Object.fromEntries(choices.map(m => [m.id, detail(m)])) : {} };
}

const GENERATORS = {
  people: [
    ({ pool, random }) => {
      const answer = pickOne(pool.filter(m => firstOf(m.directors).length), random);
      if (!answer) return null;
      const name = pickOne(firstOf(answer.directors), random);
      return oneOf({ category: "people", pool, answer, random, test: m => firstOf(m.directors).includes(name),
        prompt: `Bei welchem Film führte ${name} Regie?`, detail: m => firstOf(m.directors).slice(0, 2).join(", ") ? `Regie: ${firstOf(m.directors).slice(0, 2).join(", ")}` : "" });
    },
    ({ pool, cast, random }) => {
      const answer = pickOne(pool.filter(m => (castOf(cast, m).a || []).length), random);
      if (!answer) return null;
      const name = pickOne(castOf(cast, answer).a.slice(0, 3), random);
      return oneOf({ category: "people", pool, answer, random, test: m => (castOf(cast, m).a || []).includes(name),
        prompt: `In welchem Film spielt ${name} mit?`, detail: m => (castOf(cast, m).a || []).slice(0, 2).join(", ") });
    },
    ({ pool, cast, random }) => {
      const answer = pickOne(pool.filter(m => (castOf(cast, m).w || []).some(w => !firstOf(m.directors).includes(w))), random);
      if (!answer) return null;
      const name = pickOne(castOf(cast, answer).w.filter(w => !firstOf(answer.directors).includes(w)), random);
      return oneOf({ category: "people", pool, answer, random, test: m => (castOf(cast, m).w || []).includes(name),
        prompt: `Zu welchem Film schrieb ${name} das Drehbuch?`, detail: m => (castOf(cast, m).w || []).slice(0, 2).join(", ") });
    },
  ],
  facts: [
    ({ pool, random }) => {
      const answer = pickOne(pool.filter(m => m.year), random);
      if (!answer) return null;
      return oneOf({ category: "facts", pool, answer, random, test: m => Number(m.year) === Number(answer.year),
        prompt: `Welcher dieser Filme erschien ${answer.year}?`, detail: m => String(m.year || "") });
    },
    ({ pool, random }) => {
      const max = random() < 0.5;
      return superlative({ category: "facts", pool, random, value: m => Number(m.year) || NaN, gap: 2, max,
        prompt: max ? "Welcher dieser Filme ist der neueste?" : "Welcher dieser Filme ist der älteste?", detail: m => String(m.year) });
    },
    ({ pool, random }) => {
      const max = random() < 0.6;
      return superlative({ category: "facts", pool, random, value: m => Number(m.runtimeMinutes) || NaN, gap: 8, max,
        prompt: max ? "Welcher dieser Filme dauert am längsten?" : "Welcher dieser Filme ist am kürzesten?", detail: m => runtimeText(Number(m.runtimeMinutes)) });
    },
    ({ pool, random }) => superlative({ category: "facts", pool, random, value: m => Number(m.imdbRating) || NaN, gap: 0.3, max: true,
      prompt: "Welcher dieser Filme hat die beste IMDb-Wertung?", detail: m => `IMDb ${de(m.imdbRating)}` }),
    ({ pool, random }) => superlative({ category: "facts", pool, random, value: m => Number(m.numVotes) || NaN, gap: 50000, max: true,
      prompt: "Welcher dieser Filme hat bei IMDb die meisten Stimmen?", detail: m => votesText(Number(m.numVotes)) }),
    ({ pool, cast, random }) => superlative({ category: "facts", pool, random, value: m => parseInt(castOf(cast, m).rt, 10), gap: 6, max: true,
      prompt: "Welcher dieser Filme hat bei Rotten Tomatoes die beste Wertung?", detail: m => `Rotten Tomatoes ${parseInt(castOf(cast, m).rt, 10)} %` }),
    // Keine Genre-Frage: IMDb ordnet Genres teils unverständlich zu (Nutzerwunsch)
    ({ pool, cast, random }) => {
      const answer = pickOne(pool.filter(m => (castOf(cast, m).c || []).some(c => COUNTRIES[c])), random);
      if (!answer) return null;
      const country = pickOne((castOf(cast, answer).c || []).filter(c => COUNTRIES[c]), random);
      const same = m => (castOf(cast, m).c || []).some(c => COUNTRIES[c] === COUNTRIES[country]);
      return oneOf({ category: "facts", pool: pool.filter(m => (castOf(cast, m).c || []).length), answer, random, test: same,
        prompt: `Welcher dieser Filme entstand (auch) in ${COUNTRIES[country]}?`,
        detail: m => (same(m) ? COUNTRIES[country] : (castOf(cast, m).c || []).slice(0, 2).map(c => COUNTRIES[c] || ({ "United States": "USA", USA: "USA", Poland: "Polen", Hungary: "Ungarn" }[c] || c)).join(", ")) });
    },
  ],
  mine: [
    ({ pool, random }) => superlative({ category: "mine", pool, random, value: m => Number(m.yourRating) || NaN, gap: 1, max: true,
      prompt: "Welchen dieser Filme hast du am besten bewertet?", detail: m => `Deine Note ${m.yourRating}` }),
    ({ pool, random }) => superlative({ category: "mine", pool, random, value: m => Date.parse(m.dateRated || "") || NaN, gap: 30 * 864e5, max: false,
      prompt: "Welchen dieser Filme hast du zuerst bewertet?", detail: m => `Bewertet am ${dayText(m.dateRated)}` }),
    ({ pool, random }) => superlative({ category: "mine", pool, random, value: m => Date.parse(m.collectedAt || "") || NaN, gap: 14 * 864e5, max: true,
      prompt: "Welcher dieser Filme kam zuletzt in deine Sammlung?", detail: m => `Seit ${dayText(m.collectedAt)}` }),
    ({ pool, random }) => superlative({ category: "mine", pool, random,
      value: m => (Number(m.yourRating) && Number(m.imdbRating) ? Number(m.yourRating) - Number(m.imdbRating) : NaN), gap: 0.8, max: true,
      prompt: "Bei welchem Film liegt deine Note am weitesten über der IMDb-Wertung?", detail: m => `Du ${m.yourRating} · IMDb ${de(m.imdbRating)}` }),
    ({ pool, random }) => {
      const medium = pickOne(Object.keys(MEDIA).filter(key => pool.some(m => m.medium === key)), random);
      const answer = medium && pickOne(pool.filter(m => m.medium === medium), random);
      if (!answer) return null;
      return oneOf({ category: "mine", pool, answer, random, test: m => m.medium === medium,
        prompt: `Welcher dieser Filme steht als ${MEDIA[medium]} in deinem Regal?`, detail: m => (m.medium ? MEDIA[m.medium] || m.medium : "nicht im Regal") });
    },
    ({ pool, random }) => {
      const answer = pickOne(pool.filter(m => m.seen === false), random);
      if (!answer) return null;
      return oneOf({ category: "mine", pool: pool.filter(m => typeof m.seen === "boolean"), answer, random, test: m => m.seen === false,
        prompt: "Welchen dieser Filme hast du noch nicht gesehen?", detail: m => (m.seen ? "gesehen" : "noch offen") });
    },
  ],
};

/**
 * Errechnete Frage aus der Kinothek (Personen, Fakten & Zahlen, Deine Kinothek).
 * Versucht mehrere Bauarten, bis eine mit vier Covern klappt.
 * @param {"people"|"facts"|"mine"} category
 * @param {{ movies: object[], cast?: object, random?: () => number }} ctx
 * @returns {null|{ category: string, prompt: string, answer: object, choices: object[], details: Record<string,string> }}
 */
export function computedQuestion(category, { movies, cast = {}, random = Math.random } = {}) {
  const builders = GENERATORS[category];
  if (!builders) return null;
  const pool = movies.filter(m => isFilm(m) && m.cover);
  if (pool.length < 4) return null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const question = pickOne(builders, random)({ pool, cast, random });
    if (question && question.choices.length === 4 && new Set(question.choices.map(m => m.id)).size === 4) {
      return { ...question, choices: shuffle(question.choices, random) };
    }
  }
  return null;
}
