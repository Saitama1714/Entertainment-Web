import { reducedMotion } from "../utils/dom.js";

/*
 * „Lichtkegel mit Staub" im Kopfbereich der Startseite: ein schräger
 * Projektorstrahl, in dem langsam Staub treibt, dazu im dunklen Design ein
 * Hauch Filmkorn. Ganz zurückgenommen hinter Überschrift und Uhr.
 *
 * Läuft nur, solange der Kopfbereich zu sehen ist und der Tab offen ist.
 * „Bewegung reduzieren": ein stilles Bild ohne Bewegung. Abschaltbar
 * (Dashboard: Einstellungen → Bewegung; Website: Ansicht → Bewegung).
 * Gemeinsam mit der Website (gemeinsam.txt).
 */

const MAX_MOTES = 90;
const AREA_PER_MOTE = 9000; // px² je Staubkorn
const GRAIN_SIZE = 96;

let canvas = null;
let ctx = null;
let grain = null;
let motes = [];
let size = { w: 0, h: 0, dpr: 1 };
let visible = false;
let enabled = true;
let frame = 0;
let raf = 0;

const dark = () => document.documentElement.dataset.theme !== "light";

function makeMotes() {
  const count = Math.min(MAX_MOTES, Math.round((size.w * size.h) / AREA_PER_MOTE));
  motes = Array.from({ length: count }, () => ({
    x: Math.random(), y: Math.random(),
    r: .4 + Math.random() * 1.5,
    vx: (Math.random() - .3) * .00010, vy: (Math.random() - .5) * .00007,
    a: .25 + Math.random() * .6, p: Math.random() * Math.PI * 2,
  }));
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  size = { w: rect.width, h: rect.height, dpr: Math.min(2, window.devicePixelRatio || 1) };
  canvas.width = Math.max(1, Math.round(size.w * size.dpr));
  canvas.height = Math.max(1, Math.round(size.h * size.dpr));
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  if (Math.abs(motes.length - Math.min(MAX_MOTES, Math.round((size.w * size.h) / AREA_PER_MOTE))) > 8) makeMotes();
}

function refreshGrain() {
  const g = grain.getContext("2d");
  const image = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() * 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  g.putImageData(image, 0, 0);
}

function draw(time, moving) {
  const { w, h } = size;
  if (!w || !h) return;
  const night = dark();
  ctx.clearRect(0, 0, w, h);

  // Strahl: von oben links schräg in den Raum, mit leichtem Flackern
  const flicker = moving ? .93 + Math.sin(time / 95) * .025 + Math.random() * .045 : 1;
  const ox = w * .05, oy = -h * .25;
  const beam = ctx.createRadialGradient(ox, oy, 8, ox, oy, Math.hypot(w, h) * .95);
  beam.addColorStop(0, night ? "rgba(255, 216, 150, .24)" : "rgba(156, 2, 5, .10)");
  beam.addColorStop(.55, night ? "rgba(255, 216, 150, .08)" : "rgba(156, 2, 5, .035)");
  beam.addColorStop(1, "rgba(255, 216, 150, 0)");
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.filter = "blur(14px)"; // weiche Ränder wie bei echtem Licht
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(ox - 4, oy);
  ctx.lineTo(w * .46, h * 1.15);
  ctx.lineTo(w * 1.02, h * .62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Staub: im Strahl hell, daneben kaum zu sehen
  ctx.fillStyle = night ? "#ffe9c4" : "#7a5c1c";
  for (const m of motes) {
    if (moving) {
      m.x += m.vx * 16;
      m.y += m.vy * 16 + Math.sin(time / 2100 + m.p) * .00005;
      if (m.x > 1.03) m.x = -.03; else if (m.x < -.03) m.x = 1.03;
      if (m.y > 1.05) m.y = -.05; else if (m.y < -.05) m.y = 1.05;
    }
    const px = m.x * w, py = m.y * h;
    const across = (px - ox) / w - (py - oy) / (h * 1.6);
    const inBeam = Math.max(0, 1 - Math.abs(across - .32) * 2.6);
    ctx.globalAlpha = m.a * (.1 + inBeam * .9) * (.62 + .38 * Math.sin(time / 760 + m.p)) * (night ? 1 : .7);
    ctx.beginPath();
    ctx.arc(px, py, m.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Filmkorn, nur im dunklen Design
  if (night) {
    if (moving && frame++ % 3 === 0) refreshGrain();
    ctx.globalAlpha = .022;
    ctx.globalCompositeOperation = "overlay";
    for (let x = 0; x < w; x += GRAIN_SIZE * 2) {
      for (let y = 0; y < h; y += GRAIN_SIZE * 2) ctx.drawImage(grain, x, y, GRAIN_SIZE * 2, GRAIN_SIZE * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
}

function loop(time) {
  draw(time, true);
  raf = requestAnimationFrame(loop);
}

/** Startet oder hält die Bewegung an, je nach Sichtbarkeit und Einstellung. */
function update() {
  if (!canvas) return;
  cancelAnimationFrame(raf);
  raf = 0;
  canvas.hidden = !enabled;
  if (!enabled) return;
  if (visible && !reducedMotion() && !document.hidden) raf = requestAnimationFrame(loop);
  else draw(performance.now(), false);
}

/**
 * Legt den Lichtkegel hinter den Kopfbereich.
 * @param {Element|null} host - z. B. .page-head der Startseite.
 * @param {{enabled?: boolean}} [options]
 */
export function initProjectorDust(host, { enabled: on = true } = {}) {
  if (!host || canvas) return;
  enabled = on;
  canvas = document.createElement("canvas");
  canvas.className = "projector-dust";
  canvas.setAttribute("aria-hidden", "true");
  host.classList.add("has-projector-dust");
  host.prepend(canvas);
  ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); canvas = null; return; }
  grain = document.createElement("canvas");
  grain.width = grain.height = GRAIN_SIZE;
  refreshGrain();
  resize();
  makeMotes();

  new ResizeObserver(() => { resize(); if (!raf) draw(performance.now(), false); }).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }).observe(canvas);
  document.addEventListener("visibilitychange", update);
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", update);
  // Design gewechselt: stilles Bild sofort neu zeichnen
  new MutationObserver(() => { if (!raf) draw(performance.now(), false); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  update();
}

/** Schaltet den Lichtkegel ein oder aus (gilt sofort). */
export function setProjectorDust(on) {
  enabled = Boolean(on);
  update();
}
