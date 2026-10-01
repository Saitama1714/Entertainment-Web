import { loadCollection } from "../data-source.js";
import { searchMovies, filterMovies, sortMovies, emptyFilters } from "../logic/movies-logic.js";
import { settleCachedCovers } from "../ui/movie-card.js";
import { initSiteShell } from "../ui/site-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { $, escapeHtml, safeUrl } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { showToast } from "../utils/toast.js";
import { SITE_TITLE } from "../utils/constants.js";

/*
 * Detailseite eines Titels (titel.html?id=…): alle veröffentlichten Angaben,
 * nur lesen. Blättern (Knöpfe oder Pfeiltasten) folgt der Reihenfolge, die
 * man zuletzt in der Sammlung gesehen hat - also mit Suche, Filtern und
 * Sortierung von dort.
 */

let collection;
let movie;

const field = (label, value) =>
  value ? `<div class="detail-field"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

/** Reihenfolge wie zuletzt in der Sammlung angezeigt; passt sie nicht (mehr), alle Titel. */
function displayOrder() {
  let view = null;
  try { view = JSON.parse(sessionStorage.getItem("site:view") || "null"); } catch { /* egal */ }
  const all = collection.movies;
  if (view) {
    const filters = { ...emptyFilters() };
    for (const key of Object.keys(filters)) if (Array.isArray(view.filters?.[key])) filters[key] = view.filters[key].map(String);
    const order = sortMovies(filterMovies(searchMovies(all, String(view.query || "")), filters), view.sortKey);
    if (order.some(item => item.id === movie.id)) return order;
    return sortMovies(all, view.sortKey);
  }
  return sortMovies(all, "recent");
}

function render() {
  const has = key => collection.include.has(key);
  document.title = `${movie.title} · ${SITE_TITLE}`;
  $("#movie-title").textContent = movie.title;

  const cover = movie.cover
    ? `<img class="cover-image" src="${escapeHtml(movie.cover)}" alt="">`
    : `<span class="cover-placeholder">${icon("image")}</span>`;
  const imdbLink = movie.imdbUrl
    ? `<div class="detail-field"><dt>IMDb</dt><dd><a class="external-link" href="${escapeHtml(safeUrl(movie.imdbUrl))}" target="_blank" rel="noreferrer">Seite öffnen</a></dd></div>`
    : "";
  const summary = [
    has("seen") ? `<span class="status ${movie.seen ? "seen" : ""}">${movie.seen ? "Gesehen" : "Noch offen"}</span>` : "",
    has("medium") && movie.medium ? `<span class="meta">${escapeHtml(movie.medium)}</span>` : "",
  ].join("");

  $("#movie-details").innerHTML = `
    <div class="detail-layout">
      <div class="detail-cover">
        <div class="movie-card-cover${movie.cover ? " is-loading" : ""}">${cover}</div>
      </div>
      <div class="detail-main">
        ${summary ? `<div class="detail-summary">${summary}</div>` : ""}
        <dl class="details-grid">
          ${field("Originaltitel", movie.originalTitle)}
          ${field("Jahr", movie.year)}
          ${field("Genre", movie.genre)}
          ${field("Laufzeit", movie.runtimeMinutes ? `${movie.runtimeMinutes} Minuten` : "")}
          ${field("Regie", movie.directors)}
          ${field("Veröffentlichung", movie.releaseDate)}
          ${field("Art", movie.titleType)}
          ${field("IMDb-Bewertung", movie.imdbRating)}
          ${field("IMDb-Stimmen", movie.numVotes)}
          ${has("rating") ? field("Meine Bewertung", movie.yourRating) : ""}
          ${has("rating") ? field("Bewertet am", movie.dateRated) : ""}
          ${has("seen") ? field("Gesehen am", movie.seenAt) : ""}
          ${has("lists") ? field("IMDb-Listen", movie.imdbLists.join(", ")) : ""}
          ${has("notes") ? field("Notizen", movie.notes) : ""}
          ${field("Beschreibung", movie.imdbDescription)}
          ${imdbLink}
        </dl>
      </div>
    </div>`;
  settleCachedCovers($("#movie-details"));
  renderPager();
}

/** Knöpfe „Vorheriger/Nächster Titel" - am Anfang bzw. Ende deaktiviert. */
function renderPager() {
  const order = displayOrder();
  const index = order.findIndex(item => item.id === movie.id);
  const link = (el, target) => {
    if (target) {
      el.href = `titel.html?id=${encodeURIComponent(target.id)}`;
      el.removeAttribute("aria-disabled");
      el.title = target.title;
    } else {
      el.removeAttribute("href");
      el.setAttribute("aria-disabled", "true");
      el.removeAttribute("title");
    }
  };
  link($("#prev-title"), order[index - 1]);
  link($("#next-title"), order[index + 1]);
  $("#detail-pager").hidden = order.length < 2;
}

/**
 * Blättert zum Nachbar-Titel. replace(): Blättern füllt den Verlauf nicht -
 * „Zurück" im Browser führt weiter zur Sammlung.
 */
function goToNeighbour(step) {
  if (!movie) return;
  const order = displayOrder();
  const target = order[order.findIndex(item => item.id === movie.id) + step];
  if (!target) {
    showToast(step < 0 ? "Das ist der erste Titel." : "Das ist der letzte Titel.", "info");
    return;
  }
  location.replace(`titel.html?id=${encodeURIComponent(target.id)}`);
}

function showMissing(text) {
  $("#movie-title").textContent = "Titel nicht gefunden";
  $("#movie-details").innerHTML = `
    <div class="empty-state">
      <p>${escapeHtml(text)}</p>
      <a class="small-button" href="index.html">Zur Sammlung</a>
    </div>`;
}

async function init() {
  initSiteShell();

  // „Zur Sammlung": kommt man von dort, zurück im Verlauf (Scroll-Position bleibt)
  $("#back-link").onclick = event => {
    let fromCollection = false;
    try { fromCollection = new URL(document.referrer).origin === location.origin && !/titel\.html/.test(document.referrer); } catch { /* kein Referrer */ }
    if (fromCollection && history.length > 1) { event.preventDefault(); history.back(); }
  };
  for (const [selector, step] of [["#prev-title", -1], ["#next-title", 1]]) {
    $(selector).onclick = event => { event.preventDefault(); if ($(selector).hasAttribute("href")) goToNeighbour(step); };
  }

  try {
    collection = await loadCollection();
  } catch (error) {
    showMissing(`Die Sammlung konnte nicht geladen werden. ${error.message || ""}`.trim());
    return;
  }
  const id = new URLSearchParams(location.search).get("id");
  movie = collection.movies.find(item => item.id === id);
  initShortcuts({ previousMovie: () => goToNeighbour(-1), nextMovie: () => goToNeighbour(1) });
  if (!movie) { showMissing("Diesen Titel gibt es in der Sammlung nicht (mehr)."); return; }
  render();
}

init();
