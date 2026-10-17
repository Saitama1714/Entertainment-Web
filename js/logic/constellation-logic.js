import { genresOf } from "./movies-logic.js";

/*
 * Rechenlogik der Registerkarte „Sternbild" unter Entertainment (Oberfläche:
 * js/ui/constellation.js). Ohne DOM, mit Node testbar
 * (tests/constellation.test.mjs). Gemeinsam mit der Website (gemeinsam.txt).
 *
 * Aufbau:
 * - Jedes Genre ist ein Stern. Größe = Anzahl, Linien = Titel, die zu beiden
 *   Genres gehören. Die Lage rechnet ein kleines Kräfte-Layout, immer gleich
 *   (keine Zufallszahlen), damit die Karte von Mal zu Mal gleich aussieht.
 * - Jeder Titel wohnt genau einmal auf der Karte: in der Galaxie seines
 *   seltensten Genres (beschreibt ihn am genauesten). Dort liegen die Titel
 *   als Raster um den Stern, die besten in der Mitte.
 * - Gehört ein Titel noch zu anderen Genres, zeigt das die Oberfläche über
 *   Umrisse (Bubble Sets, bubblePath) und Fäden - nicht über die Lage.
 *
 * Bubble Sets nach Collins, Penn & Carpendale (IEEE InfoVis 2009),
 * vereinfacht: Energiefeld aus Mitgliedern (+), Nicht-Mitgliedern (−) und
 * einem minimalen Spannbaum als Verbindung; der Umriss ist eine Isolinie
 * (Marching Squares).
 */

/** Ansichten des Umschalters: nur bewertete Titel oder die ganze Sammlung. */
export const CONSTELLATION_MODES = ["rated", "all"];
export const DEFAULT_CONSTELLATION_MODE = "rated";

/** Ein Genre wird zum eigenen Stern ab so vielen Titeln (sonst „Weitere"). */
export const MIN_GENRE_TITLES = 3;
/** Höchstens so viele Sterne; kleinere Genres landen unter „Weitere". */
export const MAX_GENRES = 24;
export const OTHER_GENRE = "Weitere";

/** Raster der Galaxien und Größe eines Covers (Welt-Einheiten). */
export const CELL = { w: 3.3, h: 4.84 };
export const POSTER = { w: 2.9, h: 4.36 };

/**
 * Eigene Bewertung 1-10 oder null.
 * @param {{yourRating?: string|number}} movie
 */
export function ownRating(movie) {
  const value = Number(movie?.yourRating);
  return Number.isFinite(value) && value >= 1 && value <= 10 ? Math.round(value) : null;
}

/**
 * Titel der gewählten Ansicht: „rated" nur mit eigener Bewertung, „all" alle.
 * @param {Array} movies
 * @param {"rated"|"all"} mode
 */
export function constellationMovies(movies, mode = DEFAULT_CONSTELLATION_MODE) {
  return mode === "all" ? [...movies] : movies.filter(movie => ownRating(movie) !== null);
}

/** Reihenfolge innerhalb eines Genres: eigene Bewertung, dann IMDb, dann Titel. */
export function compareItems(a, b) {
  return (b.rating ?? 0) - (a.rating ?? 0)
    || b.imdb - a.imdb
    || a.title.localeCompare(b.title, "de");
}

/**
 * Rasterplätze einer Galaxie, nach Abstand zur Mitte (Mitte zuerst).
 * @param {number} count
 * @returns {Array<[number, number]>} Versatz in Rasterzellen.
 */
export function galaxyCells(count) {
  if (count <= 0) return [];
  const radius = Math.ceil(Math.sqrt(count)) + 2;
  const cells = [];
  for (let cx = -radius; cx <= radius; cx++) for (let cy = -radius; cy <= radius; cy++) {
    cells.push([cx, cy, Math.hypot(cx * CELL.w, cy * CELL.h)]);
  }
  cells.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return cells.slice(0, count).map(([cx, cy]) => [cx, cy]);
}

/** Ungefährer Radius einer Galaxie mit so vielen Titeln (Welt-Einheiten). */
export const galaxyRadius = count => (count > 0 ? Math.sqrt(count * CELL.w * CELL.h / Math.PI) + CELL.h : 0);

/**
 * Kräfte-Layout der Sterne: abstoßend untereinander, Federn entlang der
 * Linien (je mehr gemeinsame Titel, desto näher), leichter Zug zur Mitte.
 * Ohne Zufall: Startlage auf einer Spirale nach Rangfolge.
 * @param {Array<{radius: number}>} nodes - werden um x und y ergänzt.
 * @param {Array<{a: number, b: number, w: number}>} edges
 */
export function layoutStars(nodes, edges, { iterations = 700 } = {}) {
  const maxW = Math.max(1, ...edges.map(edge => edge.w));
  const sim = nodes.map((node, i) => {
    const angle = i * 2.39996, r = 40 + 9 * i;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0, r: node.radius };
  });
  for (let it = 0; it < iterations; it++) {
    const heat = 1 - it / iterations;
    for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) {
      const A = sim[i], B = sim[j];
      let dx = B.x - A.x, dy = B.y - A.y;
      const d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), min = A.r + B.r + 30;
      const force = 5200 / d2 + (d < min ? (min - d) * 0.5 : 0);
      dx /= d; dy /= d;
      A.vx -= dx * force; A.vy -= dy * force; B.vx += dx * force; B.vy += dy * force;
    }
    for (const edge of edges) {
      const A = sim[edge.a], B = sim[edge.b];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      const target = Math.max(A.r + B.r + 20, 160 - 70 * edge.w / maxW);
      const force = (d - target) * 0.012 * (0.4 + edge.w / maxW);
      A.vx += dx / d * force; A.vy += dy / d * force; B.vx -= dx / d * force; B.vy -= dy / d * force;
    }
    for (const n of sim) {
      n.vx -= n.x * 0.004; n.vy -= n.y * 0.004;
      n.x += n.vx * heat; n.y += n.vy * heat;
      n.vx *= 0.55; n.vy *= 0.55;
    }
  }
  nodes.forEach((node, i) => { node.x = sim[i].x; node.y = sim[i].y; });
  return nodes;
}

/**
 * Baut das Sternbild aus einer (schon gesuchten und gefilterten) Titelliste.
 * @param {Array} movies
 * @param {{mode?: "rated"|"all"}} [options]
 * @returns {{mode: string, items: Array, genres: Array, edges: Array, bounds: {x0:number,y0:number,x1:number,y1:number}}}
 *   items: {id, movie, title, year, rating, imdb, gs (Genre-Indizes), home, x, y}
 *   genres: {i, name, n, avg, dist, titles, home, x, y, radius, galaxy}
 */
export function buildConstellation(movies, { mode = DEFAULT_CONSTELLATION_MODE } = {}) {
  const items = constellationMovies(movies, mode).map(movie => ({
    id: movie.id,
    movie,
    title: String(movie.title || ""),
    year: String(movie.year || ""),
    rating: ownRating(movie),
    imdb: Number(movie.imdbRating) || 0,
    names: genresOf(movie),
  }));

  // Sterne: häufigste Genres; Rest und Titel ohne Genre unter „Weitere"
  const counts = new Map();
  for (const item of items) for (const name of item.names) counts.set(name, (counts.get(name) || 0) + 1);
  const main = [...counts]
    .filter(([, n]) => n >= MIN_GENRE_TITLES)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))
    .slice(0, MAX_GENRES)
    .map(([name]) => name);
  const index = new Map(main.map((name, i) => [name, i]));
  const genres = main.map((name, i) => ({ i, name }));
  for (const item of items) {
    item.gs = item.names.filter(name => index.has(name)).map(name => index.get(name));
    if (!item.gs.length) {
      if (!index.has(OTHER_GENRE)) { index.set(OTHER_GENRE, genres.length); genres.push({ i: genres.length, name: OTHER_GENRE, other: true }); }
      item.gs = [index.get(OTHER_GENRE)];
    }
  }

  for (const genre of genres) {
    genre.titles = items.filter(item => item.gs.includes(genre.i)).sort(compareItems);
    genre.n = genre.titles.length;
    const rated = genre.titles.filter(item => item.rating !== null);
    genre.avg = rated.length ? rated.reduce((sum, item) => sum + item.rating, 0) / rated.length : null;
    genre.dist = Array.from({ length: 10 }, (_, k) => rated.filter(item => item.rating === k + 1).length);
  }

  // Heimat: seltenstes Genre des Titels (bei Gleichstand das zuerst gezählte)
  for (const item of items) {
    item.home = item.gs.reduce((best, i) => (genres[i].n < genres[best].n || (genres[i].n === genres[best].n && i < best) ? i : best), item.gs[0]);
  }
  for (const genre of genres) {
    genre.home = genre.titles.filter(item => item.home === genre.i);
    genre.galaxy = galaxyRadius(genre.home.length);
    genre.radius = Math.max(5 + Math.sqrt(genre.n) * 1.05, genre.galaxy);
  }

  const edges = pairCounts(items);
  const maxPair = Math.max(0, ...edges.map(edge => edge.w));
  const strong = edges.filter(edge => edge.w >= Math.max(2, Math.ceil(maxPair * 0.1)));
  layoutStars(genres, strong);

  // Titel ins Raster ihrer Galaxie
  for (const genre of genres) {
    galaxyCells(genre.home.length).forEach(([cx, cy], k) => {
      genre.home[k].x = genre.x + cx * CELL.w;
      genre.home[k].y = genre.y + cy * CELL.h;
    });
  }

  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const genre of genres) {
    const r = Math.max(genre.radius, genre.galaxy) + 18;
    bounds.x0 = Math.min(bounds.x0, genre.x - r); bounds.x1 = Math.max(bounds.x1, genre.x + r);
    bounds.y0 = Math.min(bounds.y0, genre.y - r); bounds.y1 = Math.max(bounds.y1, genre.y + r);
  }
  if (!genres.length) Object.assign(bounds, { x0: -100, y0: -70, x1: 100, y1: 70 });

  return { mode, items, genres, edges: strong, bounds };
}

/**
 * Wie viele Titel gehören zu je zwei Genres?
 * @param {Array<{gs: number[]}>} items
 * @returns {Array<{a: number, b: number, w: number}>} absteigend nach w.
 */
export function pairCounts(items) {
  const map = new Map();
  for (const item of items) {
    const gs = [...new Set(item.gs)].sort((a, b) => a - b);
    for (let x = 0; x < gs.length; x++) for (let y = x + 1; y < gs.length; y++) {
      const key = `${gs[x]},${gs[y]}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return [...map].map(([key, w]) => { const [a, b] = key.split(",").map(Number); return { a, b, w }; })
    .sort((p, q) => q.w - p.w || p.a - q.a || p.b - q.b);
}

/**
 * Nachbarn eines Genres nach Anzahl gemeinsamer Titel.
 * @returns {Array<{i: number, w: number}>}
 */
export function genreNeighbors(genreIndex, edges) {
  return edges.filter(edge => edge.a === genreIndex || edge.b === genreIndex)
    .map(edge => ({ i: edge.a === genreIndex ? edge.b : edge.a, w: edge.w }))
    .sort((p, q) => q.w - p.w || p.i - q.i);
}

/**
 * Schnittmengen im Stil von UpSet: größte Paare und Dreier innerhalb eines Genres.
 * @param {{i: number, titles: Array<{gs: number[]}>}} genre
 * @returns {Array<{with: number[], count: number}>} with = weitere Genre-Indizes.
 */
export function genreIntersections(genre, { pairs = 4, triples = 3 } = {}) {
  const map = new Map();
  for (const item of genre.titles) {
    const others = [...new Set(item.gs)].filter(i => i !== genre.i).sort((a, b) => a - b);
    for (let x = 0; x < others.length; x++) {
      map.set(`${others[x]}`, (map.get(`${others[x]}`) || 0) + 1);
      for (let y = x + 1; y < others.length; y++) {
        const key = `${others[x]},${others[y]}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }
  const all = [...map].map(([key, count]) => ({ with: key.split(",").map(Number), count }))
    .sort((p, q) => q.count - p.count || p.with.join().localeCompare(q.with.join()));
  return [
    ...all.filter(entry => entry.with.length === 1).slice(0, pairs),
    ...all.filter(entry => entry.with.length === 2 && entry.count > 1).slice(0, triples),
  ];
}

/**
 * Umriss einer Menge (Bubble Sets) als SVG-Pfad.
 * @param {Array<{x: number, y: number}>} members
 * @param {Array<{x: number, y: number}>} others - alle übrigen Titel (stoßen ab).
 * @returns {string} Pfad mit geschlossenen Linien („evenodd" für Löcher), "" ohne Mitglieder.
 */
export function bubblePath(members, others = []) {
  const placed = members.filter(m => Number.isFinite(m.x) && Number.isFinite(m.y));
  if (!placed.length) return "";
  const S = 1.5, RM = 4.4, RE = 2.2, RN = 2.6, TH = 0.45, PAD = 9;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of placed) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x); y1 = Math.max(y1, m.y); }
  x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
  const nx = Math.ceil((x1 - x0) / S), ny = Math.ceil((y1 - y0) / S), cols = nx + 1;
  const M = new Float32Array(cols * (ny + 1)), E = new Float32Array(cols * (ny + 1));
  const add = (F, x, y, R, w) => {
    const i0 = Math.max(0, Math.floor((x - R - x0) / S)), i1 = Math.min(nx, Math.ceil((x + R - x0) / S));
    const j0 = Math.max(0, Math.floor((y - R - y0) / S)), j1 = Math.min(ny, Math.ceil((y + R - y0) / S));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = x0 + i * S - x, dy = y0 + j * S - y, q = (dx * dx + dy * dy) / (R * R);
      if (q < 1) F[j * cols + i] += w * (1 - q) * (1 - q);
    }
  };
  for (const m of placed) add(M, m.x, m.y, RM, 1);
  for (const o of others) if (o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1) add(M, o.x, o.y, RN, -2);

  // minimaler Spannbaum (Prim) als virtuelle Kanten: hält die Menge zusammen
  const n = placed.length, best = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), used = new Uint8Array(n);
  best[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let v = 0; v < n; v++) if (!used[v] && (u < 0 || best[v] < best[u])) u = v;
    used[u] = 1;
    if (from[u] >= 0) {
      const a = placed[from[u]], b = placed[u], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 3.7) for (let s = 0; s <= d; s += 1.1) add(E, a.x + (b.x - a.x) * s / d, a.y + (b.y - a.y) * s / d, RE, 0.8);
    }
    for (let v = 0; v < n; v++) if (!used[v]) {
      const d = (placed[v].x - placed[u].x) ** 2 + (placed[v].y - placed[u].y) ** 2;
      if (d < best[v]) { best[v] = d; from[v] = u; }
    }
  }
  const value = k => Math.max(0, M[k]) + E[k];

  // Marching Squares; Teilstücke über gemeinsame Kanten zu Linien verknüpfen
  const points = new Map(), segments = [];
  const point = (key, ax, ay, av, bx, by, bv) => {
    if (!points.has(key)) { const t = (TH - av) / (bv - av); points.set(key, [x0 + (ax + (bx - ax) * t) * S, y0 + (ay + (by - ay) * t) * S]); }
    return key;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = value(j * cols + i), b = value(j * cols + i + 1), c = value((j + 1) * cols + i + 1), d = value((j + 1) * cols + i);
    const code = (a >= TH ? 8 : 0) | (b >= TH ? 4 : 0) | (c >= TH ? 2 : 0) | (d >= TH ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => point(`h${i},${j}`, i, j, a, i + 1, j, b);
    const R = () => point(`v${i + 1},${j}`, i + 1, j, b, i + 1, j + 1, c);
    const B = () => point(`h${i},${j + 1}`, i, j + 1, d, i + 1, j + 1, c);
    const L = () => point(`v${i},${j}`, i, j, a, i, j + 1, d);
    const centre = (a + b + c + d) / 4 >= TH;
    const seg = (p, q) => segments.push([p, q]);
    switch (code) {
      case 1: case 14: seg(L(), B()); break;
      case 2: case 13: seg(B(), R()); break;
      case 3: case 12: seg(L(), R()); break;
      case 4: case 11: seg(T(), R()); break;
      case 6: case 9: seg(T(), B()); break;
      case 7: case 8: seg(T(), L()); break;
      case 5: if (centre) { seg(T(), L()); seg(B(), R()); } else { seg(T(), R()); seg(L(), B()); } break;
      case 10: if (centre) { seg(T(), R()); seg(L(), B()); } else { seg(T(), L()); seg(B(), R()); } break;
    }
  }
  const byKey = new Map();
  segments.forEach((s, k) => s.forEach(key => { if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(k); }));
  const done = new Uint8Array(segments.length);
  const fmt = v => Math.round(v * 100) / 100;
  let path = "";
  for (let k = 0; k < segments.length; k++) {
    if (done[k]) continue;
    done[k] = 1;
    const loop = [segments[k][0]];
    let cur = segments[k][1];
    while (cur !== loop[0]) {
      loop.push(cur);
      const next = (byKey.get(cur) || []).find(s => !done[s]);
      if (next === undefined) break;
      done[next] = 1;
      cur = segments[next][0] === cur ? segments[next][1] : segments[next][0];
    }
    if (loop.length < 4) continue;
    // weich: Kurve durch die Mittelpunkte
    const p = loop.map(key => points.get(key));
    const mid = (u, v) => `${fmt((u[0] + v[0]) / 2)},${fmt((u[1] + v[1]) / 2)}`;
    path += `M${mid(p[p.length - 1], p[0])}`;
    for (let q = 0; q < p.length; q++) path += `Q${fmt(p[q][0])},${fmt(p[q][1])} ${mid(p[q], p[(q + 1) % p.length])}`;
    path += "Z";
  }
  return path;
}
