import { gridStep } from "../logic/grid-nav-logic.js";
import { imdbScore, ownScore, joinParts } from "../logic/detail-logic.js";
import { genresOf } from "../logic/movies-logic.js";
import { runtimeOf, runtimeLabel } from "../logic/tonight-logic.js";
import { openModal, closeModal } from "../utils/modal.js";
import { escapeHtml } from "../utils/dom.js";
import { has } from "../utils/host.js";

/*
 * Tastatur im Cover-Raster (2.43): Ist eine Karte fokussiert (Tab oder
 * Klick), wandern die Pfeiltasten durch das Raster - auch hoch und runter,
 * passend zur aktuellen Spaltenzahl. Pos1/Ende springen an Anfang und Ende,
 * Bild hoch/runter um drei Zeilen. Enter öffnet wie gewohnt die Detailseite
 * (ist ja ein Link), die Leertaste zeigt eine Schnellvorschau; Leertaste
 * oder Esc schließen sie wieder, der Fokus kehrt zur Karte zurück.
 */

const KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** Schnellvorschau eines Titels als kleiner Dialog. */
function openPreview(movie, href) {
  const imdb = imdbScore(movie);
  const own = has("rating") ? ownScore(movie) : null; // Website ohne Bewertungen: keine eigene
  const facts = joinParts([movie.year, runtimeLabel(runtimeOf(movie)), movie.medium]);
  const genres = genresOf(movie).slice(0, 4).join(" · ");
  const cover = movie.cover
    ? `<img class="quick-preview-cover" src="${escapeHtml(movie.cover)}" alt="">`
    : `<span class="quick-preview-cover is-empty" aria-hidden="true"></span>`;
  openModal(movie.title, `
    <div class="quick-preview">
      ${cover}
      <div class="quick-preview-body">
        ${facts ? `<p class="meta">${escapeHtml(facts)}</p>` : ""}
        ${genres ? `<p class="quick-preview-genres">${escapeHtml(genres)}</p>` : ""}
        <p class="quick-preview-scores">
          ${imdb ? `<span><b>${escapeHtml(imdb.score)}</b> IMDb</span>` : ""}
          ${own ? `<span><b>${own}</b> eigene</span>` : ""}
          ${movie.seen ? `<span class="seen">Gesehen</span>` : ""}
        </p>
        <div class="form-actions">
          <a class="button" href="${escapeHtml(href)}" id="quick-preview-open">Öffnen</a>
        </div>
        <p class="meta quick-preview-hint"><kbd>Leertaste</kbd> oder <kbd>Esc</kbd> schließt</p>
      </div>
    </div>`, { small: true });
  document.getElementById("quick-preview-open")?.focus();
  // Leertaste schließt wieder (wie sie geöffnet hat)
  document.querySelector(".quick-preview")?.closest(".modal")?.addEventListener("keydown", event => {
    if (event.key !== " " || event.repeat) return;
    event.preventDefault();
    closeModal();
  });
}

/**
 * Schaltet die Tastatur für ein Raster ein. Einmal pro Seite.
 * @param {HTMLElement} grid
 * @param {(id: string) => object|undefined} findMovie
 */
export function initGridKeys(grid, findMovie) {
  if (!grid) return;
  grid.addEventListener("keydown", event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const card = event.target.closest?.(".movie-card");
    if (!card || event.target !== card) return;

    if (event.key === " ") {
      event.preventDefault(); // sonst scrollt die Seite
      if (event.repeat) return;
      const movie = findMovie(card.dataset.movieId);
      if (movie) openPreview(movie, card.getAttribute("href"));
      return;
    }
    if (!KEYS.has(event.key)) return;
    const cards = [...grid.querySelectorAll(".movie-card")];
    const boxes = cards.map(item => ({ top: item.offsetTop, left: item.offsetLeft, width: item.offsetWidth }));
    const page = Math.max(1, Math.round(window.innerHeight / Math.max(1, card.offsetHeight)) - 1);
    const next = gridStep(boxes, cards.indexOf(card), event.key, { page });
    event.preventDefault(); // auch am Rand: Seite soll nicht stattdessen scrollen
    if (next === cards.indexOf(card)) return;
    cards[next].focus({ preventScroll: true });
    cards[next].scrollIntoView({ block: "nearest", behavior: event.repeat ? "auto" : "smooth" });
  });
}
