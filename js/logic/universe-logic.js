import { genresOf } from "./movies-logic.js";
import { creditsOf } from "./cast-logic.js";

/*
 * „Filmuniversum" unter Entertainment (Oberfläche: js/ui/universe.js):
 * Genres und Besetzung in einem All.
 *
 * - Jedes Genre ist eine Galaxie. Genres, die oft zusammen vorkommen,
 *   liegen nah beieinander (kleines Kräfte-Layout, ohne Zufall - die Karte
 *   sieht jedes Mal gleich aus).
 * - Jeder Titel ist ein Stern in der Galaxie seines seltensten Genres
 *   (Spirale um die Mitte); ein Teil der Titel mit mehreren Genres liegt auf
 *   der Brücke zu einem seiner anderen Genres.
 * - Jeder Mensch (Regie, Darsteller, Drehbuch) ist ein Stern zwischen seinen
 *   Titeln: Lage = Mittel seiner Titel, Helligkeit = Zahl der Titel.
 *
 * Die Lage hängt nur von der ganzen Kinothek ab (nicht von Suche, Filter
 * oder Ansicht) - so bleibt alles an seinem Platz, nur die Sichtbarkeit
 * wechselt. Reine Funktionen, getestet in tests/universe.test.mjs.
 */

/** Ansichten: nur bewertete Titel oder die ganze Kinothek. */
export const UNIVERSE_MODES = ["rated", "all"];
export const DEFAULT_UNIVERSE_MODE = "rated";
/** Ein Genre wird zur eigenen Galaxie ab so vielen Titeln (sonst „Weitere"). */
export const MIN_GENRE_TITLES = 3;
export const MAX_GENRES = 24;
export const OTHER_GENRE = "Weitere";
/** Ausdehnung des Alls in Welt-Einheiten (das Layout wird hineingepasst). */
export const WORLD = { w: 1600, h: 960 };

/** Farben der Galaxien: gedeckt, aus dem Kino-Noir abgeleitet. */
export const GENRE_COLORS = {
  Drama: "#a0342a", Thriller: "#1f6a70", Komödie: "#c08a32", Action: "#b0582c", Abenteuer: "#6f8a3a",
  Krimi: "#3a5a8c", "Science-Fiction": "#2f86a0", Mystery: "#6a4a8a", Fantasy: "#8a4a86", Familienfilm: "#c9a45c",
  Horror: "#b0060a", Liebesfilm: "#b04a66", Animation: "#2d8070", Biografie: "#8a7a5a", Kriegsfilm: "#5a6a52",
  Musical: "#a86a8a", Geschichte: "#7a6040", Sportfilm: "#4a7a6a", Musikfilm: "#9a5a7a", Dokumentarfilm: "#6a6a7a",
  Western: "#9a6a3a", [OTHER_GENRE]: "#6a5a50",
};
const SPARE = ["#7a5a6a", "#5a6a7a", "#7a6a4a", "#4a6a6a", "#6a4a4a", "#5a5a7a"];

/** FNV-1a über einen Text. */
export function hashText(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
/** Kleiner Zufallsgenerator mit festem Startwert (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const colorOf = name => GENRE_COLORS[name] || SPARE[hashText(name) % SPARE.length];

/** Eigene Note 1–10 oder null. */
export function ownRating(movie) {
  const n = Math.round(Number.parseFloat(String(movie?.yourRating ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}
const imdbOf = movie => {
  const n = Number.parseFloat(String(movie?.imdbRating ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const avg = list => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);

/** Titel der gewählten Ansicht: „rated" nur mit eigener Note, „all" alle. */
export const universeMovies = (movies, mode = DEFAULT_UNIVERSE_MODE) => (mode === "all" ? movies : movies.filter(movie => ownRating(movie) !== null));

/**
 * Galaxien-Layout: Genres ziehen sich nach gemeinsamen Titeln an (Ähnlichkeit
 * = gemeinsame / √(a·b)), stoßen sich nach Größe ab. Ergebnis in Welt-Einheiten.
 * @param {Array<{name: string, count: number}>} genres
 * @param {Map<string, number>} pairs - "A|B" (alphabetisch) → gemeinsame Titel
 * @returns {Map<string, {x: number, y: number, r: number}>}
 */
export function layoutGalaxies(genres, pairs, { iterations = 1500 } = {}) {
  const n = genres.length;
  const out = new Map();
  if (!n) return out;
  if (n === 1) { out.set(genres[0].name, { x: WORLD.w / 2, y: WORLD.h / 2, r: 140 }); return out; }
  const rad = genres.map(g => 0.22 + 0.035 * Math.sqrt(g.count));
  const pos = genres.map((g, i) => [Math.cos(i / n * 2 * Math.PI) * 3, Math.sin(i / n * 2 * Math.PI) * 3]);
  const sim = (a, b) => {
    const key = [genres[a].name, genres[b].name].sort().join("|");
    return (pairs.get(key) || 0) / Math.sqrt(genres[a].count * genres[b].count);
  };
  const S = [];
  for (let a = 0; a < n; a++) { S[a] = []; for (let b = 0; b < n; b++) S[a][b] = a === b ? 0 : sim(a, b); }
  for (let it = 0; it < iterations; it++) {
    const f = pos.map(() => [0, 0]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1];
      const dist = Math.hypot(dx, dy) + 1e-6, ux = dx / dist, uy = dy / dist;
      let push = S[a][b] * dist * 0.35 - 0.02 / dist;
      const minD = (rad[a] + rad[b]) * 2.1;
      if (dist < minD) push -= (minD - dist) * 2;
      f[a][0] += ux * push; f[a][1] += uy * push;
      f[b][0] -= ux * push; f[b][1] -= uy * push;
    }
    for (let a = 0; a < n; a++) {
      f[a][0] -= pos[a][0] * 0.02; f[a][1] -= pos[a][1] * 0.02;
      pos[a][0] += f[a][0] * 0.05; pos[a][1] += f[a][1] * 0.05;
    }
  }
  // In die Welt einpassen (Seitenverhältnis wie die Bühne, etwas Rand)
  const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // Pro Achse höchstens 1,6-fach gestreckt, sonst zerreißt es kleine Kinotheken mit 2–3 Galaxien
  const fx = (WORLD.w - 300) / Math.max(1e-6, x1 - x0), fy = (WORLD.h - 200) / Math.max(1e-6, y1 - y0);
  const s = Math.min(fx, fy), sx = Math.min(fx, s * 1.6), sy = Math.min(fy, s * 1.6);
  const scale = Math.sqrt(sx * sy), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  genres.forEach((g, i) => out.set(g.name, {
    x: Math.round(WORLD.w / 2 + (pos[i][0] - mx) * sx),
    y: Math.round(WORLD.h / 2 + (pos[i][1] - my) * sy),
    r: Math.min(260, Math.round(rad[i] * scale * 1.15)),
  }));
  return out;
}

/**
 * Das ganze All aus der Kinothek.
 * @param {Array} movies - alle Titel (nicht gefiltert)
 * @param {object} castData
 * @returns {{genres: Array, titles: Array, people: Array, byId: Map, byKey: Map, pairs: Map, bounds: object}}
 *   genres: {name, count, color, x, y, r}
 *   titles: {id, movie, x, y, home, genres, rating}
 *   people: {key, name, roles: {dir, act, wri}, ids: string[], n, x, y}
 */
export function buildUniverse(movies, castData = {}) {
  const counts = new Map();
  for (const movie of movies) for (const g of genresOf(movie)) counts.set(g, (counts.get(g) || 0) + 1);
  const named = [...counts].filter(([, c]) => c >= MIN_GENRE_TITLES).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, MAX_GENRES).map(([name]) => name);
  const known = new Set(named);
  const galaxyOf = movie => {
    const gs = genresOf(movie).filter(g => known.has(g));
    return gs.length ? gs : [OTHER_GENRE];
  };
  const gCount = new Map();
  const pairs = new Map();
  for (const movie of movies) {
    const gs = galaxyOf(movie);
    for (const g of gs) gCount.set(g, (gCount.get(g) || 0) + 1);
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      const key = [gs[i], gs[j]].sort().join("|");
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  const list = [...gCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
  const layout = layoutGalaxies(list, pairs);
  const genres = list.map(g => ({ ...g, color: colorOf(g.name), ...layout.get(g.name) }));
  const byName = new Map(genres.map(g => [g.name, g]));

  const titles = movies.map(movie => {
    const gs = galaxyOf(movie);
    const home = gs.reduce((best, g) => (byName.get(g).count < byName.get(best).count ? g : best), gs[0]);
    const rnd = seeded(hashText(movie.id || movie.title));
    const H = byName.get(home);
    const t = Math.pow(rnd(), 1.6), angle = rnd() * 2 * Math.PI + t * 4;
    let x = H.x + Math.cos(angle) * t * H.r * 1.15;
    let y = H.y + Math.sin(angle) * t * H.r * 0.82;
    const others = gs.filter(g => g !== home);
    if (others.length && rnd() < 0.38) {
      const O = byName.get(others[Math.floor(rnd() * others.length)]);
      const f = 0.15 + rnd() * 0.4;
      x = x * (1 - f) + O.x * f; y = y * (1 - f) + O.y * f;
    }
    x += (rnd() - 0.5) * 8; y += (rnd() - 0.5) * 8;
    return { id: movie.id, movie, x, y, home, genres: gs, rating: ownRating(movie) };
  });
  const byId = new Map(titles.map(t => [t.id, t]));

  const persons = new Map();
  for (const t of titles) {
    for (const credit of creditsOf(t.movie, castData || {})) {
      if (!persons.has(credit.key)) persons.set(credit.key, { key: credit.key, name: credit.name, roles: { dir: 0, act: 0, wri: 0 }, ids: [] });
      const p = persons.get(credit.key);
      if (!p.ids.includes(t.id)) p.ids.push(t.id);
      for (const role of credit.roles) p.roles[role]++;
    }
  }
  const people = [...persons.values()].map(p => {
    const rnd = seeded(hashText(p.key));
    let x = 0, y = 0;
    for (const id of p.ids) { const t = byId.get(id); x += t.x; y += t.y; }
    x /= p.ids.length; y /= p.ids.length;
    const spread = p.ids.length === 1 ? 7 : 14;
    const a = rnd() * 2 * Math.PI;
    return { ...p, n: p.ids.length, x: x + Math.cos(a) * spread, y: y + Math.sin(a) * spread };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "de"));
  const byKey = new Map(people.map(p => [p.key, p]));

  const xs = genres.map(g => [g.x - g.r * 1.3, g.x + g.r * 1.3]).flat();
  const ys = genres.map(g => [g.y - g.r * 1.1, g.y + g.r * 1.1]).flat();
  const bounds = xs.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : { x0: 0, x1: WORLD.w, y0: 0, y1: WORLD.h };
  return { genres, titles, people, byId, byKey, byName, pairs, bounds };
}

/** Hauptrolle für Form und Farbe: die häufigste (bei Gleichstand Regie vor Drehbuch vor Darsteller). */
export const primaryRole = roles => ["dir", "wri", "act"].reduce((best, r) => (roles[r] > roles[best] ? r : best), "dir");

/**
 * Dossier einer Galaxie (nur sichtbare Titel zählen).
 * @param {object} u - buildUniverse
 * @param {string} name
 * @param {Set<string>} visible - sichtbare Titel-IDs
 */
export function genreDossier(u, name, visible) {
  const titles = u.titles.filter(t => visible.has(t.id) && t.genres.includes(name));
  const neighbors = new Map();
  for (const t of titles) for (const g of t.genres) if (g !== name) neighbors.set(g, (neighbors.get(g) || 0) + 1);
  const ids = new Set(titles.map(t => t.id));
  const stars = u.people.map(p => ({ person: p, count: p.ids.filter(id => ids.has(id)).length }))
    .filter(s => s.count >= 2).sort((a, b) => b.count - a.count || b.person.n - a.person.n || a.person.name.localeCompare(b.person.name, "de")).slice(0, 5);
  const rated = titles.filter(t => t.rating !== null);
  const best = rated.length ? Math.max(...rated.map(t => t.rating)) : null;
  return {
    name, count: titles.length,
    own: avg(rated.map(t => t.rating)), imdb: avg(titles.map(t => imdbOf(t.movie)).filter(v => v !== null)),
    neighbors: [...neighbors].map(([g, c]) => ({ name: g, count: c })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")).slice(0, 4),
    stars,
    favorites: best === null ? [] : rated.filter(t => t.rating === best).slice(0, 3).map(t => t.movie),
    best,
  };
}

/**
 * Dossier eines Menschen.
 * @returns {{person, titles: Array, own, imdb, genres: Array, years: number[], partners: Array, favorites: Array, best}}
 */
export function personDossier(u, key, visible) {
  const person = u.byKey.get(key);
  if (!person) return null;
  const titles = person.ids.map(id => u.byId.get(id)).filter(t => t && visible.has(t.id));
  const genres = new Map();
  for (const t of titles) for (const g of t.genres) genres.set(g, (genres.get(g) || 0) + 1);
  const ids = new Set(titles.map(t => t.id));
  const partners = u.people.filter(p => p.key !== key).map(p => ({ person: p, count: p.ids.filter(id => ids.has(id)).length }))
    .filter(s => s.count >= 1).sort((a, b) => b.count - a.count || b.person.n - a.person.n || a.person.name.localeCompare(b.person.name, "de")).slice(0, 6);
  const rated = titles.filter(t => t.rating !== null);
  const best = rated.length ? Math.max(...rated.map(t => t.rating)) : null;
  const years = titles.map(t => Number.parseInt(t.movie.year, 10)).filter(y => y > 1800).sort((a, b) => a - b);
  return {
    person, titles: [...titles].sort((a, b) => (Number.parseInt(a.movie.year, 10) || 0) - (Number.parseInt(b.movie.year, 10) || 0)),
    own: avg(rated.map(t => t.rating)), imdb: avg(titles.map(t => imdbOf(t.movie)).filter(v => v !== null)),
    genres: [...genres].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")).slice(0, 4),
    years, partners,
    favorites: best === null ? [] : rated.filter(t => t.rating === best).slice(0, 3).map(t => t.movie),
    best,
  };
}

/** „Deine Stammbesetzung": Rangliste nach sichtbaren Titeln (ab 2), je Rolle. */
export function universeRanking(u, visible, role = "all", limit = 40) {
  return u.people.map(p => ({ person: p, count: p.ids.filter(id => visible.has(id)).length }))
    .filter(s => s.count >= 2 && (role === "all" || s.person.roles[role] > 0))
    .sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name, "de"))
    .slice(0, limit);
}

/** Menschen, deren Name die Suche enthält (Groß/klein egal). */
export function matchPeople(u, query, visible) {
  const q = String(query || "").trim().toLocaleLowerCase("de");
  if (q.length < 2) return [];
  return u.people.filter(p => p.key.includes(q) && p.ids.some(id => visible.has(id)));
}

/*
 * Urknall beim Öffnen (auch der Auftritt in „Du gegen IMDb"): Einstellung wie
 * beim Kinovorhang plus „einmal pro Sitzung"; Standard jede Stunde. Gibt
 * zurück, ob er spielt, und was zu merken ist.
 */
export const UNIVERSE_INTRO_OPTIONS = [
  { value: "session", label: "Einmal pro Sitzung" },
  { value: "always", label: "Bei jedem Öffnen" },
  { value: "hourly", label: "Jede Stunde" },
  { value: "every2h", label: "Alle 2 Stunden" },
  { value: "daily", label: "Einmal am Tag" },
  { value: "off", label: "Nie" },
];
export const DEFAULT_UNIVERSE_INTRO = "hourly";

/**
 * @param {string} mode
 * @param {{now: Date, seenThisSession: boolean, last: number, day: string}} memory
 * @returns {{play: boolean, remember: {session?: true, last?: number, day?: string}}}
 */
export function introDue(mode, { now = new Date(), seenThisSession = false, last = 0, day = "" } = {}) {
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const value = UNIVERSE_INTRO_OPTIONS.some(o => o.value === mode) ? mode : DEFAULT_UNIVERSE_INTRO;
  if (value === "off") return { play: false, remember: {} };
  if (value === "always") return { play: true, remember: {} };
  if (value === "session") return seenThisSession ? { play: false, remember: {} } : { play: true, remember: { session: true } };
  if (value === "daily") return day === today ? { play: false, remember: {} } : { play: true, remember: { day: today } };
  const minutes = { hourly: 60, every2h: 120 }[value];
  const age = now.getTime() - (Number(last) || 0);
  return age >= 0 && age < minutes * 60000 ? { play: false, remember: {} } : { play: true, remember: { last: now.getTime() } };
}
