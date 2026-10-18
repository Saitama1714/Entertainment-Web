import { own, has } from "../utils/host.js";
import { $, escapeHtml, reducedMotion } from "../utils/dom.js";
import { constellationSignature } from "../logic/view-logic.js";
import {
  CONSTELLATION_MODES, DEFAULT_CONSTELLATION_MODE, CELL, POSTER,
  buildConstellation, bubblePath, genreNeighbors, genreIntersections,
} from "../logic/constellation-logic.js";

/*
 * Registerkarte „Sternbild" unter Entertainment: die Titel nach Genre als
 * frei zoombare Karte. Drei Stufen, je nach Zoom: Sterne (ein Stern je
 * Genre) → Galaxien (ein Punkt je Titel, in der Galaxie seines seltensten
 * Genres) → Cover. Ein Stern oder Galaxie-Name öffnet die Genre-Karte und
 * legt einen Umriss um alle Titel des Genres (Bubble Sets), auch in anderen
 * Galaxien; eine Schnittmenge darin legt einen zweiten, roten Umriss. Ein
 * Cover öffnet die Filmkarte und zieht Fäden zu seinen anderen Genres.
 *
 * Bedienung: Mausrad / zwei Finger zoomen, Ziehen verschiebt, Doppelklick
 * zoomt hinein; +, − und „Alles" oben links; Esc schließt die Karte.
 * Cover werden erst ab der Cover-Stufe und nur für den sichtbaren Ausschnitt
 * angelegt (bei 1.000+ Titeln wichtig).
 *
 * Rechenlogik: js/logic/constellation-logic.js.
 */

const NS = "http://www.w3.org/2000/svg";
const fmt = n => n.toLocaleString("de-DE");
const f1 = n => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const level = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
// Plakatfarben für Titel ohne Cover (wie ein Filmplakat - in beiden Designs gleich)
const POSTER_COLORS = [["#3b1d1a", "#7a2e24"], ["#16242e", "#2f5464"], ["#1f2a1c", "#4b6236"], ["#2b1f33", "#5d3f73"], ["#2e2412", "#7a5c1c"], ["#1a1a1f", "#4a4a58"], ["#331414", "#9c0205"], ["#122a2a", "#2d6b66"]];
// Cover wie im Raster (movie-card.js): als Bildquelle, nie als Link
const coverOf = movie => (typeof movie.cover === "string" ? movie.cover.trim() : "");
const hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

function el(parent, tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (text != null) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** Titel in Zeilen für das Ersatzplakat. */
function wrapTitle(title, max = 11, lines = 4) {
  const out = [];
  let cur = "";
  for (const word of title.split(/\s+/)) {
    if ((cur + " " + word).trim().length > max && cur) { out.push(cur); cur = word; } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.?$/, "…"); }
  return out;
}

/**
 * Baut das Sternbild in das Panel ein.
 * @param {HTMLElement} panel - #constellation-panel mit #constellation-stage und #constellation-foot.
 * @param {object} [options]
 * @param {string} [options.mode] - Ansicht beim Start ("rated" oder "all").
 * @param {(mode: string) => void} [options.onModeChange]
 * @param {{sig: string, cx: number, cy: number, w: number}} [options.camera] - gemerkter
 *   Ausschnitt; gilt nur, wenn die Karte gleich aussieht (sig).
 * @param {(camera: {sig: string, cx: number, cy: number, w: number}) => void} [options.onCameraChange]
 *   - nach dem Zoomen/Verschieben (beruhigt, nicht bei jedem Bild).
 * @param {(genres: string[]) => void} [options.onShowTitles] - „Im Raster zeigen":
 *   ein Genre oder eine Schnittmenge (alle Genres zugleich).
 * @returns {{update: (movies: Array) => void, show: () => void, mode: () => string}}
 */
export function initConstellation(panel, {
  mode: startMode = DEFAULT_CONSTELLATION_MODE,
  onModeChange = () => {},
  camera: savedCamera = null,
  onCameraChange = () => {},
  onShowTitles = null,
} = {}) {
  let pendingCamera = savedCamera;
  let signature = "";
  let cameraTimer = 0;
  const stage = $("#constellation-stage", panel);
  const foot = $("#constellation-foot", panel);
  // Website ohne veröffentlichte eigene Bewertung: nur „Ganze Sammlung"
  const modes = has("rating") ? CONSTELLATION_MODES : ["all"];
  let mode = modes.includes(startMode) ? startMode : modes.includes(DEFAULT_CONSTELLATION_MODE) ? DEFAULT_CONSTELLATION_MODE : modes[0];
  let movies = [];
  let data = null;
  let stale = true;
  let selA = null, selB = null, selItem = null;
  const bubbleCache = new Map();
  const posterEls = new Map();

  /* ---------------- Gerüst ---------------- */
  stage.innerHTML = `
    <div class="cs-tools">
      <button type="button" class="cs-tool" data-cs="in" aria-label="Näher heran">+</button>
      <button type="button" class="cs-tool" data-cs="out" aria-label="Weiter weg">−</button>
      <button type="button" class="cs-tool" data-cs="all">Alles</button>
    </div>
    <div class="cs-levels" role="group" aria-label="Zoomstufe">
      <button type="button" data-level="0"><i></i>Sterne</button>
      <button type="button" data-level="1"><i></i>Galaxien</button>
      <button type="button" data-level="2"><i></i>Cover</button>
    </div>
    <div class="cs-legend" aria-hidden="true">
      <span><i class="cs-key"></i>Titel</span>
      ${has("rating") ? `<span><i class="cs-key is-top"></i>${own("deine", "meine")} 9 und 10</span>` : ""}
      <span><b class="cs-home">⌂ 12</b> Titel, die hier wohnen – ihr seltenstes Genre</span>
    </div>
    <aside class="cs-card" aria-live="polite" hidden></aside>
    <p class="cs-empty" hidden></p>`;
  const svg = el(stage, "svg", {
    class: "cs-map", role: "application", tabindex: 0,
    "aria-label": "Karte der Genres. Pfeiltasten wählen ein Cover, Plus und Minus zoomen, Escape schließt die Karte, Tab erreicht die Sterne.",
  });
  stage.insertBefore(svg, stage.firstChild);
  const defs = el(svg, "defs");
  const clip = el(defs, "clipPath", { id: "cs-clip", clipPathUnits: "objectBoundingBox" });
  el(clip, "rect", { width: 1, height: 1, rx: 0.06, ry: 0.04 });
  const L = {};
  for (const name of ["dust", "edges", "stars", "bubbles", "dots", "posters", "threads", "slabels", "glabels"]) L[name] = el(svg, "g", { class: `cs-${name}` });
  const card = $(".cs-card", stage);
  const emptyNote = $(".cs-empty", stage);
  const tip = document.createElement("div");
  tip.className = "cs-tip";
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);

  const showTip = (event, html) => {
    tip.innerHTML = html;
    tip.classList.add("is-visible");
    const x = Math.min(event.clientX + 14, innerWidth - tip.offsetWidth - 8), y = event.clientY + 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y + tip.offsetHeight > innerHeight ? event.clientY - tip.offsetHeight - 12 : y}px`;
  };
  const hideTip = () => tip.classList.remove("is-visible");

  /* ---------------- Kamera ---------------- */
  const cam = { x: 0, y: 0, w: 1, h: 1, raf: 0 };
  let aspect = 0.6, pxWidth = 1, homeW = 1;
  const unit = () => cam.w / pxWidth; // Welt-Einheiten je Bildschirmpunkt
  const minW = () => POSTER.w / 120 * pxWidth;
  const maxW = () => homeW * 1.25;

  function measure() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pxWidth = rect.width;
    aspect = rect.height / rect.width;
    return true;
  }
  function apply() {
    cam.h = cam.w * aspect;
    svg.setAttribute("viewBox", `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
    svg.style.setProperty("--u", unit());
    levels();
    // Ausschnitt merken, sobald die Kamera zur Ruhe kommt
    clearTimeout(cameraTimer);
    if (signature) cameraTimer = setTimeout(() => onCameraChange({ sig: signature, cx: cam.x + cam.w / 2, cy: cam.y + cam.h / 2, w: cam.w }), 500);
  }
  function setCam(x, y, w) {
    cancelAnimationFrame(cam.raf);
    w = clamp(w, minW(), maxW());
    Object.assign(cam, { x, y, w });
    apply();
  }
  const centre = () => [cam.x + cam.w / 2, cam.y + cam.h / 2];
  /** Kamerafahrt: weich, bei weiten Wegen kurz herausgezoomt. */
  function fly(cx, cy, w, ms = 900) {
    cancelAnimationFrame(cam.raf);
    w = clamp(w, minW(), maxW());
    if (reducedMotion()) { setCam(cx - w / 2, cy - w * aspect / 2, w); return; }
    const [sx, sy] = centre(), sw = cam.w, t0 = performance.now();
    const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const peak = Math.max(sw, w, Math.min(homeW, Math.hypot(cx - sx, cy - sy) * 1.6));
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = ease(p);
      const lw = Math.log(sw) + (Math.log(w) - Math.log(sw)) * e;
      const bump = Math.max(0, (Math.log(peak) - Math.max(Math.log(sw), Math.log(w))) * Math.sin(Math.PI * e));
      const ww = Math.exp(lw + bump), x = sx + (cx - sx) * e, y = sy + (cy - sy) * e;
      Object.assign(cam, { w: ww, x: x - ww / 2, y: y - ww * aspect / 2 });
      apply();
      if (p < 1) cam.raf = requestAnimationFrame(step);
    };
    cam.raf = requestAnimationFrame(step);
  }
  function home(ms = 0) {
    if (!data) return;
    const b = data.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    homeW = Math.max(bw, bh / aspect) * 1.04;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (ms) fly(cx, cy, homeW, ms); else setCam(cx - homeW / 2, cy - homeW * aspect / 2, homeW);
  }
  function zoomAt(px, py, factor, ms) {
    const w = clamp(cam.w / factor, minW(), maxW());
    const nx = px - (px - cam.x) * (w / cam.w), ny = py - (py - cam.y) * (w / cam.w);
    if (ms) fly(nx + w / 2, ny + w * aspect / 2, w, ms); else setCam(nx, ny, w);
  }
  const toWorld = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    return [cam.x + (clientX - rect.left) / rect.width * cam.w, cam.y + (clientY - rect.top) / rect.height * cam.h];
  };

  /* ---------------- Zoomstufen ---------------- */
  let cullQueued = false;
  function levels() {
    const u = unit(), cellPx = CELL.w / u, posterPx = POSTER.w / u, zoom = homeW / cam.w;
    // Übersicht immer als Sterne; ab etwa 1,5-fach Galaxien. Ist ein Genre
    // gewählt, zeigt schon die Übersicht die Galaxien (sonst wäre der Umriss leer)
    const gal = selA ? 1 : Math.max(level(zoom, 1.35, 2.1), level(cellPx, 9, 14));
    const cov = level(posterPx, 13, 22);
    L.stars.style.opacity = 1 - 0.88 * gal;
    L.edges.style.opacity = 1 - gal;
    L.slabels.style.opacity = 1 - gal;
    L.slabels.style.display = gal >= 1 ? "none" : "";
    L.dots.style.opacity = gal * (1 - cov);
    L.dots.style.display = gal <= 0 || cov >= 1 ? "none" : "";
    L.glabels.style.opacity = gal;
    L.glabels.style.display = gal <= 0 ? "none" : "";
    L.posters.style.opacity = cov;
    L.posters.style.display = cov <= 0 ? "none" : "";
    L.bubbles.style.opacity = Math.max(0.5, gal);
    L.dots.style.setProperty("--dot", `${clamp(cellPx * 0.36, 1.1, 9) * u}px`);
    const current = posterPx >= 18 ? 2 : gal >= 0.5 ? 1 : 0;
    stage.querySelectorAll("[data-level]").forEach(button => button.classList.toggle("is-on", Number(button.dataset.level) === current));
    if (cov > 0 && !cullQueued) { cullQueued = true; requestAnimationFrame(() => { cullQueued = false; buildVisiblePosters(); }); }
    if (data) {
      const hints = ["Stern antippen oder hineinzoomen", "Weiter hinein für Cover · Namen öffnen die Genre-Karte", "Cover antippen für die Filmkarte"];
      foot.textContent = `${fmt(data.items.length)} Titel · ${fmt(data.genres.length)} Genres · ${hints[current]}`;
    }
  }

  /* ---------------- Zeichnen ---------------- */
  function rebuild() {
    data = buildConstellation(movies, { mode });
    stale = false;
    generation++;
    queue.length = 0;
    waiting.clear();
    bubbleCache.clear();
    posterEls.clear();
    selA = selB = selItem = null;
    closeCard(false);
    for (const layer of Object.values(L)) layer.replaceChildren();
    emptyNote.hidden = data.items.length > 0;
    emptyNote.textContent = mode === "rated" && movies.length
      ? "Keine bewerteten Titel für diese Auswahl. „Ganze Sammlung“ zeigt alle."
      : "Keine Titel für diese Auswahl.";
    svg.style.visibility = data.items.length ? "" : "hidden";
    signature = data.items.length ? constellationSignature(mode, data.items, data.genres) : "";
    if (!data.items.length) { foot.textContent = ""; return; }

    // Sternenstaub (immer gleich, nur Kulisse)
    const b = data.bounds;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) {
      el(L.dust, "circle", { cx: b.x0 - 80 + rnd() * (b.x1 - b.x0 + 160), cy: b.y0 - 80 + rnd() * (b.y1 - b.y0 + 160), r: 0.3 + rnd() * 0.8 });
    }
    const edgeMax = Math.max(1, ...data.edges.map(edge => edge.w));
    for (const edge of data.edges) {
      const A = data.genres[edge.a], B = data.genres[edge.b];
      el(L.edges, "line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, "stroke-opacity": 0.16 + 0.5 * edge.w / edgeMax, style: `--w:${0.6 + 4.4 * edge.w / edgeMax}` });
    }
    const avgs = data.genres.map(g => g.avg).filter(v => v !== null);
    const lo = Math.min(...avgs), hi = Math.max(...avgs);
    for (const genre of data.genres) {
      const r = 5 + Math.sqrt(genre.n) * 1.05;
      const bright = genre.avg === null || hi === lo ? 0.55 : 0.25 + 0.75 * (genre.avg - lo) / (hi - lo);
      const star = el(L.stars, "g", { class: "cs-star", "data-genre": genre.i, tabindex: 0, role: "button", "aria-label": `${genre.name}, ${genre.n} Titel` });
      el(star, "circle", { cx: genre.x, cy: genre.y, r: r + 7, class: "cs-halo" });
      el(star, "circle", { cx: genre.x, cy: genre.y, r, class: "cs-core", "fill-opacity": bright });
      el(L.slabels, "text", { x: genre.x, y: genre.y + r + 15, class: `cs-slabel${genre.n > data.items.length / 7 ? " is-big" : ""}`, "data-genre": genre.i }, genre.name);
      if (genre.home.length) {
        const label = el(L.glabels, "text", { x: genre.x, y: genre.y - genre.galaxy - 2.6, class: "cs-glabel", "data-genre": genre.i, tabindex: 0, role: "button", "aria-label": `Genre-Karte ${genre.name}` }, `${genre.name} `);
        el(label, "tspan", { class: "cs-home" }, `⌂\u2009${fmt(genre.home.length)}`); // ⌂ = wohnen hier (Legende)
      }
    }
    data.items.forEach((item, k) => {
      el(L.dots, "circle", { cx: item.x, cy: item.y, class: `cs-dot${item.rating >= 9 ? " is-top" : item.rating === null ? " is-open" : ""}`, "fill-opacity": item.rating === null ? 0.5 : item.rating >= 9 ? 1 : 0.3 + 0.55 * Math.max(0, item.rating - 4) / 4, "data-item": k });
    });
    home();
    // Gemerkter Ausschnitt (nur einmal, nur bei gleicher Karte)
    if (pendingCamera) {
      const saved = pendingCamera;
      pendingCamera = null;
      if (saved.sig === signature) setCam(saved.cx - saved.w / 2, saved.cy - saved.w * aspect / 2, saved.w);
    }
    precomputeBubbles();
  }

  function buildVisiblePosters() {
    if (!data) return;
    const mx = cam.w * 0.15, my = cam.h * 0.15;
    data.items.forEach((item, k) => {
      if (posterEls.has(item.id)) return;
      if (item.x < cam.x - mx || item.x > cam.x + cam.w + mx || item.y < cam.y - my || item.y > cam.y + cam.h + my) return;
      const g = el(L.posters, "g", { class: "cs-poster", "data-item": k, transform: `translate(${item.x - POSTER.w / 2} ${item.y - POSTER.h / 2})` });
      drawPoster(g, item);
      if (selItem === item) g.classList.add("is-selected");
      posterEls.set(item.id, g);
    });
  }

  function drawPoster(g, item) {
    const [dark, light] = POSTER_COLORS[hash(item.title) % POSTER_COLORS.length];
    el(g, "rect", { width: POSTER.w, height: POSTER.h, rx: 0.18, fill: dark });
    el(g, "rect", { width: POSTER.w, height: POSTER.h * 0.62, rx: 0.18, fill: light, "fill-opacity": 0.55 });
    const fallback = () => {
      const lines = wrapTitle(item.title), fs = 0.37;
      const text = el(g, "text", { class: "cs-ptitle", x: 0.22, y: POSTER.h - 0.62 - (lines.length - 1) * fs * 1.1, "font-size": fs });
      lines.forEach((line, i) => el(text, "tspan", { x: 0.22, dy: i ? fs * 1.1 : 0 }, line));
      el(g, "text", { class: "cs-pyear", x: 0.22, y: POSTER.h - 0.24, "font-size": 0.22 }, item.year);
    };
    const src = coverOf(item.movie);
    if (src) {
      const image = el(g, "image", { width: POSTER.w, height: POSTER.h, preserveAspectRatio: "xMidYMid slice", "clip-path": "url(#cs-clip)", href: src });
      image.addEventListener("error", () => { image.remove(); fallback(); addBadge(); }, { once: true });
    } else fallback();
    const addBadge = () => {
      g.querySelector(".cs-badge")?.remove();
      if (item.rating === null) return;
      const badge = el(g, "g", { class: `cs-badge${item.rating >= 9 ? " is-top" : ""}` });
      el(badge, "rect", { x: POSTER.w - 0.84, y: 0.18, width: 0.66, height: 0.48, rx: 0.1 });
      el(badge, "text", { x: POSTER.w - 0.51, y: 0.53, "font-size": 0.32 }, item.rating);
    };
    addBadge();
    el(g, "rect", { class: "cs-frame", width: POSTER.w, height: POSTER.h, rx: 0.18 });
  }

  /* ---------------- Umrisse (im Hintergrund gerechnet) ---------------- */
  // Ein Umriss kostet bei 1.000+ Titeln rund 0,1 s. Ein Worker rechnet ihn
  // abseits der Oberfläche; nach dem Aufbau rechnet er alle Genres vor (ein
  // Auftrag nach dem anderen), angetippte Genres kommen in der Schlange nach vorn.
  let worker = null;
  try {
    worker = new Worker(new URL("../workers/bubble-worker.js", import.meta.url), { type: "module" });
  } catch {
    worker = null; // ohne Worker: direkt rechnen
  }
  let generation = 0, busy = false;
  const queue = [], waiting = new Map();
  const bubbleJob = (key, members) => {
    const set = new Set(members);
    const pos = list => list.map(item => ({ x: item.x, y: item.y }));
    return { key, gen: generation, members: pos(members), others: pos(data.items.filter(item => !set.has(item))) };
  };
  function finishBubble(key, path) {
    bubbleCache.set(key, path);
    waiting.get(key)?.forEach(resolve => resolve(path));
    waiting.delete(key);
  }
  function pump() {
    while (!busy && queue.length) {
      const job = queue.shift();
      if (job.gen !== generation || bubbleCache.has(job.key)) continue;
      busy = true;
      worker.postMessage(job);
    }
  }
  if (worker) {
    worker.onmessage = ({ data: reply }) => {
      busy = false;
      if (reply.gen === generation) finishBubble(reply.key, reply.path);
      pump();
    };
    worker.onerror = () => {
      // Worker geht nicht (z. B. alter Browser): ab jetzt direkt rechnen
      worker = null; busy = false;
      for (const job of queue.splice(0)) if (job.gen === generation) finishBubble(job.key, bubblePath(job.members, job.others));
    };
  }
  /** Umriss einer Menge; urgent = angetippt (vor die vorgerechneten). */
  function requestBubble(key, members, urgent = false) {
    if (bubbleCache.has(key)) return Promise.resolve(bubbleCache.get(key));
    const promise = new Promise(resolve => { if (!waiting.has(key)) waiting.set(key, []); waiting.get(key).push(resolve); });
    if (!worker) { const job = bubbleJob(key, members); finishBubble(key, bubblePath(job.members, job.others)); return promise; }
    const index = queue.findIndex(job => job.key === key);
    const job = index >= 0 ? queue.splice(index, 1)[0] : bubbleJob(key, members);
    if (urgent) queue.unshift(job); else queue.push(job);
    pump();
    return promise;
  }
  function precomputeBubbles() {
    if (!worker || !data) return;
    [...data.genres].sort((a, b) => b.n - a.n).forEach(genre => requestBubble(`g${genre.i}`, genre.titles));
  }

  function drawBubbles() {
    L.bubbles.replaceChildren();
    for (const [sel, kind] of [[selA, "a"], [selB, "b"]]) {
      if (!sel) continue;
      const path = el(L.bubbles, "path", { class: `cs-bubble is-${kind}`, "fill-rule": "evenodd" });
      if (bubbleCache.has(sel.key)) path.setAttribute("d", bubbleCache.get(sel.key));
      else {
        path.classList.add("is-pending");
        requestBubble(sel.key, sel.members, true).then(d => { path.setAttribute("d", d); path.classList.remove("is-pending"); });
      }
    }
    levels();
  }

  /* ---------------- Fäden ---------------- */
  function drawThreads() {
    L.threads.replaceChildren();
    if (!selItem) return;
    const item = selItem;
    for (const i of item.gs) {
      if (i === item.home) continue;
      const g = data.genres[i], mx = (item.x + g.x) / 2, my = (item.y + g.y) / 2, dx = g.x - item.x, dy = g.y - item.y;
      el(L.threads, "path", { class: "cs-thread", d: `M${item.x},${item.y} Q${mx - dy * 0.18},${my + dx * 0.18} ${g.x},${g.y}` });
      el(L.threads, "circle", { class: "cs-thread-end", cx: g.x, cy: g.y, r: 3 });
      el(L.threads, "text", { class: "cs-slabel is-big", x: g.x, y: g.y - 5 }, g.name);
    }
  }

  /* ---------------- Karten ---------------- */
  const coverHtml = item => {
    const src = coverOf(item.movie);
    return src
      ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">`
      : `<span class="cs-cover-fallback">${escapeHtml(item.title)}</span>`;
  };
  const href = item => `movie.html?id=${encodeURIComponent(item.id)}`; // Detailseite im selben Ordner (views/)

  function showCard(html, x, y) {
    const wasOpen = !card.hidden;
    card.innerHTML = html;
    card.hidden = false;
    if (!wasOpen && !reducedMotion()) {
      // klappt aus dem angetippten Punkt auf
      const s = stage.getBoundingClientRect(), c = card.getBoundingClientRect();
      const px = (x - cam.x) / cam.w * s.width, py = (y - cam.y) / cam.h * s.height;
      card.style.transformOrigin = `${px - (c.left - s.left)}px ${py - (c.top - s.top)}px`;
      card.classList.remove("is-open");
      void card.offsetWidth;
    }
    card.classList.add("is-open");
    // Cover, die nicht laden (z. B. offline): Titel statt kaputtem Bild
    card.querySelectorAll("img").forEach(img => img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "cs-cover-fallback";
      span.textContent = img.closest("[aria-label]")?.getAttribute("aria-label") || card.querySelector("h3")?.textContent || "";
      img.replaceWith(span);
    }, { once: true }));
  }
  function closeCard(redraw = true) {
    card.hidden = true;
    card.classList.remove("is-open");
    card.innerHTML = "";
    selA = selB = null;
    selItem = null;
    posterEls.forEach(p => p.classList.remove("is-selected"));
    if (redraw && data) { drawBubbles(); drawThreads(); }
  }

  function openGenre(genre) {
    hideTip();
    selA = { key: `g${genre.i}`, members: genre.titles };
    selB = null;
    selItem = null;
    posterEls.forEach(p => p.classList.remove("is-selected"));
    drawBubbles();
    drawThreads();
    // Kamera: alle Titel des Genres im Blick, rechts Platz für die Karte
    const xs = genre.titles.map(t => t.x), ys = genre.titles.map(t => t.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = clamp(Math.max(x1 - x0, (y1 - y0) / aspect) * 1.4 + 30, 80, homeW);
    fly((x0 + x1) / 2 + w * 0.14, (y0 + y1) / 2, w);

    const max = Math.max(1, ...genre.dist);
    const rated = genre.dist.some(Boolean);
    const neighbors = genreNeighbors(genre.i, data.edges).slice(0, 6);
    const sets = genreIntersections(genre);
    const setMax = Math.max(1, ...sets.map(s => s.count));
    showCard(`
      <div class="cs-card-top"><div><p class="cs-kicker">Genre</p><h3>${escapeHtml(genre.name)}</h3></div>
        <button type="button" class="cs-close" aria-label="Schließen">×</button></div>
      <p class="cs-meta"><b>${fmt(genre.n)}</b> Titel${genre.avg !== null ? ` · Ø <b>${f1(genre.avg)}</b>` : ""} · <span class="cs-home">⌂</span> ${fmt(genre.home.length)} wohnen in dieser Galaxie</p>
      ${rated ? `<div><p class="cs-kicker">${own("Deine", "Meine")} Bewertung</p>
        <div class="cs-hist">${genre.dist.map((v, k) => `<i class="${k >= 8 ? "is-top" : ""}" style="height:${v / max * 100}%" title="${k + 1}: ${v}"></i>`).join("")}</div>
        <div class="cs-histx">${genre.dist.map((_, k) => `<span>${k + 1}</span>`).join("")}</div></div>` : ""}
      <div><p class="cs-kicker">${rated ? "Lieblinge" : "Beliebteste"}</p><div class="cs-covers">${genre.titles.slice(0, 8).map(item => `<button type="button" data-item="${data.items.indexOf(item)}" aria-label="${escapeHtml(item.title)}">${coverHtml(item)}</button>`).join("")}</div></div>
      ${sets.length ? `<div><p class="cs-kicker">Schnittmengen · antippen = roter Umriss</p><div class="cs-sets">${sets.map(set => `<button type="button" data-set="${set.with.join(",")}" aria-pressed="false">
        <span class="cs-set-name">${escapeHtml([genre.name, ...set.with.map(i => data.genres[i].name)].join(" + "))}</span>
        <span class="cs-set-bar"><b style="width:${set.count / setMax * 100}%"></b></span><span class="cs-set-count">${fmt(set.count)}</span></button>`).join("")}</div></div>` : ""}
      ${neighbors.length ? `<div><p class="cs-kicker">Nachbarn</p><div class="cs-chips">${neighbors.map(n => `<button type="button" data-genre="${n.i}">${escapeHtml(data.genres[n.i].name)} <span>${fmt(n.w)}</span></button>`).join("")}</div></div>` : ""}
      <div class="cs-actions">
        ${genre.home.length ? `<button type="button" class="button cs-primary" data-zoom="${genre.i}">Zu den Covern zoomen</button>` : ""}
        ${onShowTitles && !genre.other ? `<button type="button" class="button secondary" data-show="genre">${fmt(genre.n)} Titel im Raster zeigen</button>
        <button type="button" class="button secondary" data-show="set" hidden></button>` : ""}
      </div>`, genre.x, genre.y);
    card.dataset.genre = genre.i;
  }

  function openFilm(item, flyTo) {
    hideTip();
    selItem = item;
    posterEls.forEach(p => p.classList.remove("is-selected"));
    posterEls.get(item.id)?.classList.add("is-selected");
    drawThreads();
    if (flyTo) { const w = POSTER.w * 26; fly(item.x + w * 0.2, item.y, w); }
    const m = item.movie;
    showCard(`
      <div class="cs-card-top"><div><p class="cs-kicker">${escapeHtml(m.titleType || "Titel")}</p><h3>${escapeHtml(item.title)}</h3></div>
        <button type="button" class="cs-close" aria-label="Schließen">×</button></div>
      <div class="cs-film"><div class="cs-film-cover">${coverHtml(item)}</div>
        <div class="cs-film-facts">
          ${item.rating !== null ? `<p class="cs-rating">${item.rating}<small> / 10 ${own("Deine", "Meine")} Bewertung</small></p>` : `<p class="cs-meta">Noch nicht bewertet</p>`}
          <p class="cs-meta">${[item.year, m.imdbRating ? `IMDb ${escapeHtml(m.imdbRating)}` : ""].filter(Boolean).join(" · ")}</p>
        </div></div>
      <div><p class="cs-kicker">Genres</p><div class="cs-chips">${item.gs.map(i => `<button type="button" data-genre="${i}">${escapeHtml(data.genres[i].name)}</button>`).join("")}</div></div>
      <a class="button cs-primary" href="${escapeHtml(href(item))}">Detailseite öffnen</a>`, item.x, item.y);
  }

  card.addEventListener("click", event => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.classList.contains("cs-close")) { closeCard(); return; }
    if (target.dataset.genre !== undefined) { openGenre(data.genres[Number(target.dataset.genre)]); return; }
    if (target.dataset.item !== undefined) { openFilm(data.items[Number(target.dataset.item)], true); return; }
    if (target.dataset.zoom !== undefined) { const g = data.genres[Number(target.dataset.zoom)]; fly(g.x, g.y, POSTER.w * 30); return; }
    if (target.dataset.set !== undefined) {
      const genre = data.genres[Number(card.dataset.genre)];
      const need = [genre.i, ...target.dataset.set.split(",").map(Number)];
      const on = target.getAttribute("aria-pressed") !== "true";
      card.querySelectorAll("[data-set]").forEach(button => button.setAttribute("aria-pressed", String(button === target && on)));
      selB = on ? { key: `s${need.join(",")}`, members: data.items.filter(item => need.every(i => item.gs.includes(i))), genres: need } : null;
      drawBubbles();
      const show = card.querySelector('[data-show="set"]');
      if (show) {
        show.hidden = !selB;
        if (selB) show.textContent = `Schnittmenge im Raster zeigen (${fmt(selB.members.length)})`;
      }
      return;
    }
    if (target.dataset.show !== undefined && onShowTitles) {
      const genre = data.genres[Number(card.dataset.genre)];
      const names = target.dataset.show === "set" && selB ? selB.genres.map(i => data.genres[i].name) : [genre.name];
      onShowTitles(names);
    }
  });

  /* ---------------- Bedienung der Karte ---------------- */
  const itemAt = target => {
    const node = target.closest("[data-item]");
    return node && L.posters.contains(node) ? data.items[Number(node.dataset.item)] : null;
  };
  const genreAt = target => {
    const node = target.closest("[data-genre]");
    return node && svg.contains(node) ? data.genres[Number(node.dataset.genre)] : null;
  };
  let moved = false;
  svg.addEventListener("click", event => {
    if (moved || !data) return;
    const item = itemAt(event.target);
    if (item) { openFilm(item, false); return; }
    const genre = genreAt(event.target);
    if (genre) openGenre(genre);
  });
  /* ---------------- Tastatur ---------------- */
  // Pfeiltasten: nächstes Cover in dieser Richtung (ohne gewähltes: das nächste
  // zur Bildmitte), Kamera folgt; + / − zoomen; Enter/Leertaste auf einem Stern
  // oder Galaxie-Namen öffnet seine Karte.
  const DIRECTIONS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  function neighbourItem(from, [dx, dy]) {
    let best = null, bestScore = Infinity;
    for (const item of data.items) {
      if (item === from) continue;
      const vx = item.x - from.x, vy = item.y - from.y;
      const along = vx * dx + vy * dy;
      if (along <= 0.1) continue;
      const across = Math.abs(vx * dy - vy * dx);
      if (across > along * 1.2) continue; // nur grob in Pfeilrichtung
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = item; }
    }
    return best;
  }
  function nearestToCentre() {
    const [cx, cy] = centre();
    return data.items.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
  }
  /** Kamera nachziehen, wenn das Cover aus dem Kern des Ausschnitts wandert. */
  function keepInView(item) {
    const coverW = POSTER.w * 26;
    const w = POSTER.w / unit() < 13 ? Math.min(cam.w, coverW) : cam.w; // noch keine Cover: hinein
    const rightSpace = card.hidden ? 0 : 0.2;
    const inside = item.x > cam.x + cam.w * 0.15 && item.x < cam.x + cam.w * (0.85 - rightSpace)
      && item.y > cam.y + cam.h * 0.15 && item.y < cam.y + cam.h * 0.85;
    if (!inside || w !== cam.w) fly(item.x + w * rightSpace, item.y, w, 450);
  }
  svg.addEventListener("keydown", event => {
    if (!data || !data.items.length) return;
    const genre = genreAt(event.target);
    if ((event.key === "Enter" || event.key === " ") && genre) { event.preventDefault(); openGenre(genre); return; }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomAt(...centre(), 1.6, 300); return; }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomAt(...centre(), 1 / 1.6, 300); return; }
    const dir = DIRECTIONS[event.key];
    if (!dir) return;
    event.preventDefault();
    const next = selItem ? neighbourItem(selItem, dir) : nearestToCentre();
    if (!next) return;
    openFilm(next, false);
    keepInView(next);
  });
  svg.addEventListener("pointermove", event => {
    if (dragging || !data) return;
    const item = itemAt(event.target);
    if (item) { showTip(event, `<b>${escapeHtml(item.title)}</b>${item.year ? ` (${escapeHtml(item.year)})` : ""}<br>${item.rating !== null ? `${own("Deine", "Meine")} Bewertung: ${item.rating}` : "Noch nicht bewertet"}`); return; }
    const genre = genreAt(event.target);
    if (genre) { showTip(event, `<b>${escapeHtml(genre.name)}</b><br>${fmt(genre.n)} Titel${genre.avg !== null ? ` · Ø ${f1(genre.avg)}` : ""}${genre.home.length ? `<br>⌂ ${fmt(genre.home.length)} wohnen hier` : ""}`); return; }
    hideTip();
  });
  svg.addEventListener("pointerleave", hideTip);

  svg.addEventListener("wheel", event => {
    event.preventDefault();
    hideTip();
    const [x, y] = toWorld(event.clientX, event.clientY);
    zoomAt(x, y, Math.exp(-event.deltaY * 0.0016));
  }, { passive: false });
  svg.addEventListener("dblclick", event => { const [x, y] = toWorld(event.clientX, event.clientY); zoomAt(x, y, 2.4, 500); });

  // Ziehen (eine Hand) und Zwei-Finger-Zoom
  const pointers = new Map();
  let last = null, start = null, dragging = false;
  svg.addEventListener("pointerdown", event => {
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    last = null; moved = false; start = [event.clientX, event.clientY];
  });
  svg.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (!dragging && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) {
      dragging = moved = true;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add("is-dragging");
      hideTip();
    }
    if (!dragging) return;
    const rect = svg.getBoundingClientRect(), points = [...pointers.values()];
    const c = points.reduce((acc, p) => [acc[0] + p[0] / points.length, acc[1] + p[1] / points.length], [0, 0]);
    const d = points.length > 1 ? Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]) : 0;
    if (last && last.n === points.length) {
      setCam(cam.x - (c[0] - last.c[0]) / rect.width * cam.w, cam.y - (c[1] - last.c[1]) / rect.height * cam.h, cam.w);
      if (points.length > 1 && last.d) { const [x, y] = toWorld(c[0], c[1]); zoomAt(x, y, d / last.d); }
    }
    last = { c, d, n: points.length };
  });
  const release = event => {
    pointers.delete(event.pointerId);
    last = null;
    if (!pointers.size) {
      dragging = false;
      svg.classList.remove("is-dragging");
      setTimeout(() => { moved = false; }, 0);
    }
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  stage.querySelector('[data-cs="in"]').addEventListener("click", () => zoomAt(...centre(), 2, 450));
  stage.querySelector('[data-cs="out"]').addEventListener("click", () => zoomAt(...centre(), 0.5, 450));
  stage.querySelector('[data-cs="all"]').addEventListener("click", () => { closeCard(); home(800); });
  stage.querySelectorAll("[data-level]").forEach(button => button.addEventListener("click", () => {
    if (!data) return;
    const lvl = Number(button.dataset.level);
    if (lvl === 0) { closeCard(); home(800); return; }
    // nächste Galaxie zur Bildmitte, damit es dort etwas zu sehen gibt
    const [cx, cy] = centre();
    const target = data.genres.filter(g => g.home.length).reduce((a, g) => (Math.hypot(g.x - cx, g.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? g : a));
    fly(target.x, target.y, lvl === 1 ? Math.min(homeW / 2.6, CELL.w / 6 * pxWidth) : POSTER.w / 34 * pxWidth, 800);
  }));
  panel.addEventListener("keydown", event => { if (event.key === "Escape" && !card.hidden) { event.stopPropagation(); closeCard(); } });
  new ResizeObserver(() => {
    if (panel.hidden || !data) return;
    const [cx, cy] = centre(), w = cam.w;
    if (!measure()) return;
    const b = data.bounds;
    homeW = Math.max(b.x1 - b.x0, (b.y1 - b.y0) / aspect) * 1.04;
    setCam(cx - w / 2, cy - w * aspect / 2, w);
  }).observe(stage);

  /* ---------------- Umschalter Bewertet / Ganze Sammlung ---------------- */
  const modeGroup = $(".constellation-mode");
  const modeButtons = modeGroup ? [...modeGroup.querySelectorAll("[data-constellation-mode]")] : [];
  const visibleModes = modeButtons.filter(button => {
    button.hidden = !modes.includes(button.dataset.constellationMode);
    return !button.hidden;
  });
  modeGroup?.classList.toggle("is-single", visibleModes.length < 2);
  const syncModes = () => modeButtons.forEach(button => {
    const active = button.dataset.constellationMode === mode;
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  syncModes();
  visibleModes.forEach(button => button.addEventListener("click", () => {
    if (button.dataset.constellationMode === mode) return;
    mode = button.dataset.constellationMode;
    syncModes();
    onModeChange(mode);
    if (panel.hidden) stale = true; else { measure(); rebuild(); }
  }));
  modeGroup?.addEventListener("keydown", event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = visibleModes.findIndex(button => button.dataset.constellationMode === mode);
    const next = visibleModes[(index + step + visibleModes.length) % visibleModes.length];
    next.focus();
    next.click();
  });

  return {
    /** Neue (gesuchte und gefilterte) Titelliste; gezeichnet wird erst, wenn die Registerkarte sichtbar ist. */
    update(list) {
      movies = list;
      if (panel.hidden) { stale = true; return; }
      measure();
      rebuild();
    },
    /** Nach dem Einblenden der Registerkarte aufrufen. */
    show() {
      if (!measure()) return;
      if (stale || !data) rebuild(); else apply();
    },
    mode: () => mode,
  };
}
