import { escapeHtml } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { MEDIA_BADGES } from "../utils/media.js";

/*
 * Lade-Skelett für Cover: Solange ein Coverbild lädt, schimmert an seiner
 * Stelle eine Fläche (.is-loading). Inline-Handler wie onload="" verbietet die
 * Sicherheitsrichtlinie von Chrome-Extensions, daher ein einziger Listener in
 * der Capture-Phase (load/error-Ereignisse von Bildern steigen nicht auf).
 */
function settleCover(event) {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("cover-image")) return;
  const cover = img.closest(".movie-card-cover");
  if (!cover) return;
  cover.classList.remove("is-loading");
  if (event.type === "error") {
    // Kaputter Link: Bild entfernen und das normale Platzhalter-Symbol zeigen
    img.remove();
    cover.insertAdjacentHTML("afterbegin", `<span class="cover-placeholder">${icon("image")}</span>`);
  }
}
document.addEventListener("load", settleCover, true);
document.addEventListener("error", settleCover, true);

/**
 * Karte eines Films: Cover als Hauptfläche, Medium-Kürzel oben rechts,
 * Titel und Eckdaten darunter. Die ganze Karte führt zur Detailseite;
 * Bearbeiten und Löschen gibt es bewusst nur dort.
 * @param {object} movie
 * @param {string} detailHref - Ziel der Detailseite, je nach Aufrufort.
 * @param {object} [options]
 * @param {boolean} [options.coverPending=false] - Ein Cover-Abruf läuft gerade:
 *   Filme mit IMDb-Verknüpfung, aber noch ohne Cover, zeigen dann das
 *   Lade-Skelett statt des Platzhalter-Symbols.
 * @returns {string} HTML-String.
 */
export function movieCardHtml(movie, detailHref, { coverPending = false } = {}) {
  // Ohne Medium (nur auf IMDb-Listen, nicht im Regal) gibt es kein Abzeichen
  const badge = movie.medium ? (MEDIA_BADGES[movie.medium] || MEDIA_BADGES["Sonstiges"]) : null;
  const badgeHtml = badge
    ? `<span class="media-badge tone-${badge.tone}" title="${escapeHtml(movie.medium)}">${badge.icon ? icon(badge.icon) : `<span>${escapeHtml(badge.label)}</span>`}</span>`
    : "";
  const waiting = !movie.cover && coverPending && Boolean(movie.imdbId);
  const coverClass = movie.cover || waiting ? "movie-card-cover is-loading" : "movie-card-cover";
  const cover = movie.cover
    ? `<img class="cover-image" src="${escapeHtml(movie.cover)}" alt="" loading="lazy">`
    : waiting ? "" : `<span class="cover-placeholder">${icon("image")}</span>`;

  const facts = [
    movie.year ? `<span>${escapeHtml(movie.year)}</span>` : "",
    movie.seen ? `<span class="seen">Gesehen</span>` : "",
  ].filter(Boolean).join("");

  return `
    <a class="movie-card" href="${detailHref}" data-movie-id="${escapeHtml(movie.id)}">
      <div class="${coverClass}">
        ${cover}
        ${badgeHtml}
      </div>
      <div class="movie-card-body">
        <p class="movie-card-title">${escapeHtml(movie.title)}</p>
        ${facts ? `<p class="movie-card-facts">${facts}</p>` : ""}
      </div>
    </a>`;
}

/**
 * Rendert eine Titelliste als Raster.
 * @param {Array} movies
 * @param {string} detailBasePath
 * @param {string} emptyHtml - Markup für den Leerzustand.
 * @param {object} [cardOptions] - Wird an movieCardHtml weitergereicht.
 */
export function movieGridHtml(movies, detailBasePath, emptyHtml, cardOptions = {}) {
  return movies.length
    ? movies.map(movie => movieCardHtml(movie, `${detailBasePath}?id=${encodeURIComponent(movie.id)}`, cardOptions)).join("")
    : emptyHtml;
}

/**
 * Nach dem Neuaufbau eines Rasters: Cover, die schon im Browser-Cache liegen,
 * sind sofort fertig - ihnen das Skelett direkt abnehmen, damit sie bei
 * wiederholtem Rendern (Suche, Fortschritt beim Cover-Abruf) nicht flackern.
 * @param {ParentNode} root - Container des Rasters.
 */
export function settleCachedCovers(root) {
  root.querySelectorAll(".movie-card-cover.is-loading .cover-image").forEach(img => {
    if (img.complete && img.naturalWidth > 0) img.closest(".movie-card-cover").classList.remove("is-loading");
  });
}
