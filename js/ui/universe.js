import { own, has } from "../utils/host.js";
import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { localCoverUrl } from "../cover-store.js";
import {
  UNIVERSE_MODES, DEFAULT_UNIVERSE_MODE, buildUniverse, universeMovies, genreDossier, personDossier,
  universeRanking, matchPeople, primaryRole, introDue, seeded, hashText,
} from "../logic/universe-logic.js";

/*
 * Registerkarte „Filmuniversum" unter Entertainment: Genres und Besetzung in
 * einem All (vorher „Genres" und „Besetzung").
 *
 * Bild: Galaxien (je Genre ein Nebel), Titel als Sterne darin, Menschen als
 * helle Sterne mit Strahlenkranz zwischen ihren Titeln. Je näher man kommt,
 * desto mehr erscheint: Ferne (Galaxien) → Nähe (Menschen, Namen) →
 * Nahaufnahme (Cover statt Sterne, alle Menschen im Ausschnitt).
 * Antippen: Galaxie oder Mensch → Kamerafahrt und Dossier rechts; beim
 * Menschen kreisen seine Titel als Cover um ihn, Weggefährten leuchten auf.
 * Ein Titel öffnet die Detailseite.
 *
 * Technik (Tempo vor allem): eine einzige Zeichenfläche (Canvas 2D), statt
 * tausender SVG-Elemente. Nebel, Sternfeld und Leuchten werden einmal
 * vorgezeichnet (Sprites) und dann nur noch kopiert; gezeichnet wird nur bei
 * Bedarf (Kamera, Maus, Animation) und nur, was im Ausschnitt liegt. Cover
 * werden erst in der Nahaufnahme und nur für den Ausschnitt geladen. Die
 * Galaxien-Namen sind echte Knöpfe (Tab erreicht sie), Dossier und
 * Rangliste sind HTML.
 *
 * Bedienung: Mausrad / zwei Finger zoomen, Ziehen verschiebt, Doppelklick
 * zoomt hinein; + / − / 0 und Pfeiltasten auf der Bühne; Esc schließt das
 * Dossier. Rechenlogik: js/logic/universe-logic.js.
 */

const fmt = n => Number(n).toLocaleString("de-DE");
const f1 = n => Number(n).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 3);
const e = escapeHtml;
const ROLE_NAMES = { dir: "Regie", act: "Darsteller", wri: "Drehbuch" };
const RANK_TABS = [["all", "Alle"], ["dir", "Regie"], ["act", "Darsteller"], ["wri", "Drehbuch"]];
const COVER = { w: 4, h: 6 };           // Cover in Welt-Einheiten
const Z_PEOPLE = [1.15, 1.7];           // Menschen (ab 2 Titeln) blenden zwischen diesen Zoomstufen ein
const Z_SINGLES = [2.6, 3.3];           // … Menschen mit einem Titel
const Z_COVERS = 4.6;                   // ab hier Cover statt Sterne
const MAX_SINGLES = 900;
const INTRO_MS = 1800;
const FOCUS_MS = 950;
const hex = color => [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16));

/* ------------------------------------------------------------- Sprites */

function canvasOf(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Leuchtender Punkt in einer Farbe (Titel-Sterne). */
const starSprites = new Map();
function starSprite(color) {
  if (starSprites.has(color)) return starSprites.get(color);
  const c = canvasOf(32, 32), g = c.getContext("2d");
  const [r, gr, b] = hex(color);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,250,240,1)");
  grad.addColorStop(0.18, `rgba(${Math.min(255, r + 120)},${Math.min(255, gr + 110)},${Math.min(255, b + 100)},.9)`);
  grad.addColorStop(0.45, `rgba(${r},${gr},${b},.32)`);
  grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  starSprites.set(color, c);
  return c;
}

/** Warmes Leuchten eines Menschen und Beugungsstrahlen der Großen. */
let glowSprite = null, spikeSprite = null;
function personSprites() {
  if (glowSprite) return;
  glowSprite = canvasOf(64, 64);
  let g = glowSprite.getContext("2d");
  let grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,248,232,1)");
  grad.addColorStop(0.12, "rgba(255,226,170,.85)");
  grad.addColorStop(0.4, "rgba(255,190,110,.22)");
  grad.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  spikeSprite = canvasOf(128, 128);
  g = spikeSprite.getContext("2d");
  for (const [x0, y0, x1, y1] of [[0, 64, 128, 64], [64, 0, 64, 128]]) {
    grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, "rgba(255,220,160,0)");
    grad.addColorStop(0.5, "rgba(255,236,200,.75)");
    grad.addColorStop(1, "rgba(255,220,160,0)");
    g.strokeStyle = grad; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
}

/** Wertrauschen (glatt, mit festem Startwert) für die Nebel. */
function noiseField(seed, size) {
  const rnd = seeded(seed);
  const grid = Array.from({ length: (size + 1) * (size + 1) }, rnd);
  const smooth = t => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * size, y = v * size;
    const xi = Math.min(size - 1, Math.floor(x)), yi = Math.min(size - 1, Math.floor(y));
    const tx = smooth(x - xi), ty = smooth(y - yi);
    const at = (i, j) => grid[j * (size + 1) + i];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * tx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** Nebel einer Galaxie: wolkige Wölkchen, von Rauschen zerrissen. */
const nebulaSprites = new Map();
function nebulaSprite(name, color) {
  const key = `${name}|${color}`;
  if (nebulaSprites.has(key)) return nebulaSprites.get(key);
  const S = 160, c = canvasOf(S, S), g = c.getContext("2d");
  const img = g.createImageData(S, S);
  const rnd = seeded(hashText(name));
  const blobs = Array.from({ length: 7 }, () => ({ x: 0.5 + (rnd() - 0.5) * 0.3, y: 0.5 + (rnd() - 0.5) * 0.3, s: 0.1 + rnd() * 0.09, w: 0.5 + rnd() * 0.5 }));
  const n1 = noiseField(hashText(name) ^ 0x9e37, 6), n2 = noiseField(hashText(name) ^ 0x51ab, 14);
  const [r, gr, b] = hex(color);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let f = 0;
    for (const bl of blobs) f += Math.exp(-((u - bl.x) ** 2 + (v - bl.y) ** 2) / (2 * bl.s * bl.s)) * bl.w;
    const a = n1(u, v), d = n2(u, v);
    f *= (0.15 + 1.25 * a * a) * (0.5 + 0.85 * Math.pow(d, 1.5));
    const edge = Math.min(1, Math.min(u, v, 1 - u, 1 - v) * 8); // weich zum Rand
    const alpha = (1 - Math.exp(-f * 0.9)) * edge;
    const i = (y * S + x) * 4;
    img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = Math.round(alpha * 255);
  }
  g.putImageData(img, 0, 0);
  nebulaSprites.set(key, c);
  return c;
}

/** Sternfeld als Kachel (zwei Ebenen für die Tiefe). */
function starfieldTile(seed, count, maxR) {
  const S = 512, c = canvasOf(S, S), g = c.getContext("2d");
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const r = 0.3 + rnd() * maxR, a = 0.25 + rnd() * 0.65;
    g.fillStyle = `rgba(${235 + rnd() * 20},${222 + rnd() * 20},${200 + rnd() * 30},${a})`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); g.fill();
  }
  return c;
}

/** Feines Filmkorn als Hintergrundbild der Bühne. */
function grainUrl() {
  const S = 128, c = canvasOf(S, S), g = c.getContext("2d");
  const img = g.createImageData(S, S);
  const rnd = seeded(7);
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(rnd() * 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  try { return c.toDataURL(); } catch { return ""; }
}

/* ------------------------------------------------------------ Bühne */

/**
 * Baut das Filmuniversum in das Panel.
 * @param {HTMLElement} panel - #universe-panel
 * @param {object} options
 * @param {string} [options.mode] - "rated" | "all"
 * @param {(mode: string) => void} [options.onModeChange]
 * @param {(genre: string) => void} [options.onShowGenre] - „Im Raster zeigen" (Galaxie)
 * @param {(ids: string[], name: string) => void} [options.onShowPerson] - „Im Raster zeigen" (Mensch)
 * @param {() => void} [options.onStartFetch] - Knopf „Besetzung laden"
 * @param {() => string} [options.introMode] - Einstellung „Urknall" (UNIVERSE_INTRO_OPTIONS)
 */
export function initUniverse(panel, {
  mode: startMode = DEFAULT_UNIVERSE_MODE, onModeChange = () => {}, onShowGenre = null, onShowPerson = null,
  onStartFetch = null, introMode = () => "session",
} = {}) {
  const modes = has("rating") ? UNIVERSE_MODES : ["all"];
  let mode = modes.includes(startMode) ? startMode : modes[0];
  let all = [], filtered = [], query = "", castData = {};
  let u = null, uKey = null, visible = new Set(), matches = [];
  let stale = true;
  const layers = { galaxies: true, people: true, covers: true, dir: true, act: true, wri: true };
  let focus = null;        // {type: "genre"|"person", key, t0}
  let hover = null;        // {type, ref}
  let rankRole = "all";
  let dossierOpen = null;  // "genre" | "person" | "ranking"
  let intro = null;        // {t0}
  let pulseUntil = 0;
  const covers = new Map();

  panel.innerHTML = `
    <div class="uv-stage" tabindex="0" aria-describedby="uv-help">
      <canvas class="uv-canvas" role="img"></canvas>
      <div class="uv-labels"></div>
      <div class="uv-veil" aria-hidden="true"></div>
      <div class="uv-hud uv-glass uv-layers">
        <p class="uv-kicker" id="uv-level">Filmuniversum</p>
        <div class="uv-toggles" role="group" aria-label="Ebenen">
          <button type="button" class="uv-lens" data-layer="galaxies" aria-pressed="true"><i></i>Galaxien</button>
          <button type="button" class="uv-lens" data-layer="people" aria-pressed="true"><i></i>Menschen</button>
          <button type="button" class="uv-lens" data-layer="covers" aria-pressed="true"><i></i>Cover</button>
        </div>
        <div class="uv-toggles uv-roles" role="group" aria-label="Rollen">
          <button type="button" class="uv-lens" data-layer="dir" aria-pressed="true"><i class="is-dir"></i>Regie</button>
          <button type="button" class="uv-lens" data-layer="act" aria-pressed="true"><i class="is-act"></i>Darsteller</button>
          <button type="button" class="uv-lens" data-layer="wri" aria-pressed="true"><i class="is-wri"></i>Drehbuch</button>
        </div>
      </div>
      <div class="uv-hud uv-tools">
        <button type="button" class="uv-glass uv-rank-button" data-uv="ranking">${own("Deine", "Meine")} Stammbesetzung</button>
        <div class="uv-glass uv-zoom">
          <button type="button" data-uv="in" aria-label="Näher heran">+</button>
          <button type="button" data-uv="out" aria-label="Weiter weg">−</button>
          <button type="button" data-uv="home" aria-label="Ganzes All">⤢</button>
        </div>
      </div>
      <div class="uv-glass uv-mini" aria-hidden="true"><canvas></canvas></div>
      <div class="uv-glass uv-crumb"><button type="button" data-uv="home">Filmuniversum</button><span class="uv-path"></span><span class="uv-hint" id="uv-help"></span></div>
      <div class="uv-glass uv-tip" role="status" hidden></div>
      <aside class="uv-glass uv-dossier" aria-live="polite" hidden></aside>
      <p class="uv-empty" hidden></p>
    </div>
    <div class="uv-foot"><p class="uv-count" aria-live="polite"></p><p class="uv-status" id="universe-status"></p></div>`;
  const $ = s => panel.querySelector(s);
  const stage = $(".uv-stage"), canvas = $(".uv-canvas"), ctx = canvas.getContext("2d");
  const labelsBox = $(".uv-labels"), tip = $(".uv-tip"), dossier = $(".uv-dossier");
  const mini = $(".uv-mini canvas"), mctx = mini.getContext("2d");
  const grain = grainUrl();
  if (grain) $(".uv-veil").style.setProperty("--grain", `url("${grain}")`);
  const fontText = () => getComputedStyle(document.documentElement).getPropertyValue("--font-text").trim() || "system-ui, sans-serif";
  const fontDisplay = () => getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Georgia, serif";
  let tiles = null;

  /* ---------------- Kamera ---------------- */
  const cam = { x: 800, y: 480, k: 1, raf: 0 };
  let W = 1, H = 1, dpr = 1, kHome = 1, homeX = 800, homeY = 480;
  const zoom = () => cam.k / kHome;
  const sx = x => (x - cam.x) * cam.k + W / 2;
  const sy = y => (y - cam.y) * cam.k + H / 2;
  const wx = px => (px - W / 2) / cam.k + cam.x;
  const wy = py => (py - H / 2) / cam.k + cam.y;

  let turned = false;
  /** Hochformat (Handy): das All um 90° gedreht, damit es die Bühne füllt. */
  function orient() {
    const portrait = H > W * 1.15;
    if (!u || u._portrait === portrait) return;
    for (const list of [u.genres, u.titles, u.people]) for (const item of list) {
      const { x, y } = item;
      if (portrait) { item.x = y; item.y = 2000 - x; } else { item.x = 2000 - y; item.y = x; }
    }
    const b = u.bounds;
    u.bounds = portrait ? { x0: b.y0, x1: b.y1, y0: 2000 - b.x1, y1: 2000 - b.x0 } : { x0: 2000 - b.y1, x1: 2000 - b.y0, y0: b.x0, y1: b.x1 };
    u._portrait = portrait;
    miniPainted = false;
    turned = true;
  }

  function measure() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    W = rect.width; H = rect.height;
    orient();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    const mr = mini.parentElement.getBoundingClientRect();
    mini.width = Math.round(mr.width * dpr); mini.height = Math.round(mr.height * dpr);
    if (u) {
      const b = u.bounds;
      // Platz oben für die Ebenen, unten für Pfad und Minikarte
      const padTop = W < 560 ? 70 : 96, padBottom = W < 560 ? 56 : 74;
      kHome = Math.min(W / (b.x1 - b.x0), (H - padTop - padBottom) / (b.y1 - b.y0)) * 0.97;
      homeX = (b.x0 + b.x1) / 2; homeY = (b.y0 + b.y1) / 2 - (padTop - padBottom) / 2 / kHome;
      miniPainted = false;
    }
    return true;
  }
  const minK = () => kHome * 0.8;
  const maxK = () => kHome * 14;
  function setCam(x, y, k) {
    cancelAnimationFrame(cam.raf); cam.raf = 0;
    cam.k = clamp(k, minK(), maxK());
    cam.x = x; cam.y = y;
    requestRender();
  }
  /** Kamerafahrt: weich, bei weiten Wegen kurz herausgezoomt. */
  function fly(x, y, k, ms = 900) {
    k = clamp(k, minK(), maxK());
    if (reducedMotion()) { setCam(x, y, k); return; }
    cancelAnimationFrame(cam.raf);
    const x0 = cam.x, y0 = cam.y, k0 = cam.k, t0 = performance.now();
    const dist = Math.hypot(x - x0, y - y0);
    const peak = Math.min(k0, k, Math.max(kHome, Math.min(k0, k) / (1 + dist * Math.min(k0, k) / Math.max(W, 1) * 0.6)));
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), q = ease(p);
      const lk = Math.log(k0) + (Math.log(k) - Math.log(k0)) * q;
      const dip = Math.max(0, Math.min(Math.log(k0), Math.log(k)) - Math.log(peak)) * Math.sin(Math.PI * q);
      cam.k = Math.exp(lk - dip); cam.x = x0 + (x - x0) * q; cam.y = y0 + (y - y0) * q;
      draw(now);
      cam.raf = p < 1 ? requestAnimationFrame(step) : 0;
      if (p >= 1) requestRender();
    };
    cam.raf = requestAnimationFrame(step);
  }
  const goHome = ms => (ms ? fly(homeX, homeY, kHome, ms) : setCam(homeX, homeY, kHome));
  function zoomAt(px, py, factor, ms = 0) {
    const k = clamp(cam.k * factor, minK(), maxK());
    const x = wx(px) - (px - W / 2) / k, y = wy(py) - (py - H / 2) / k;
    if (ms) fly(x, y, k, ms); else setCam(x, y, k);
  }

  /* ---------------- Zeichnen ---------------- */
  let frame = 0;
  function requestRender() {
    if (frame || cam.raf) return;
    frame = requestAnimationFrame(now => { frame = 0; draw(now); });
  }
  let hits = [];           // Trefferflächen des letzten Bildes
  let mouse = { x: 0, y: 0, in: false };
  let miniPainted = false;

  const personVisible = p => (layers.dir && p.roles.dir) || (layers.act && p.roles.act) || (layers.wri && p.roles.wri);
  const visibleCount = p => p.ids.reduce((n, id) => n + (visible.has(id) ? 1 : 0), 0);

  let lastDrawMs = 0;
  function draw(now = performance.now()) {
    if (!u || panel.hidden) return;
    const t0 = performance.now();
    const z = zoom();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0b0706";
    ctx.fillRect(0, 0, W, H);
    hits = [];
    const motion = !reducedMotion();
    const ip = intro ? clamp((now - intro.t0) / INTRO_MS, 0, 1) : 1;
    const fp = focus ? clamp((now - focus.t0) / FOCUS_MS, 0, 1) : 1;
    const animating = ip < 1 || (focus && fp < 1) || now < pulseUntil;

    // Sternfeld (zwei Ebenen, leicht versetzt beim Verschieben und mit der Maus)
    tiles ??= [starfieldTile(11, 520, 0.9), starfieldTile(23, 110, 1.4)];
    const mx = motion && mouse.in ? (mouse.x / W - 0.5) : 0, my = motion && mouse.in ? (mouse.y / H - 0.5) : 0;
    [[tiles[0], 0.04, 6], [tiles[1], 0.1, 14]].forEach(([tile, depth, sway]) => {
      const ox = (-(cam.x * cam.k * depth) - mx * sway) % 512, oy = (-(cam.y * cam.k * depth) - my * sway) % 512;
      ctx.globalAlpha = ip < 1 ? 0.4 + 0.6 * ip : 1;
      for (let x = ox - 512; x < W; x += 512) for (let y = oy - 512; y < H; y += 512) ctx.drawImage(tile, x, y);
    });

    // Nebel
    ctx.globalCompositeOperation = "lighter";
    const focusGenre = focus?.type === "genre" ? focus.key : null;
    const focusPerson = focus?.type === "person" ? u.byKey.get(focus.key) : null;
    const dimAll = focusPerson ? 0.35 + 0.65 * (1 - ease(fp)) : 1;
    if (layers.galaxies) for (const g of u.genres) {
      const size = g.r * 2.9 * cam.k * (ip < 1 ? 0.55 + 0.45 * easeOut(ip) : 1);
      const x = sx(g.x), y = sy(g.y);
      if (x + size / 2 < 0 || x - size / 2 > W || y + size / 2 < 0 || y - size / 2 > H) continue;
      let a = 0.62 * easeOut(ip) * dimAll;
      if (focusGenre) a *= g.name === focusGenre ? 1.25 : 0.2 + 0.8 * (1 - ease(fp));
      if (z > 3) a *= clamp(1 - (z - 3) / 6, 0.45, 1);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.drawImage(nebulaSprite(g.name, g.color), x - size / 2, y - size / 2, size, size);
    }

    // Titel: Sterne, in der Nahaufnahme Cover
    const showCovers = layers.covers && z >= Z_COVERS && !focusPerson;
    const starR = (1.3 + 0.85 * Math.sqrt(z)) * 2.2;
    const centerX = homeX, centerY = homeY;
    const orbitIds = focusPerson ? new Set(focusPerson.ids) : null;
    const coverList = [];
    for (const t of u.titles) {
      if (!visible.has(t.id)) continue;
      let x = sx(t.x), y = sy(t.y);
      if (ip < 1) {
        const d = Math.hypot(t.x - centerX, t.y - centerY) / 900;
        const q = easeOut(clamp((ip - d * 0.35) / 0.65, 0, 1));
        x = sx(centerX + (t.x - centerX) * q); y = sy(centerY + (t.y - centerY) * q);
      }
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      if (orbitIds?.has(t.id)) continue; // kreisen gleich um ihren Menschen
      let a = 1;
      if (focusGenre && !t.genres.includes(focusGenre)) a = 0.12 + 0.88 * (1 - ease(fp));
      if (focusPerson) a = 0.15 + 0.85 * (1 - ease(fp));
      if (showCovers) { coverList.push({ t, x, y, a }); continue; }
      ctx.globalAlpha = a;
      const r = t.rating >= 9 ? starR * 1.25 : starR;
      const g = u.byName.get(t.home);
      ctx.drawImage(starSprite(g.color), x - r, y - r, r * 2, r * 2);
      if (z >= 1.6) hits.push({ x, y, r: 6, type: "title", ref: t });
    }
    ctx.globalCompositeOperation = "source-over";
    if (coverList.length) drawCovers(coverList);

    // Fäden beim Darüberfahren
    if (hover?.type === "person" && !focusPerson) {
      const p = hover.ref;
      ctx.globalAlpha = 0.55; ctx.strokeStyle = "rgba(230,201,138,.9)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const id of p.ids) {
        if (!visible.has(id)) continue;
        const t = u.byId.get(id);
        ctx.moveTo(sx(p.x), sy(p.y)); ctx.lineTo(sx(t.x), sy(t.y));
      }
      ctx.stroke();
    }

    // Menschen
    const labels = [];
    if (layers.people && ip > 0.55) {
      personSprites();
      const pa = clamp((ip - 0.55) / 0.45, 0, 1);
      const aCore = clamp((z - Z_PEOPLE[0]) / (Z_PEOPLE[1] - Z_PEOPLE[0]), 0, 1);
      const aSingle = clamp((z - Z_SINGLES[0]) / (Z_SINGLES[1] - Z_SINGLES[0]), 0, 1);
      const matchKeys = new Set(matches.map(p => p.key));
      let singles = 0;
      ctx.globalCompositeOperation = "lighter";
      for (const p of u.people) {
        if (!personVisible(p)) continue;
        const isMatch = matchKeys.has(p.key);
        const isFocus = focusPerson && p.key === focusPerson.key;
        let a = p.n >= 2 ? aCore : aSingle;
        if (isMatch || isFocus) a = 1;
        if (a <= 0.02) continue;
        const x = sx(p.x), y = sy(p.y);
        if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
        const vc = visibleCount(p);
        if (!vc) continue;
        if (p.n === 1 && !isMatch && ++singles > MAX_SINGLES) continue;
        let alpha = a * pa;
        if (focusPerson && !isFocus) alpha *= 0.25 + 0.75 * (1 - ease(fp));
        if (focusGenre && !p.ids.some(id => u.byId.get(id).genres.includes(focusGenre))) alpha *= 0.2 + 0.8 * (1 - ease(fp));
        const size = (10 + 5 * Math.sqrt(vc)) * Math.pow(clamp(z, 1, 4), 0.35);
        ctx.globalAlpha = clamp(alpha, 0, 1);
        if (!isFocus) ctx.drawImage(glowSprite, x - size / 2, y - size / 2, size, size);
        if (vc >= 5 && !isFocus) {
          const s = (26 + vc * 3.2) * Math.pow(clamp(z, 1, 3), 0.3);
          ctx.globalAlpha = clamp(alpha * 0.8, 0, 1);
          ctx.drawImage(spikeSprite, x - s / 2, y - s / 2, s, s);
        }
        if (isMatch && motion && now < pulseUntil) {
          const ph = ((now / 900) % 1);
          ctx.globalAlpha = 0.8 * (1 - ph); ctx.strokeStyle = "#ffe8c2"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 8 + ph * 22, 0, Math.PI * 2); ctx.stroke();
        } else if (isMatch) {
          ctx.globalAlpha = 0.85; ctx.strokeStyle = "#ffe8c2"; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke();
        }
        if (alpha > 0.35 && !isFocus) {
          hits.push({ x, y, r: Math.max(7, size * 0.25), type: "person", ref: p });
          labels.push({ p, x, y, vc, alpha, size, force: isMatch || hover?.ref === p });
        }
        if (z >= 2.6 && !isFocus) roleMark(p, x, y, alpha);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Fokus Mensch: Medaillon, Umlaufbahn mit Covern, Fäden zu den Weggefährten
    if (focusPerson) drawFocusPerson(focusPerson, fp, labels);

    // Namen der Menschen (größte zuerst, ohne Überlappung)
    drawPeopleLabels(labels, z);

    // Galaxien-Namen (HTML-Knöpfe) mitbewegen
    placeGenreLabels(z, ip, fp, focusGenre, focusPerson);

    drawMini();
    updateLevel(z);
    lastDrawMs = performance.now() - t0;
    if (animating) {
      if (ip >= 1 && intro) intro = null;
      if (!cam.raf && !frame) frame = requestAnimationFrame(t => { frame = 0; draw(t); });
    } else if (intro) intro = null;
  }

  function roleMark(p, x, y, alpha) {
    const role = primaryRole(p.roles);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (role === "dir") { ctx.fillStyle = "#ffe2a8"; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
    else if (role === "act") { ctx.strokeStyle = "#ffe2a8"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.fillStyle = "#ef8a83"; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill(); }
    ctx.globalCompositeOperation = "lighter";
  }

  /* Cover: Bild laden, sobald es gebraucht wird; bis dahin Plakatfarbe */
  function coverImage(t) {
    const src = typeof t.movie.cover === "string" ? t.movie.cover.trim() : "";
    if (!src) return null;
    let c = covers.get(t.id);
    if (!c) {
      if (covers.size > 600) { // Speicher begrenzen: die ältesten fallen weg
        const first = covers.keys().next().value;
        covers.delete(first);
      }
      const img = new Image();
      img.decoding = "async";
      c = { img, ok: false };
      img.onload = () => { c.ok = true; if (c.local) stage.dataset.localCovers = String(Number(stage.dataset.localCovers || 0) + 1); requestRender(); };
      // Ladefehler: Ersatz aus dem lokalen Cover-Speicher (js/cover-store.js), sonst Plakatfarbe
      img.onerror = async () => {
        if (c.local) { c.failed = true; return; }
        c.local = true;
        const local = await localCoverUrl(src);
        if (local) img.src = local; else c.failed = true;
      };
      img.src = src;
      covers.set(t.id, c);
    }
    return c.ok ? c.img : null;
  }
  function posterFill(t, x, y, w, h) {
    const hue = hashText(t.movie.title || "") % 7;
    const pal = ["#4a2a24", "#24404a", "#33402a", "#3d2a4a", "#4a3a1c", "#33333a", "#1f4a46"][hue];
    ctx.fillStyle = pal; ctx.fillRect(x, y, w, h);
  }
  function drawCovers(list) {
    const w = COVER.w * cam.k, h = COVER.h * cam.k;
    for (const { t, x, y, a } of list) {
      const x0 = x - w / 2, y0 = y - h / 2;
      ctx.globalAlpha = a;
      const img = coverImage(t);
      if (img) ctx.drawImage(img, x0, y0, w, h); else posterFill(t, x0, y0, w, h);
      if (t.rating >= 9) { ctx.strokeStyle = "rgba(230,201,138,.85)"; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1); }
      hits.push({ x, y, r: Math.max(w, h) / 2, rect: [x0, y0, w, h], type: "title", ref: t });
    }
    ctx.globalAlpha = 1;
  }

  function drawFocusPerson(p, fp, labels) {
    const q = ease(fp);
    const cx = sx(p.x), cy = sy(p.y);
    const titles = p.ids.map(id => u.byId.get(id)).filter(t => t && visible.has(t.id))
      .sort((a, b) => (Number.parseInt(a.movie.year, 10) || 0) - (Number.parseInt(b.movie.year, 10) || 0));
    const panelW = dossier.hidden ? 0 : dossier.offsetWidth + 24;
    const room = Math.min(W - panelW, H);
    const rx = clamp(room * 0.36, 120, 320), ry = rx * 0.66;
    // Bahnen
    ctx.globalAlpha = 0.45 * q; ctx.strokeStyle = "rgba(201,164,92,.7)"; ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 0.18 * q; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.45, ry * 1.55, 0, 0, Math.PI * 2); ctx.stroke();
    // Weggefährten: auf einer äußeren Bahn, in der Richtung, in der sie im All stehen
    const partners = (focus.partners || []).filter(s => personVisible(s.person));
    const placed = partners.map(s => {
      const dx = sx(s.person.x) - cx, dy = sy(s.person.y) - cy;
      const a = Math.hypot(dx, dy) > 4 ? Math.atan2(dy, dx) : (hashText(s.person.key) % 628) / 100;
      return { ...s, a };
    }).sort((x, y) => x.a - y.a);
    const gap = Math.PI * 2 / (placed.length + 1);
    for (let i = 1; i < placed.length; i++) if (placed[i].a - placed[i - 1].a < gap) placed[i].a = placed[i - 1].a + gap;
    personSprites();
    for (const { person, count, a } of placed) {
      const ox = cx + Math.cos(a) * rx * 1.45, oy = cy + Math.sin(a) * ry * 1.55;
      const x = sx(person.x) + (ox - sx(person.x)) * q, y = sy(person.y) + (oy - sy(person.y)) * q;
      ctx.globalAlpha = 0.5 * q; ctx.strokeStyle = primaryRole(person.roles) === "wri" ? "rgba(239,138,131,.85)" : "rgba(230,201,138,.85)";
      ctx.lineWidth = 0.6 + count * 0.45;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = q;
      ctx.drawImage(glowSprite, x - 14, y - 14, 28, 28);
      roleMark(person, x, y, q);
      ctx.globalCompositeOperation = "source-over";
      labels.push({ p: person, x, y, vc: count, alpha: q, size: 12, force: true, partner: count });
      hits.push({ x, y, r: 10, type: "person", ref: person });
    }
    // Medaillon
    ctx.globalAlpha = q;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
    glow.addColorStop(0, "rgba(255,200,120,.35)"); glow.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill();
    const R = 40 * (0.6 + 0.4 * q);
    const fill = ctx.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, R);
    fill.addColorStop(0, "#3a2318"); fill.addColorStop(1, "#140b09");
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#c9a45c"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(201,164,92,.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R - 6, 0, Math.PI * 2); ctx.stroke();
    const words = p.name.split(/\s+/).filter(Boolean);
    const initials = (words[0]?.[0] || "") + (words.length > 1 ? words[words.length - 1][0] : "");
    ctx.fillStyle = "#f0d49a"; ctx.font = `600 ${Math.round(R * 0.62)}px Cinzel, ${fontDisplay()}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(initials.toUpperCase(), cx, cy + 1);
    hits.push({ x: cx, y: cy, r: R, type: "medal", ref: p });
    // Umlaufbahn: Cover fliegen von ihrem Platz auf die Bahn
    const n = titles.length;
    const cw = clamp(rx / Math.max(4, n) * 1.15, 34, 58), ch = cw * 1.5;
    ctx.font = `500 11px ${fontText()}`; ctx.textBaseline = "alphabetic";
    titles.forEach((t, i) => {
      const ang = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(ang) * rx, ty = cy + Math.sin(ang) * ry;
      const stagger = clamp((fp - i * 0.03) / (1 - Math.min(0.6, n * 0.03)), 0, 1), qq = ease(stagger);
      const x = sx(t.x) + (tx - sx(t.x)) * qq, y = sy(t.y) + (ty - sy(t.y)) * qq;
      const w = 6 + (cw - 6) * qq, h = 9 + (ch - 9) * qq;
      ctx.globalAlpha = 0.3 + 0.7 * qq;
      ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 14 * qq; ctx.shadowOffsetY = 6 * qq;
      const img = coverImage(t);
      if (img) ctx.drawImage(img, x - w / 2, y - h / 2, w, h); else posterFill(t, x - w / 2, y - h / 2, w, h);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = t.rating >= 9 ? "rgba(230,201,138,.95)" : "rgba(201,164,92,.35)"; ctx.lineWidth = 1;
      ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
      if (qq > 0.9) {
        ctx.globalAlpha = (qq - 0.9) * 10 * 0.75; ctx.fillStyle = "#efe6d8";
        ctx.fillText(t.movie.year || "", x, y - h / 2 - 6);
      }
      hits.push({ x, y, r: Math.max(w, h) / 2, rect: [x - w / 2, y - h / 2, w, h], type: "title", ref: t });
    });
    ctx.globalAlpha = 1; ctx.textAlign = "start";
  }

  function drawPeopleLabels(labels, z) {
    if (!labels.length) return;
    ctx.globalCompositeOperation = "source-over";
    const min = z < 2 ? 5 : z < 3.4 ? 3 : z < 5 ? 2 : 1;
    const taken = [];
    labels.sort((a, b) => (b.force - a.force) || b.vc - a.vc);
    const font = fontText();
    for (const l of labels) {
      if (!l.force && l.vc < min) continue;
      const big = l.vc >= 6 || l.force;
      ctx.font = `${big ? 600 : 500} ${big ? 12.5 : 11.5}px ${font}`;
      const text = l.partner ? `${l.p.name} · ${l.partner}` : l.p.name;
      const w = ctx.measureText(text).width, h = 14;
      const x = l.x + 9, y = l.y - 7;
      if (x + w > W - 4 || y < 2 || y + h > H - 2) continue;
      if (taken.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1])) continue;
      taken.push([x - 2, y - 2, w + 4, h + 4]);
      ctx.globalAlpha = clamp(l.alpha, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(text, x + 1, y + 11 + 1);
      ctx.fillStyle = big ? "#fff3dc" : "rgba(255,240,214,.86)"; ctx.fillText(text, x, y + 11);
      if (taken.length > 70) break;
    }
    ctx.globalAlpha = 1;
  }

  /* Galaxien-Namen als Knöpfe */
  let labelNodes = new Map();
  function buildGenreLabels() {
    labelsBox.innerHTML = u.genres.map(g => `<button type="button" class="uv-glabel${g.count >= 300 ? " is-big" : g.count >= 140 ? " is-mid" : ""}" data-genre="${e(g.name)}" aria-label="Galaxie ${e(g.name)}: ${fmt(g.count)} Titel – Dossier öffnen"><b>${e(g.name)}</b><span></span></button>`).join("");
    labelNodes = new Map([...labelsBox.children].map(node => [node.dataset.genre, node]));
  }
  let galaxyCounts = new Map();
  function placeGenreLabels(z, ip, fp, focusGenre, focusPerson) {
    const counts = galaxyCounts;
    const taken = [];
    for (const g of u.genres) { // größte zuerst: kleinere weichen, wenn sie sich überdecken
      const node = labelNodes.get(g.name);
      if (!node) continue;
      const count = counts.get(g.name) || 0;
      const x = sx(g.x), y = sy(g.y + g.r * 0.42);
      const fs = g.count >= 300 ? 23 : g.count >= 140 ? 18 : 15;
      const box = [x - g.name.length * fs * 0.24, y, g.name.length * fs * 0.48, fs + 12];
      const clash = g.name !== focusGenre && taken.some(r => box[0] < r[0] + r[2] && box[0] + box[2] > r[0] && box[1] < r[1] + r[3] && box[1] + box[3] > r[1]);
      const off = !layers.galaxies || !count || clash || x < -80 || x > W + 80 || y < -40 || y > H + 40;
      node.hidden = off;
      if (off) continue;
      taken.push(box);
      let a = ip < 1 ? clamp((ip - 0.4) / 0.6, 0, 1) : 1;
      if (z > 2.2 && g.name !== focusGenre) a *= clamp(1 - (z - 2.2) / 2.5, 0.28, 1);
      if (focusGenre) a *= g.name === focusGenre ? 1 : 0.25 + 0.75 * (1 - ease(fp));
      if (focusPerson) a *= 0.3 + 0.7 * (1 - ease(fp));
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
      node.style.opacity = a.toFixed(3);
      const label = `${fmt(count)} Titel`;
      if (node.lastElementChild.textContent !== label) node.lastElementChild.textContent = label;
    }
  }

  /* Minikarte: Übersicht der Nebel, Ausschnitt als Rahmen */
  let miniBase = null;
  function drawMini() {
    if (!mini.width) return;
    const MW = mini.width / dpr, MH = mini.height / dpr;
    const b = u.bounds, s = Math.min(MW / (b.x1 - b.x0), MH / (b.y1 - b.y0));
    const mxp = x => (x - (b.x0 + b.x1) / 2) * s + MW / 2, myp = y => (y - (b.y0 + b.y1) / 2) * s + MH / 2;
    if (!miniPainted) {
      miniBase = canvasOf(mini.width, mini.height);
      const g = miniBase.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#0b0706"; g.fillRect(0, 0, MW, MH);
      g.globalCompositeOperation = "lighter";
      for (const n of u.genres) { const size = n.r * 2.9 * s; g.globalAlpha = 0.8; g.drawImage(nebulaSprite(n.name, n.color), mxp(n.x) - size / 2, myp(n.y) - size / 2, size, size); }
      miniPainted = true;
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.drawImage(miniBase, 0, 0);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vx = mxp(wx(0)), vy = myp(wy(0)), vw = W / cam.k * s, vh = H / cam.k * s;
    if (vw < MW * 0.97 || vh < MH * 0.97) {
      mctx.fillStyle = "rgba(0,0,0,.35)";
      mctx.fillRect(0, 0, MW, MH);
      mctx.drawImage(miniBase, vx * dpr, vy * dpr, vw * dpr, vh * dpr, vx, vy, vw, vh);
      mctx.strokeStyle = "#e6c98a"; mctx.lineWidth = 1.2; mctx.strokeRect(vx, vy, vw, vh);
    }
    stage._mini = { mxp, myp, s, b, MW, MH };
  }

  /* Stufe, Pfad, Hinweis */
  let lastLevel = "";
  function updateLevel(z) {
    const level = focus?.type === "person" ? "Dossier" : focus?.type === "genre" ? "Galaxie" : z < Z_PEOPLE[0] + 0.2 ? "Ferne" : z < Z_COVERS ? "Nähe" : "Nahaufnahme";
    if (level === lastLevel) return;
    lastLevel = level;
    $("#uv-level").textContent = `Filmuniversum · ${level}`;
    $(".uv-hint").textContent = {
      Ferne: "Mausrad zoomt, Ziehen verschiebt, Galaxie antippen öffnet ihr Dossier",
      Nähe: "Menschen erscheinen · Helligkeit = Titel · Mensch antippen öffnet sein Dossier",
      Nahaufnahme: "Cover statt Sterne · Cover antippen öffnet die Detailseite",
      Galaxie: "Esc oder ⤢: zurück ins All",
      Dossier: "Umlaufbahn = Titel · Fäden = Weggefährten · Esc: zurück",
    }[level];
  }

  /* ---------------- Fokus und Dossier ---------------- */
  const sel = (key, label) => `<button type="button" class="uv-link" data-person="${e(key)}">${e(label)}</button>`;
  function bars(list, max) {
    return list.map(item => `<div class="uv-bar"><span>${e(item.name)}</span><i style="width:${Math.round(item.count / max * 100)}%"></i><b>${fmt(item.count)}</b></div>`).join("");
  }
  const favs = (movies, best) => (movies.length ? `<section class="uv-sect"><h3>${own(movies.length > 1 ? "Deine Lieblinge" : "Dein Liebling", movies.length > 1 ? "Meine Lieblinge" : "Mein Liebling")}</h3>${movies.map(m => `<a class="uv-who" href="movie.html?id=${encodeURIComponent(m.id)}"><b>${e(m.title)}</b><span class="is-gold">${best}</span></a>`).join("")}</section>` : "");
  const trio = d => `<div class="uv-trio"><p><b>${fmt(d.count ?? d.titles.length)}</b><span>Titel</span></p>${has("rating") ? `<p><b>${d.own === null ? "–" : f1(d.own)}</b><span>Ø ${own("deine", "meine")} Note</span></p>` : ""}<p><b>${d.imdb === null ? "–" : f1(d.imdb)}</b><span>Ø IMDb</span></p></div>`;

  function openGenre(name, { move = true } = {}) {
    const d = genreDossier(u, name, visible);
    if (move || focus?.key !== name) focus = { type: "genre", key: name, t0: performance.now() };
    dossierOpen = "genre";
    dossier.innerHTML = `
      <div><p class="uv-kicker">Galaxie</p><h2>${e(name)}</h2>
        <p class="uv-sub">${d.neighbors.length ? `nah an ${e(d.neighbors.slice(0, 2).map(n => n.name).join(" und "))}` : "eine Galaxie für sich"}</p></div>
      ${trio(d)}
      ${d.neighbors.length ? `<section class="uv-sect"><h3>Nachbarn</h3>${bars(d.neighbors, d.neighbors[0].count)}</section>` : ""}
      ${d.stars.length ? `<section class="uv-sect"><h3>Hellste Sterne</h3>${d.stars.map(s => `<button type="button" class="uv-who" data-person="${e(s.person.key)}"><b>${e(s.person.name)}</b><span>${fmt(s.count)} Titel</span></button>`).join("")}</section>` : ""}
      ${favs(d.favorites, d.best)}
      <div class="uv-actions">${onShowGenre ? `<button type="button" class="button" data-uv="grid-genre">Im Raster zeigen</button>` : ""}<button type="button" class="button quiet uv-back" data-uv="back">Zurück ins All</button></div>`;
    dossier.hidden = false;
    if (!move) return;
    const g = u.byName.get(name);
    const k = clamp(Math.min(W - 380, H) / (g.r * 3.2), kHome, maxK());
    fly(g.x + (W > 900 ? 170 / k : 0), g.y, k, 950);
  }

  function openPerson(key, { move = true } = {}) {
    const d = personDossier(u, key, visible);
    if (!d) return;
    const p = d.person;
    if (move || focus?.key !== key) focus = { type: "person", key, t0: performance.now() };
    focus.partners = d.partners;
    dossierOpen = "person";
    const roles = ["dir", "wri", "act"].filter(r => p.roles[r]).map(r => ROLE_NAMES[r]).join(" · ");
    const [first, ...rest] = p.name.split(" ");
    const y0 = d.years[0], y1 = d.years[d.years.length - 1];
    const span = Math.max(1, y1 - y0);
    dossier.innerHTML = `
      <div><p class="uv-kicker">Dossier · ${e(roles)}</p><h2>${rest.length ? `${e(first)} <em>${e(rest.join(" "))}</em>` : `<em>${e(p.name)}</em>`}</h2>
        <p class="uv-sub">${d.genres.length > 1 ? `Wohnt zwischen ${e(d.genres[0].name)} und ${e(d.genres[1].name)}` : d.genres.length ? `Zu Hause im ${e(d.genres[0].name)}` : ""}</p></div>
      ${trio(d)}
      ${d.genres.length ? `<section class="uv-sect"><h3>Galaxien</h3>${bars(d.genres, d.genres[0].count)}</section>` : ""}
      ${d.years.length ? `<section class="uv-sect"><h3>Filmografie in ${own("deiner", "meiner")} Kinothek</h3><div class="uv-years" aria-label="${d.years.join(", ")}"><span>${y0}</span><span>${y1 !== y0 ? y1 : ""}</span>${d.titles.map(t => { const y = Number.parseInt(t.movie.year, 10); return y > 1800 ? `<a href="movie.html?id=${encodeURIComponent(t.id)}" title="${e(t.movie.title)} (${y})" style="left:${y1 === y0 ? 50 : ((y - y0) / span * 100).toFixed(1)}%"></a>` : ""; }).join("")}</div></section>` : ""}
      ${d.partners.length ? `<section class="uv-sect"><h3>Arbeitet oft mit</h3>${d.partners.slice(0, 5).map(s => `<button type="button" class="uv-who" data-person="${e(s.person.key)}"><b>${e(s.person.name)}</b><span>${fmt(s.count)} gemeinsam</span></button>`).join("")}</section>` : ""}
      ${favs(d.favorites, d.best)}
      <div class="uv-actions">${onShowPerson ? `<button type="button" class="button" data-uv="grid-person">Im Raster zeigen</button>` : ""}<button type="button" class="button quiet uv-back" data-uv="back">Zurück ins All</button></div>`;
    dossier.hidden = false;
    if (!move) { requestRender(); return; }
    const k = clamp(cam.k, kHome * 2.4, kHome * 4);
    fly(p.x + (W > 900 ? 170 / k : 0), p.y, k, 950);
  }

  function openRanking() {
    focus = null;
    dossierOpen = "ranking";
    const list = universeRanking(u, visible, rankRole);
    dossier.innerHTML = `
      <div><p class="uv-kicker">Rangliste</p><h2>${own("Deine", "Meine")} <em>Stammbesetzung</em></h2><p class="uv-sub">Wer in den meisten Titeln steckt (ab 2)</p></div>
      <div class="uv-tabs" role="group" aria-label="Rolle">${RANK_TABS.map(([key, label]) => `<button type="button" data-rank="${key}" aria-pressed="${key === rankRole}">${label}</button>`).join("")}</div>
      <ol class="uv-rank">${list.map((s, i) => `<li><button type="button" class="uv-who" data-person="${e(s.person.key)}"><i>${i + 1}</i><b>${e(s.person.name)}</b><span>${fmt(s.count)}</span></button></li>`).join("") || `<li class="uv-sub">Noch niemand mit zwei Titeln.</li>`}</ol>
      <div class="uv-actions"><button type="button" class="button quiet uv-back" data-uv="back">Schließen</button></div>`;
    dossier.hidden = false;
    requestRender();
  }

  function closeFocus() {
    focus = null; dossierOpen = null; dossier.hidden = true; hideTip();
    requestRender();
  }

  /* ---------------- Vorschau ---------------- */
  function showTip(hit, px, py) {
    let html = "";
    if (hit.type === "person" || hit.type === "medal") {
      const p = hit.ref, vc = visibleCount(p);
      const roles = ["dir", "wri", "act"].filter(r => p.roles[r]).map(r => ROLE_NAMES[r]).join(" · ");
      html = `<p class="uv-kicker">${e(roles)} · ${fmt(vc)} Titel</p><b>${e(p.name)}</b><span>Antippen öffnet das Dossier</span>`;
    } else if (hit.type === "title") {
      const m = hit.ref.movie;
      html = `<p class="uv-kicker">${e(hit.ref.genres.slice(0, 3).join(" · "))}</p><b>${e(m.title)}</b><span>${e([m.year, hit.ref.rating ? `${own("Deine", "Meine")} Note ${hit.ref.rating}` : "", m.imdbRating ? `IMDb ${String(m.imdbRating).replace(".", ",")}` : ""].filter(Boolean).join(" · "))}</span>`;
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const right = dossier.hidden ? W : W - dossier.offsetWidth - 24;
    tip.style.left = `${px + 16 + tw > right ? px - tw - 16 : px + 16}px`;
    tip.style.top = `${clamp(py - th / 2, 8, H - th - 8)}px`;
  }
  function hideTip() { tip.hidden = true; }
  function hitAt(px, py) {
    let best = null, bestD = Infinity;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (h.rect) {
        const [x, y, w, hh] = h.rect;
        if (px >= x && px <= x + w && py >= y && py <= y + hh) return h;
        continue;
      }
      const d = Math.hypot(px - h.x, py - h.y);
      const reach = h.type === "person" ? Math.max(h.r, 10) : h.type === "medal" ? h.r : 7;
      if (d <= reach && (d < bestD || (h.type === "person" && best?.type === "title"))) { best = h; bestD = d; }
    }
    return best;
  }

  /* ---------------- Bedienung ---------------- */
  const pointers = new Map();
  let drag = null, pinch = null;
  const local = event => { const r = stage.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null;
    } else drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: false, id: event.pointerId };
  });
  canvas.addEventListener("pointermove", event => {
    const p = local(event);
    mouse = { x: p.x, y: p.y, in: true };
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = clamp(pinch.k * d / pinch.d, minK(), maxK());
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const wx0 = wx(pinch.cx), wy0 = wy(pinch.cy);
      cam.k = k; cam.x = wx0 - (cx - W / 2) / k; cam.y = wy0 - (cy - H / 2) / k;
      pinch.cx = cx; pinch.cy = cy;
      hideTip(); requestRender();
      return;
    }
    if (drag) {
      const dx = p.x - drag.x, dy = p.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; canvas.setPointerCapture(drag.id); stage.classList.add("is-dragging"); hideTip(); }
      if (drag.moved) { cancelAnimationFrame(cam.raf); cam.raf = 0; cam.x = drag.cx - dx / cam.k; cam.y = drag.cy - dy / cam.k; requestRender(); return; }
    }
    const hit = hitAt(p.x, p.y);
    const ref = hit?.ref || null;
    if ((hover?.ref || null) !== ref) { hover = hit ? { type: hit.type, ref } : null; requestRender(); }
    canvas.style.cursor = hit ? "pointer" : "";
    if (hit && hit.type !== "medal") showTip(hit, p.x, p.y); else hideTip();
    if (!reducedMotion()) requestRender(); // Tiefe: Sternfeld folgt der Maus
  });
  const endPointer = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && event.pointerId === drag.id) {
      const wasDrag = drag.moved;
      drag = null; stage.classList.remove("is-dragging");
      if (!wasDrag && event.type === "pointerup") click(local(event));
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { mouse.in = false; hover = null; hideTip(); requestRender(); });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    const p = local(event);
    zoomAt(p.x, p.y, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018)));
    hideTip();
  }, { passive: false });
  canvas.addEventListener("dblclick", event => { const p = local(event); zoomAt(p.x, p.y, 2, 500); });

  function click(p) {
    const hit = hitAt(p.x, p.y);
    if (!hit) {
      // In einer Galaxie (ohne Stern getroffen): ihr Dossier
      const g = u.genres.find(g => layers.galaxies && Math.hypot(wx(p.x) - g.x, (wy(p.y) - g.y) * 1.2) < g.r * 0.55);
      if (g && zoom() < Z_COVERS) openGenre(g.name);
      return;
    }
    if (hit.type === "person") openPerson(hit.ref.key);
    else if (hit.type === "title") location.href = `movie.html?id=${encodeURIComponent(hit.ref.id)}`;
  }

  stage.addEventListener("keydown", event => {
    if (event.target !== stage) return;
    const step = 80 / cam.k;
    const keys = {
      "+": () => zoomAt(W / 2, H / 2, 1.6, 350), "=": () => zoomAt(W / 2, H / 2, 1.6, 350), "-": () => zoomAt(W / 2, H / 2, 1 / 1.6, 350),
      0: () => goHome(600), ArrowLeft: () => setCam(cam.x - step, cam.y, cam.k), ArrowRight: () => setCam(cam.x + step, cam.y, cam.k),
      ArrowUp: () => setCam(cam.x, cam.y - step, cam.k), ArrowDown: () => setCam(cam.x, cam.y + step, cam.k),
    };
    if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape" && (focus || !dossier.hidden)) { event.preventDefault(); closeFocus(); goHome(800); stage.focus(); }
  });

  panel.addEventListener("click", event => {
    const lens = event.target.closest("[data-layer]");
    if (lens) {
      const key = lens.dataset.layer;
      layers[key] = !layers[key];
      lens.setAttribute("aria-pressed", String(layers[key]));
      requestRender();
      return;
    }
    const genre = event.target.closest("[data-genre]");
    if (genre) { openGenre(genre.dataset.genre); return; }
    const person = event.target.closest("[data-person]");
    if (person) { openPerson(person.dataset.person); return; }
    const rank = event.target.closest("[data-rank]");
    if (rank) { rankRole = rank.dataset.rank; openRanking(); dossier.querySelector(`[data-rank="${rankRole}"]`)?.focus(); return; }
    if (event.target.closest("[data-start-fetch]") && onStartFetch) { onStartFetch(); return; }
    const action = event.target.closest("[data-uv]")?.dataset.uv;
    if (!action) return;
    if (action === "in") zoomAt(W / 2, H / 2, 1.6, 350);
    else if (action === "out") zoomAt(W / 2, H / 2, 1 / 1.6, 350);
    else if (action === "home") { closeFocus(); goHome(800); }
    else if (action === "back") { closeFocus(); goHome(800); }
    else if (action === "ranking") { if (dossierOpen === "ranking") closeFocus(); else openRanking(); }
    else if (action === "grid-genre" && focus?.type === "genre") onShowGenre?.(focus.key);
    else if (action === "grid-person" && focus?.type === "person") {
      const p = u.byKey.get(focus.key);
      onShowPerson?.(p.ids, p.name);
    }
  });
  mini.parentElement.addEventListener("click", event => {
    const m = stage._mini;
    if (!m) return;
    const r = mini.getBoundingClientRect();
    const x = (event.clientX - r.left - m.MW / 2) / m.s + (m.b.x0 + m.b.x1) / 2;
    const y = (event.clientY - r.top - m.MH / 2) / m.s + (m.b.y0 + m.b.y1) / 2;
    fly(x, y, Math.max(cam.k, kHome * 1.8), 700);
  });

  /* Umschalter Bewertet / Ganze Kinothek (in der Werkzeugleiste über der Bühne) */
  const modeGroup = document.querySelector(".universe-mode");
  const modeButtons = modeGroup ? [...modeGroup.querySelectorAll("[data-universe-mode]")] : [];
  const shownModes = modeButtons.filter(button => { button.hidden = !modes.includes(button.dataset.universeMode); return !button.hidden; });
  modeGroup?.classList.toggle("is-single", shownModes.length < 2);
  const syncModes = () => modeButtons.forEach(button => {
    const on = button.dataset.universeMode === mode;
    button.setAttribute("aria-checked", String(on));
    button.tabIndex = on ? 0 : -1;
  });
  syncModes();
  shownModes.forEach(button => button.addEventListener("click", () => {
    if (button.dataset.universeMode === mode) return;
    mode = button.dataset.universeMode;
    syncModes();
    onModeChange(mode);
    refreshVisible();
  }));
  modeGroup?.addEventListener("keydown", event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const i = shownModes.findIndex(b => b.dataset.universeMode === mode);
    const next = shownModes[(i + step + shownModes.length) % shownModes.length];
    next.focus(); next.click();
  });

  /* ---------------- Daten ---------------- */
  function refreshVisible() {
    if (!u) return;
    visible = new Set(universeMovies(filtered, mode).map(m => m.id));
    matches = matchPeople(u, query, visible);
    if (matches.length) pulseUntil = performance.now() + 3200;
    const people = u.people.filter(p => p.ids.some(id => visible.has(id))).length;
    galaxyCounts = new Map();
    for (const t of u.titles) if (visible.has(t.id)) for (const g of t.genres) galaxyCounts.set(g, (galaxyCounts.get(g) || 0) + 1);
    const galaxies = galaxyCounts.size;
    $(".uv-count").textContent = visible.size
      ? `${fmt(visible.size)} Titel · ${fmt(galaxies)} Galaxien · ${fmt(people)} ${people === 1 ? "Mensch" : "Menschen"}${matches.length ? ` · ${fmt(matches.length)} ${matches.length === 1 ? "Mensch passt" : "Menschen passen"} zur Suche – Enter fliegt hin` : ""}`
      : "";
    canvas.setAttribute("aria-label", `Filmuniversum: ${fmt(visible.size)} Titel in ${fmt(galaxies)} Galaxien, ${fmt(people)} Menschen. Galaxien und Dossiers sind über die Knöpfe erreichbar.`);
    const empty = $(".uv-empty");
    empty.hidden = visible.size > 0;
    empty.textContent = all.length === 0 ? "Hier ist noch nichts – erst die IMDb-Listen importieren." : mode === "rated" && filtered.length ? `Keine bewerteten Titel in dieser Auswahl – „Ganze Kinothek“ zeigt alle.` : "Keine Treffer für Suche und Filter.";
    if (focus?.type === "person" && !u.byKey.get(focus.key)?.ids.some(id => visible.has(id))) closeFocus();
    else if (dossierOpen === "genre") openGenre(focus.key, { move: false });
    else if (dossierOpen === "person") openPerson(focus.key, { move: false });
    else if (dossierOpen === "ranking") openRanking();
    requestRender();
  }

  function rebuild() {
    const key = all;
    if (!u || uKey !== key || u._cast !== castData) {
      u = buildUniverse(all, castData);
      u._portrait = false;
      hover = null;
      u._cast = castData;
      uKey = key;
      buildGenreLabels();
      miniPainted = false;
      measure();
      if (!started) goHome(0);
    }
    stale = false;
    refreshVisible();
    if (!started && visible.size && !panel.hidden) start();
  }

  let started = false;
  let castTimer = 0;
  function start() {
    if (started || !u || !visible.size) return;
    started = true;
    goHome(0);
    // Urknall: je nach Einstellung
    if (!reducedMotion()) {
      let memory = {};
      try {
        memory = { seenThisSession: sessionStorage.getItem("universe:intro-session") === "1", last: Number(localStorage.getItem("universe:intro-last")) || 0, day: localStorage.getItem("universe:intro-day") || "" };
      } catch { /* ohne Speicher: spielen */ }
      const due = introDue(introMode(), { now: new Date(), ...memory });
      if (due.play && visible.size) {
        intro = { t0: performance.now() };
        stage.dataset.intro = "played";
        try {
          if (due.remember.session) sessionStorage.setItem("universe:intro-session", "1");
          if (due.remember.last) localStorage.setItem("universe:intro-last", String(due.remember.last));
          if (due.remember.day) localStorage.setItem("universe:intro-day", due.remember.day);
        } catch { /* egal */ }
      }
    }
    requestRender();
  }

  // Für die Browser-Tests: Trefferflächen, Kamera, Zeichenzeit
  stage._universe = { hits: () => hits, cam: () => ({ x: cam.x, y: cam.y, k: cam.k, kHome }), drawMs: () => lastDrawMs, portrait: () => Boolean(u?._portrait), draw: () => draw() };

  new ResizeObserver(() => {
    if (panel.hidden || !u) return;
    const wasHome = Math.abs(cam.k - kHome) < 1e-6;
    turned = false;
    measure();
    if (turned && focus) closeFocus();
    if ((wasHome && !focus) || turned) goHome(0); else requestRender();
  }).observe(stage);

  return {
    /**
     * @param {{all: Array, filtered: Array, query: string, castData: object}} data
     */
    update(data) {
      const castChanged = (data.castData || {}) !== castData;
      all = data.all; filtered = data.filtered; query = data.query || ""; castData = data.castData || {};
      if (panel.hidden) { stale = true; return; }
      // Neue Besetzung kommt beim Nachladen oft: Neuaufbau gesammelt, nicht bei jedem Speichern
      if (castChanged && u && uKey === all) {
        clearTimeout(castTimer);
        castTimer = setTimeout(() => { if (!panel.hidden) rebuild(); else stale = true; }, 2500);
        refreshVisible();
        return;
      }
      rebuild();
    },
    show() {
      if (!measure() && !u) return;
      if (stale || !u) rebuild();
      measure();
      if (!started) start();
      requestRender();
    },
    /** Enter in der Suche: zum ersten passenden Menschen fliegen, sonst zum ersten Titel. */
    flyToMatch() {
      if (!u) return false;
      if (matches.length) { openPerson(matches[0].key); return true; }
      const t = u.titles.find(t => visible.has(t.id));
      if (t && visible.size <= 30) { fly(t.x, t.y, kHome * 5, 900); return true; }
      return false;
    },
    /** Stand des Besetzungs-Abrufs unter der Bühne. */
    setStatus(text, { action = "", progress = null } = {}) {
      $("#universe-status").innerHTML = `${progress !== null ? `<span class="uv-meter" aria-hidden="true"><i style="width:${Math.round(progress * 100)}%"></i></span>` : ""}<span>${e(text)}</span>${action ? ` <button type="button" class="small-button" data-start-fetch>${e(action)}</button>` : ""}`;
    },
    mode: () => mode,
  };
}
