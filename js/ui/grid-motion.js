import { reducedMotion } from "../utils/dom.js";

/*
 * „Umsortieren mit Gedächtnis": Ändern Suche, Filter oder Sortierung das
 * Cover-Raster, springt es nicht, sondern jedes Cover gleitet von seinem
 * alten an seinen neuen Platz (FLIP: erst messen, neu zeichnen, dann von der
 * alten Stelle aus zurückanimieren). Wegfallende Cover sinken an ihrer alten
 * Stelle weg (als Kopie, das Original ist schon fort), neu hinzukommende
 * tauchen kurz gestaffelt auf.
 *
 * Nur, was vorher oder nachher im Fenster zu sehen ist, bewegt sich - bei
 * einigen hundert Titeln bleibt das so billig. „Bewegung reduzieren": keine
 * Bewegung, das Raster wechselt sofort.
 *
 * Verwendung:  const before = captureGrid(grid);  …neu zeichnen…;  animateGrid(grid, before);
 * Gemeinsam mit der Website (gemeinsam.txt).
 */

const EASE = "cubic-bezier(.2, .8, .2, 1)";
const MOVE_MS = 520;
const ENTER_MS = 420;
const LEAVE_MS = 260;
const STAGGER_MS = 28;
const MAX_STAGGER_MS = 340;
const MARGIN = 120; // so viel über/unter dem Fenster zählt noch als sichtbar

const CARD = ".movie-card[data-movie-id]";
const inView = rect => rect.bottom > -MARGIN && rect.top < window.innerHeight + MARGIN;

/**
 * Merkt sich Lage und Knoten aller Karten im Raster (vor dem Neuzeichnen).
 * @param {Element} grid
 * @returns {Map<string, {rect: DOMRect, cover: Element|null, coverRect: DOMRect|undefined}>|null}
 */
export function captureGrid(grid) {
  if (!grid || reducedMotion()) return null;
  const before = new Map();
  for (const card of grid.querySelectorAll(CARD)) {
    const cover = card.querySelector(".movie-card-cover");
    before.set(card.dataset.movieId, { rect: card.getBoundingClientRect(), cover, coverRect: cover?.getBoundingClientRect() });
  }
  return before;
}

/**
 * Spielt den Übergang vom gemerkten zum aktuellen Raster.
 * @param {Element} grid
 * @param {ReturnType<typeof captureGrid>} before
 */
export function animateGrid(grid, before) {
  if (!grid || !before || reducedMotion()) return;
  const host = grid.parentElement;
  host.querySelectorAll(":scope > .grid-ghost").forEach(ghost => ghost.remove());
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const hostRect = host.getBoundingClientRect();
  const present = new Set();
  let entering = 0;

  for (const card of grid.querySelectorAll(CARD)) {
    const id = card.dataset.movieId;
    present.add(id);
    const now = card.getBoundingClientRect();
    const old = before.get(id);
    if (!inView(now) && !(old && inView(old.rect))) continue;
    if (old) {
      const dx = old.rect.left - now.left;
      const dy = old.rect.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: MOVE_MS, easing: EASE });
    } else {
      card.animate([
        { opacity: 0, transform: "translateY(14px) scale(.94)" },
        { opacity: 1, transform: "none" },
      ], { duration: ENTER_MS, delay: Math.min(entering++ * STAGGER_MS, MAX_STAGGER_MS) + 90, easing: EASE, fill: "backwards" });
    }
  }

  // Weggefallene Karten: ein schlichtes Abbild des Covers an der alten Stelle,
  // das wegsinkt - neben dem Raster und ohne die Klassen der Karte, damit es
  // nirgends als Karte mitzählt; vor dem Raster eingefügt, liegt es unter den
  // gleitenden Karten
  for (const [id, old] of before) {
    if (present.has(id) || !old.coverRect || !inView(old.coverRect)) continue;
    const ghost = document.createElement("div");
    ghost.className = "grid-ghost";
    ghost.setAttribute("aria-hidden", "true");
    const img = old.cover?.querySelector("img.cover-image");
    if (img?.complete && img.naturalWidth) {
      const copy = new Image();
      copy.alt = "";
      copy.src = img.currentSrc || img.src;
      ghost.append(copy);
    }
    Object.assign(ghost.style, {
      left: `${old.coverRect.left - hostRect.left}px`,
      top: `${old.coverRect.top - hostRect.top}px`,
      width: `${old.coverRect.width}px`,
      height: `${old.coverRect.height}px`,
    });
    host.insertBefore(ghost, grid);
    ghost.animate([
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(10px) scale(.9)" },
    ], { duration: LEAVE_MS, easing: "ease-in", fill: "forwards" }).finished
      .catch(() => {}).then(() => ghost.remove());
  }
}
