/*
 * Cover hinter Glas (2.43): Beim Darüberfahren neigt sich das Cover leicht zur
 * Maus, ein Lichtreflex wandert mit. Nur mit Maus (hover + feiner Zeiger) und
 * ohne „Bewegung reduzieren". Die Werte landen als CSS-Variablen am Cover
 * (--rx, --ry Neigung; --gx, --gy Reflex), das Aussehen steht in css/motion.css.
 * Eingebunden über js/ui/movie-card.js - gilt für jedes Cover-Raster.
 */

const MAX_X = 7;  // Grad, Neigung nach vorn/hinten
const MAX_Y = 9;  // Grad, Neigung nach links/rechts

const enabled = () => typeof window !== "undefined"
  && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let current = null;
let frame = 0;
let last = null;

function reset(cover) {
  if (!cover) return;
  for (const name of ["--rx", "--ry", "--gx", "--gy"]) cover.style.removeProperty(name);
}

function apply() {
  frame = 0;
  if (!last) return;
  const { cover, x, y } = last;
  cover.style.setProperty("--rx", `${((0.5 - y) * 2 * MAX_X).toFixed(2)}deg`);
  cover.style.setProperty("--ry", `${((x - 0.5) * 2 * MAX_Y).toFixed(2)}deg`);
  cover.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
  cover.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
}

function onMove(event) {
  if (event.pointerType !== "mouse") return;
  const card = event.target.closest?.(".movie-card");
  const cover = card?.querySelector(".movie-card-cover");
  if (cover !== current) { reset(current); current = cover; }
  if (!cover || !enabled() || card.classList.contains("is-removing")) { last = null; return; }
  // Am Rahmen der Karte messen (das Cover selbst ist beim Darüberfahren vergrößert und geneigt)
  const rect = card.getBoundingClientRect();
  const height = cover.offsetHeight || rect.height;
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / height));
  last = { cover, x, y };
  if (!frame) frame = requestAnimationFrame(apply);
}

if (typeof document !== "undefined") {
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", () => { reset(current); current = null; last = null; }, true);
}
