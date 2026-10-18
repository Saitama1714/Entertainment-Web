import { ownRating, constellationMovies } from "./constellation-logic.js";

/*
 * Registerkarte „Besetzung" unter Entertainment: wer hat bei deinen Titeln
 * Regie geführt, gespielt, das Drehbuch geschrieben - und wer arbeitet mit
 * wem? Reine Rechenlogik ohne DOM (getestet in tests/cast.test.mjs).
 *
 * Datenquellen:
 * - Regie: aus dem IMDb-Export (movie.directors), sonst aus OMDb.
 * - Darsteller und Drehbuch: nur aus OMDb (die ersten drei bis vier
 *   Darsteller je Titel). Gespeichert getrennt von den Titeln unter
 *   `castData` (IMDb-Kennung → {a, w, d, t}), damit der Abruf im Hintergrund
 *   nie mit dem Speichern der Titel kollidiert (js/cast-fetch.js).
 *
 * Das Netz: jede Person ein Punkt (Größe = Titel in der Ansicht), eine Linie
 * je Paar mit gemeinsamen Titeln (Stärke = Anzahl). Im Netz liegen nur
 * Personen mit mindestens MIN_CORE_TITLES Titeln („Kern"); alle übrigen
 * hängen nahe ihrer wichtigsten Verbindung und erscheinen erst beim
 * Hineinzoomen oder über die Suche.
 */

export const ROLES = ["dir", "act", "wri"];
export const ROLE_LABELS = { dir: "Regie", act: "Darsteller", wri: "Drehbuch" };
export const MIN_CORE_TITLES = 2;
/** Beschriftungen je Zoomstufe: so viele der größten Personen zeigen ihren Namen. */
export const LABEL_TIERS = [24, 80];

const NA = /^n\/a$/i;

/** Einheitlicher Schlüssel für einen Namen (Groß-/Kleinschreibung, Leerzeichen egal). */
export const personKey = name => String(name || "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("de");

/**
 * Namen aus einem OMDb-Feld („A, B, C"), ohne Zusätze in Klammern, ohne
 * Doppelte und ohne „N/A".
 * @param {string} text
 * @returns {string[]}
 */
export function splitNames(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(",")) {
    const name = part.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const key = personKey(name);
    if (!name || NA.test(name) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/*
 * Drehbuch: OMDb nennt auch Vorlagen („Bob Kane (characters)", „Stephen King
 * (novel)"). Die sind keine Drehbuch-Autoren und bleiben draußen;
 * „(screenplay)", „(story)", „(written by)", „(teleplay)" oder ohne Zusatz zählen.
 */
const SOURCE_CREDIT = /\b(characters?|based on|novel|book|books|comic|comics|play|article|created by|creator|inspired|source|original film|poem|series|graphic)\b/i;

/**
 * Drehbuch-Namen aus dem OMDb-Feld „Writer".
 * @param {string} text
 * @returns {string[]}
 */
export function splitWriters(text) {
  const kept = String(text || "").split(",").filter(part => {
    const note = (part.match(/\(([^)]*)\)/) || [])[1] || "";
    return !SOURCE_CREDIT.test(note);
  });
  return splitNames(kept.join(","));
}

/**
 * Besetzung aus einem OMDb-Datensatz.
 * @param {{Actors?: string, Writer?: string, Director?: string}} data
 * @param {string} [today] - Datum des Abrufs (ISO), Standard: jetzt.
 * @returns {{a: string[], w: string[], d: string[], t: string}}
 */
export function parseOmdbCast(data, today = new Date().toISOString()) {
  return {
    a: splitNames(data?.Actors),
    w: splitWriters(data?.Writer),
    d: splitNames(data?.Director),
    t: today.slice(0, 10),
  };
}

/** Liest einen gespeicherten castData-Wert; Kaputtes fällt weg. */
export function readCastData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const list = v => (Array.isArray(v) ? v.filter(name => typeof name === "string" && name.trim()) : []);
  const out = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!/^tt\d+$/i.test(id) || !entry || typeof entry !== "object") continue;
    out[id] = { a: list(entry.a), w: list(entry.w), d: list(entry.d), t: typeof entry.t === "string" ? entry.t : "" };
  }
  return out;
}

/** Hat der Eintrag irgendeine Angabe (oder kannte OMDb den Titel ohne Besetzung)? */
const hasCast = entry => entry && (entry.a.length || entry.w.length);

/**
 * Titel, deren Besetzung noch fehlt - in der Reihenfolge des Abrufs:
 * zuerst Titel ohne Cover (dieselbe Anfrage bringt das Cover mit, Cover
 * gehen vor), dann bewertete (die Standard-Ansicht füllt sich zuerst), dann
 * nach eigener Bewertung.
 * @param {Array} movies
 * @param {Object} castData
 * @returns {Array} Titel (je IMDb-Kennung nur einmal).
 */
export function castTargets(movies, castData) {
  const seen = new Set();
  const out = [];
  for (const movie of movies) {
    const id = String(movie.imdbId || "").trim();
    if (!id || seen.has(id) || castData[id]) continue;
    seen.add(id);
    out.push(movie);
  }
  const noCover = movie => (String(movie.cover || "").trim() ? 1 : 0);
  return out.sort((a, b) => noCover(a) - noCover(b) || (ownRating(b) ?? 0) - (ownRating(a) ?? 0));
}

/**
 * Stand des Abrufs: wie viele Titel (mit IMDb-Kennung) es gibt, wie viele
 * schon abgefragt sind und bei wie vielen OMDb keine Besetzung kennt.
 * @returns {{total: number, done: number, empty: number, remaining: number}}
 */
export function castStatus(movies, castData) {
  const ids = new Set(movies.map(movie => String(movie.imdbId || "").trim()).filter(Boolean));
  let done = 0, empty = 0;
  for (const id of ids) {
    if (!castData[id]) continue;
    done++;
    if (!hasCast(castData[id])) empty++;
  }
  return { total: ids.size, done, empty, remaining: ids.size - done };
}

/** castData ohne Titel, die es nicht mehr gibt. */
export function pruneCastData(castData, movies) {
  const ids = new Set(movies.map(movie => String(movie.imdbId || "").trim()).filter(Boolean));
  return Object.fromEntries(Object.entries(castData).filter(([id]) => ids.has(id)));
}

/** castData ohne die Einträge, bei denen OMDb nichts wusste („erneut versuchen"). */
export const dropEmptyCast = castData => Object.fromEntries(Object.entries(castData).filter(([, entry]) => hasCast(entry)));

/**
 * Wann das OMDb-Tageslimit wieder frei ist: Mitternacht (UTC) plus ein paar
 * Minuten Sicherheitsabstand. Liegt OMDb daneben, kostet das nur eine
 * Anfrage, die erneut am Limit scheitert.
 * @param {number} now - ms
 * @returns {string} ISO-Zeitpunkt.
 */
export function nextQuotaReset(now) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 10)).toISOString();
}

/**
 * Wer bei einem Titel mitgewirkt hat, je Person einmal mit allen Rollen.
 * Regie aus dem IMDb-Export, sonst aus OMDb.
 * @returns {Array<{key: string, name: string, roles: Set<string>}>}
 */
export function creditsOf(movie, castData) {
  const entry = castData[String(movie.imdbId || "").trim()];
  const directors = splitNames(movie.directors);
  const byKey = new Map();
  const add = (name, role) => {
    const key = personKey(name);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, { key, name, roles: new Set() });
    byKey.get(key).roles.add(role);
  };
  (directors.length ? directors : entry?.d || []).forEach(name => add(name, "dir"));
  (entry?.w || []).forEach(name => add(name, "wri"));
  (entry?.a || []).forEach(name => add(name, "act"));
  return [...byKey.values()];
}

/** Hauptrolle einer Person: die häufigste, bei Gleichstand Regie vor Drehbuch vor Darsteller. */
function primaryRole(counts) {
  return ["dir", "wri", "act"].reduce((best, role) => (counts[role] > counts[best] ? role : best), "dir");
}

/** „Regie · Drehbuch" usw. in fester Reihenfolge. */
export function roleLabel(roles) {
  return ["dir", "wri", "act"].filter(role => roles[role] > 0).map(role => ROLE_LABELS[role]).join(" · ") || "Mitwirkende";
}

/**
 * Baut das Netz aus einer (gefilterten) Titelliste.
 * @param {Array} movies
 * @param {Object} castData
 * @param {{mode?: "rated"|"all"}} [options]
 * @returns {{items: Array, persons: Array, edges: Array, core: Array, bounds: object}}
 *   items: {id, movie, title, year, rating, people: number[]}
 *   persons: {i, key, name, roles: {dir, act, wri}, primary, both, titles: number[],
 *     n, avg, dist, rated, core, rank, tier, r, x, y}
 *   edges (nur zwischen Kern-Personen): {a, b, w}
 */
export function buildCastGraph(movies, castData, { mode = "rated" } = {}) {
  const items = [];
  const persons = [];
  const index = new Map();
  for (const movie of constellationMovies(movies, mode)) {
    const credits = creditsOf(movie, castData);
    if (!credits.length) continue;
    const item = {
      id: movie.id, movie,
      title: String(movie.title || ""), year: String(movie.year || ""),
      rating: ownRating(movie), people: [],
    };
    const k = items.length;
    items.push(item);
    for (const credit of credits) {
      let i = index.get(credit.key);
      if (i === undefined) {
        i = persons.length;
        index.set(credit.key, i);
        persons.push({ i, key: credit.key, name: credit.name, roles: { dir: 0, act: 0, wri: 0 }, titles: [] });
      }
      const person = persons[i];
      for (const role of credit.roles) person.roles[role]++;
      person.titles.push(k);
      item.people.push(i);
    }
  }

  for (const person of persons) {
    const ratings = person.titles.map(k => items[k].rating).filter(v => v !== null);
    person.n = person.titles.length;
    person.rated = ratings.length;
    person.avg = ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null;
    person.dist = Array.from({ length: 10 }, (_, k) => ratings.filter(v => v === k + 1).length);
    person.primary = primaryRole(person.roles);
    person.both = person.roles.dir > 0 && person.roles.wri > 0;
    person.core = person.n >= MIN_CORE_TITLES;
    person.r = 3 + Math.sqrt(person.n) * 2.4;
    // Titel der Person: beste zuerst
    person.titles.sort((a, b) => (items[b].rating ?? 0) - (items[a].rating ?? 0) || items[a].title.localeCompare(items[b].title, "de"));
  }

  // Rangfolge: Titel, dann Durchschnitt, dann Name
  const ranked = [...persons].sort(comparePersons);
  ranked.forEach((person, rank) => {
    person.rank = rank;
    person.tier = !person.core ? 3 : rank < LABEL_TIERS[0] ? 0 : rank < LABEL_TIERS[1] ? 1 : 2;
  });

  // Linien zwischen Kern-Personen (gemeinsame Titel)
  const pairs = new Map();
  for (const item of items) {
    const core = item.people.filter(i => persons[i].core);
    for (let x = 0; x < core.length; x++) for (let y = x + 1; y < core.length; y++) {
      const a = Math.min(core[x], core[y]), b = Math.max(core[x], core[y]);
      const key = a * 1e6 + b;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  const edges = [...pairs].map(([key, w]) => ({ a: Math.floor(key / 1e6), b: key % 1e6, w }));

  const core = ranked.filter(person => person.core);
  layoutCast(core, edges);
  placePeripheral(persons, items);
  return { items, persons, edges, core, bounds: boundsOf(persons) };
}

/** Reihenfolge der Rangliste: mehr Titel, dann bessere Bewertung, dann Name. */
export function comparePersons(a, b) {
  return b.n - a.n || (b.avg ?? 0) - (a.avg ?? 0) || a.name.localeCompare(b.name, "de");
}

/**
 * Rangliste, optional nur eine Rolle.
 * @param {Array} persons
 * @param {"all"|"dir"|"act"|"wri"} role
 * @param {number} [limit]
 */
export function castRanking(persons, role = "all", limit = 50) {
  return persons
    .filter(person => role === "all" || person.roles[role] > 0)
    .sort((a, b) => (role === "all" ? comparePersons(a, b) : b.roles[role] - a.roles[role] || comparePersons(a, b)))
    .slice(0, limit);
}

/**
 * Mit wem eine Person am häufigsten zusammen auftaucht (alle Personen, nicht
 * nur der Kern).
 * @returns {Array<{i: number, w: number}>}
 */
export function castPartners(graph, i, limit = 6) {
  const tally = new Map();
  for (const k of graph.persons[i].titles) {
    for (const other of graph.items[k].people) if (other !== i) tally.set(other, (tally.get(other) || 0) + 1);
  }
  return [...tally]
    .map(([other, w]) => ({ i: other, w }))
    .sort((a, b) => b.w - a.w || comparePersons(graph.persons[a.i], graph.persons[b.i]))
    .slice(0, limit);
}

/**
 * Personen, die zur Suche passen: deren Name den Suchbegriff enthält - oder,
 * wenn kein Name passt, alle, die an einem der gefundenen Titel mitgewirkt
 * haben (Suche nach einem Filmtitel).
 * @param {object} graph
 * @param {string} query
 * @param {Set<string>} [titleIds] - IDs der Titel, die die Suche gefunden hat.
 * @returns {Set<number>|null} null = keine Suche.
 */
export function castMatches(graph, query, titleIds = new Set()) {
  const q = personKey(query);
  if (!q) return null;
  const byName = new Set(graph.persons.filter(person => person.key.includes(q)).map(person => person.i));
  if (byName.size) return byName;
  const out = new Set();
  for (const person of graph.persons) {
    if (person.titles.some(k => titleIds.has(graph.items[k].id))) out.add(person.i);
  }
  return out;
}

/*
 * Kräfte-Layout des Kerns: Federn entlang der Linien (je mehr gemeinsame
 * Titel, desto kürzer), Abstoßung nur in der Nachbarschaft (Raster - auch bei
 * mehreren hundert Personen schnell), leichter Zug zur Mitte. Ohne Zufall:
 * Startlage auf einer Spirale nach Rangfolge, also bei gleichen Daten immer
 * dasselbe Bild.
 */
const REACH = 90;
const cellKey = (gx, gy) => (gx + 32768) * 65536 + (gy + 32768);

/** Raster der Punkte: je Zelle (REACH × REACH) die Punkte darin. */
function gridOf(nodes) {
  const grid = new Map();
  for (const n of nodes) {
    n.gx = Math.floor(n.x / REACH); n.gy = Math.floor(n.y / REACH);
    const key = cellKey(n.gx, n.gy);
    const cell = grid.get(key);
    if (cell) cell.push(n); else grid.set(key, [n]);
  }
  return grid;
}

/** Ruft fn(A, B, dx, dy, d2) für alle Paare in Reichweite auf (jedes Paar zweimal, je Seite einmal). */
function eachNear(nodes, grid, fn) {
  for (const A of nodes) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(cellKey(A.gx + dx, A.gy + dy));
      if (!cell) continue;
      for (let c = 0; c < cell.length; c++) {
        const B = cell[c];
        if (B === A) continue;
        const vx = A.x - B.x, vy = A.y - B.y, d2 = vx * vx + vy * vy + 0.01;
        if (d2 < REACH * REACH) fn(A, B, vx, vy, d2);
      }
    }
  }
}

function layoutCast(core, edges, { iterations = 160, settle = 60 } = {}) {
  if (!core.length) return;
  const sim = new Map();
  core.forEach((person, k) => {
    const angle = k * 2.39996, r = 22 * Math.sqrt(k + 1);
    sim.set(person.i, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0, r: person.r });
  });
  const nodes = [...sim.values()];
  // Federn: je Person geteilt durch die Wurzel ihrer Verbindungen - sonst
  // ziehen viel vernetzte Personen das ganze Netz zu einem Knäuel zusammen
  const degree = new Map();
  for (const edge of edges) { degree.set(edge.a, (degree.get(edge.a) || 0) + 1); degree.set(edge.b, (degree.get(edge.b) || 0) + 1); }
  const springs = edges.map(edge => [sim.get(edge.a), sim.get(edge.b), edge.w, 1 / Math.sqrt(Math.max(degree.get(edge.a), degree.get(edge.b)))]);
  // Zug zur Mitte: bei großen Netzen schwächer, damit sie Platz bekommen
  const gravity = 0.006 * Math.min(1, 5 / Math.sqrt(nodes.length));
  let maxW = 1;
  for (const edge of edges) if (edge.w > maxW) maxW = edge.w;
  const repel = (A, B, vx, vy, d2) => {
    const d = Math.sqrt(d2), min = A.r + B.r + 14;
    const force = 900 / d2 + (d < min ? (min - d) * 0.5 : 0);
    A.vx += vx / d * force; A.vy += vy / d * force;
  };
  for (let it = 0; it < iterations; it++) {
    const heat = 1 - it / iterations;
    eachNear(nodes, gridOf(nodes), repel);
    for (const [A, B, w, damp] of springs) {
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = A.r + B.r + 26 + 20 / w;
      const force = (d - target) * 0.03 * (0.5 + w / maxW) * damp;
      A.vx += dx / d * force; A.vy += dy / d * force; B.vx -= dx / d * force; B.vy -= dy / d * force;
    }
    for (const n of nodes) {
      n.vx -= n.x * gravity; n.vy -= n.y * gravity;
      const v = Math.hypot(n.vx, n.vy), cap = 18;
      if (v > cap) { n.vx *= cap / v; n.vy *= cap / v; }
      n.x += n.vx * heat; n.y += n.vy * heat;
      n.vx *= 0.5; n.vy *= 0.5;
    }
  }
  // Dichte ausgleichen: das Netz so weit aufziehen, dass alle Punkte samt
  // Abstand Platz hätten (Form bleibt, nur größer)
  const need = nodes.reduce((sum, n) => sum + (2 * n.r + 16) ** 2, 0) * 1.25;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const have = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) * 0.785;
  const grow = Math.sqrt(need / have);
  if (grow > 1) for (const n of nodes) { n.x *= grow; n.y *= grow; }
  // Zum Schluss nur noch auseinanderschieben, was sich überdeckt (Platz für Namen)
  for (let it = 0; it < settle; it++) {
    let moved = 0;
    eachNear(nodes, gridOf(nodes), (A, B, vx, vy, d2) => {
      const d = Math.sqrt(d2), min = A.r + B.r + 8;
      if (d >= min) return;
      const push = (min - d) * 0.5;
      A.x += vx / d * push; A.y += vy / d * push;
      moved++;
    });
    if (!moved) break;
  }
  for (const person of core) { const n = sim.get(person.i); person.x = n.x; person.y = n.y; }
}

/**
 * Personen außerhalb des Kerns: in einem kleinen Kranz um ihre wichtigste
 * Kern-Verbindung. Ohne Kern-Verbindung bleiben sie ohne Platz (x = null) und
 * sind nur über die Suche und die Rangliste zu finden.
 */
function placePeripheral(persons, items) {
  const rings = new Map();
  for (const person of persons) {
    if (person.core) continue;
    person.x = person.y = null;
    const tally = new Map();
    for (const k of person.titles) for (const other of items[k].people) {
      if (persons[other].core) tally.set(other, (tally.get(other) || 0) + 1);
    }
    let best = -1, bestW = 0;
    for (const [other, w] of tally) {
      if (w > bestW || (w === bestW && comparePersons(persons[other], persons[best] || persons[other]) < 0)) { best = other; bestW = w; }
    }
    if (best < 0) continue;
    const anchor = persons[best];
    let slot = rings.get(best) || 0;
    rings.set(best, slot + 1);
    // Kränze nach außen: je Kranz so viele Plätze, wie mit Abstand hineinpassen
    let ring = 0, dist = anchor.r + 12, cap = Math.max(6, Math.floor(2 * Math.PI * dist / 11));
    while (slot >= cap) { slot -= cap; ring++; dist += 11; cap = Math.max(6, Math.floor(2 * Math.PI * dist / 11)); }
    const angle = slot * (Math.PI * 2 / cap) + ring * 0.5 + anchor.i * 0.7;
    person.x = anchor.x + Math.cos(angle) * dist;
    person.y = anchor.y + Math.sin(angle) * dist;
    person.anchor = best;
  }
}

function boundsOf(persons) {
  const placed = persons.filter(p => p.core && Number.isFinite(p.x));
  if (!placed.length) return { x0: -50, y0: -50, x1: 50, y1: 50 };
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of placed) {
    b.x0 = Math.min(b.x0, p.x - p.r - 20); b.x1 = Math.max(b.x1, p.x + p.r + 20);
    b.y0 = Math.min(b.y0, p.y - p.r - 20); b.y1 = Math.max(b.y1, p.y + p.r + 28);
  }
  return b;
}
