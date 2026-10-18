import { movieCardHtml, settleCachedCovers } from "./movie-card.js";

/*
 * Gelöscht wird auf der Detailseite, danach geht es zurück zu Entertainment.
 * Damit man dort sieht, was passiert ist, übergibt die Detailseite den Film
 * über sessionStorage (gilt nur für diesen Tab). Die Übersicht setzt die Karte
 * noch einmal an ihre alte Stelle, lässt sie verschwinden und die übrigen
 * Karten weich nachrücken.
 */

const KEY = "dashboard:last-deleted-movie";
const MAX_AGE_MS = 15000; // ältere Übergaben (z. B. nach Tab-Wiederherstellung) ignorieren

/**
 * Merkt sich einen gerade gelöschten Film für die nächste Seite.
 * @param {object} movie
 * @param {number} index - Position in der Sammlung vor dem Löschen.
 */
export function rememberDeletedMovie(movie, index) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ movie, index, at: Date.now() }));
  } catch {
    // Speicher nicht verfügbar: dann eben ohne Animation
  }
}

/**
 * Holt die Übergabe genau einmal ab (und löscht sie dabei).
 * @returns {{movie: object, index: number}|null}
 */
export function takeDeletedMovie() {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry?.movie?.id || Date.now() - entry.at > MAX_AGE_MS) return null;
    return { movie: entry.movie, index: Number(entry.index) || 0 };
  } catch {
    return null;
  }
}

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Setzt die Karte des gelöschten Films an ihre alte Stelle im Raster und
 * lässt sie verschwinden. Nur wenn sie dabei im sichtbaren Bereich liegt und
 * keine reduzierte Bewegung gewünscht ist - sonst passiert nichts.
 * @param {HTMLElement} grid - Container des Rasters.
 * @param {{movie: object, index: number}} deleted
 */
export function playRemoval(grid, deleted) {
  const cards = [...grid.querySelectorAll(".movie-card")];
  if (calm() || cards.length === 0) return;

  const template = document.createElement("template");
  template.innerHTML = movieCardHtml(deleted.movie, "#").trim();
  const ghost = template.content.firstElementChild;
  ghost.classList.add("is-removing");
  ghost.removeAttribute("href");          // nicht mehr anklickbar
  ghost.removeAttribute("data-movie-id"); // wird nicht als echte Karte gefunden
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;

  const anchor = cards[Math.min(deleted.index, cards.length)] || null;
  grid.insertBefore(ghost, anchor);
  settleCachedCovers(grid);

  const box = ghost.getBoundingClientRect();
  if (box.bottom <= 0 || box.top >= window.innerHeight) { ghost.remove(); return; }

  // Kurz stehen lassen, damit das Auge die Karte findet, dann ausblenden
  window.setTimeout(async () => {
    if (!ghost.isConnected) return; // Raster wurde inzwischen neu aufgebaut (z. B. Suche)
    const exit = ghost.animate(
      [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.82)" }],
      { duration: 280, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" }
    );
    try { await exit.finished; } catch { return; }
    if (!ghost.isConnected) return;

    // FLIP: Positionen merken, Karte entfernen, Nachbarn von alt nach neu gleiten lassen
    const others = [...grid.querySelectorAll(".movie-card")].filter(card => card !== ghost);
    const before = new Map(others.map(card => [card, card.getBoundingClientRect()]));
    ghost.remove();
    for (const card of others) {
      const old = before.get(card);
      const now = card.getBoundingClientRect();
      const dx = old.left - now.left;
      const dy = old.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if (Math.abs(dy) >= 1) {
        // Reihe gewechselt: nicht diagonal quer über das Raster fliegen, sondern
        // am neuen Platz von rechts einblenden - erst wenn die Nachbarkarte den
        // Platz weitgehend geräumt hat, sonst überlappen sich beide kurz
        card.animate(
          [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "translateX(0)" }],
          { duration: 280, delay: 190, easing: "cubic-bezier(.2, .7, .3, 1)", fill: "backwards" }
        );
      } else {
        card.animate(
          [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
          { duration: 340, easing: "cubic-bezier(.2, .7, .3, 1)" }
        );
      }
    }
  }, 450);
}
