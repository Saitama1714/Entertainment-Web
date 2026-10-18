import "../cover-store.js"; // Ersatz aus dem lokalen Cover-Speicher, wenn ein Cover nicht lädt
import { loadState, saveDashboardData } from "../storage.js";
import { normalizeMovies, upsertMovie } from "../collection.js";
import { fetchOmdbCover } from "../cover.js";
import { openMovieForm } from "../ui/movie-form.js";
import { initAppShell } from "../ui/app-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { $, escapeHtml, safeUrl, markReady } from "../utils/dom.js";
import { sortMovies, searchMovies, filterMovies, streamingSearchUrl, DEFAULT_SORT } from "../logic/movies-logic.js";
import { icon } from "../utils/icons.js";
import { showToast } from "../utils/toast.js";
import { rememberDeletedMovie } from "../ui/deleted-movie.js";
import { settleCachedCovers, movieGridHtml } from "../ui/movie-card.js";
import { similarMovies } from "../logic/similar-logic.js";
import { seenTicketHtml } from "../ui/seen-ticket.js";
import { SITE, own, has } from "../utils/host.js";
import { readEntertainmentView } from "../logic/view-logic.js";
import { startSitePage, startSiteDetail } from "../site/site-page.js";
import { SITE_DEFAULT_SORT } from "../site/site-logic.js";
import { siteView } from "../site/site-data.js";
import { SITE_TITLE } from "../site/site-constants.js";

/*
 * Detailseite eines Eintrags (views/movie.html?id=…): alle Angaben,
 * Bearbeiten, Löschen, Cover ändern/neu laden, Blättern per Pfeiltasten.
 *
 * Website (movie.html, SITE aus js/utils/host.js): nur lesen - ohne
 * Bearbeiten, Löschen und Cover-Knöpfe, nur veröffentlichte Angaben, „Meine
 * Bewertung"; Blättern (auch per Knopf) in der Reihenfolge, die man zuletzt
 * in der Sammlung gesehen hat.
 */

let state;
let movie;

/**
 * Reihenfolge, in der Entertainment die Einträge standardmäßig zeigt. Website:
 * wie zuletzt in der Sammlung angezeigt (Suche, Filter, Sortierung dieses
 * Besuchs); passt sie nicht (mehr), alle Titel.
 */
function displayOrder() {
  if (!SITE) return sortMovies(state.movies, DEFAULT_SORT, "desc");
  const browse = readEntertainmentView(siteView()).browse;
  if (!browse) return sortMovies(state.movies, SITE_DEFAULT_SORT, "desc");
  const sortKey = browse.sortKey || SITE_DEFAULT_SORT;
  const order = sortMovies(filterMovies(searchMovies(state.movies, browse.query, state.castData), browse.filters), sortKey, browse.sortDirection);
  return order.some(item => item.id === movie.id) ? order : sortMovies(state.movies, sortKey, browse.sortDirection);
}

const field = (label, value) =>
  value ? `<div class="detail-field"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : "";

/** Zeichnet alle Angaben des aktuellen Eintrags und verdrahtet die Knöpfe. */
function render() {
  document.title = `${movie.title} · ${own("Dashboard", SITE_TITLE)}`;
  $("#movie-title").textContent = movie.title;


  const imdbLink = movie.imdbUrl
    ? `<div class="detail-field"><dt>IMDb</dt><dd><a class="external-link" href="${escapeHtml(safeUrl(movie.imdbUrl))}" target="_blank" rel="noreferrer">Seite öffnen</a></dd></div>`
    : "";
  // Wo der Titel im Stream läuft (Link aus der IMDb-Kennung, siehe movies-logic.js)
  const streaming = streamingSearchUrl(movie);
  const streamingLink = streaming
    ? `<div class="detail-field"><dt>Streaming</dt><dd><a class="external-link" href="${escapeHtml(streaming)}" target="_blank" rel="noreferrer">Bei WerStreamt.es ansehen</a></dd></div>`
    : "";

  renderCover();
  const actions = $("#detail-cover-actions");
  if (actions) actions.innerHTML = SITE ? "" : `
    <button class="small-button" id="change-cover">Cover ändern</button>
    ${movie.imdbId ? `<button class="small-button" id="refetch-cover">Cover neu laden</button>` : ""}`;
  const summary = [
    has("seen") ? seenTicketHtml(movie) : "",
    has("medium") && movie.medium ? `<span class="meta">${escapeHtml(movie.medium)}</span>` : "",
    SITE ? "" : `<div class="detail-actions">
            <button class="small-button" id="edit-movie">Bearbeiten</button>
            <button class="small-button danger" id="delete-movie">Löschen</button>
          </div>`,
  ].join("");

  $("#movie-details").innerHTML = `
        ${summary ? `<div class="detail-summary">${summary}</div>` : ""}
        <dl class="details-grid">
          ${has("lists") ? field("IMDb-Listen", movie.imdbLists.join(", ")) : ""}
          ${field("Originaltitel", movie.originalTitle)}
          ${field("Jahr", movie.year)}
          ${field("Genre", movie.genre)}
          ${field("Laufzeit", movie.runtimeMinutes ? `${movie.runtimeMinutes} Minuten` : "")}
          ${field("Regie", movie.directors)}
          ${field("Veröffentlichung", movie.releaseDate)}
          ${has("rating") ? field(own("Deine Bewertung", "Meine Bewertung"), movie.yourRating) : ""}
          ${field("IMDb-Bewertung", movie.imdbRating)}
          ${field("IMDb-Stimmen", movie.numVotes)}
          ${field("IMDb-Kennung", movie.imdbId)}
          ${field("Art", movie.titleType)}
          ${field("In IMDb aufgenommen", movie.imdbCreated)}
          ${field("In IMDb geändert", movie.imdbModified)}
          ${has("rating") ? field("Bewertet am", movie.dateRated) : ""}
          ${field("Position in der Liste", movie.position)}
          ${has("notes") ? field("Notizen", movie.notes) : ""}
          ${field("Beschreibung", movie.imdbDescription)}
          ${imdbLink}
          ${streamingLink}
        </dl>`;

  renderSimilar();
  if (SITE) renderPager(); else bindActions();
}

/** Website: Knöpfe „Vorheriger/Nächster Titel" - am Anfang bzw. Ende deaktiviert. */
function renderPager() {
  const pager = $("#detail-pager");
  if (!pager) return;
  const order = displayOrder();
  const index = order.findIndex(item => item.id === movie.id);
  const link = (el, target) => {
    if (target) {
      el.href = `movie.html?id=${encodeURIComponent(target.id)}`;
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
  pager.hidden = order.length < 2;
}

/** „Ähnlich in deiner Sammlung": Titel mit möglichst derselben Genre-Kombination. */
function renderSimilar() {
  const section = $("#detail-similar");
  const similar = similarMovies(movie, state.movies);
  section.hidden = similar.length === 0;
  if (!similar.length) { section.innerHTML = ""; return; }
  const shared = similar[0].shared;
  section.innerHTML = `
    <div class="section-head"><h2 id="similar-title">Ähnlich in ${own("deiner", "der")} Sammlung</h2>
      <p class="meta">Gleiche Genres wie ${escapeHtml(shared.join(", "))}${similar.some(entry => entry.shared.length < shared.length) ? " – oder die meisten davon" : ""}, ${has("rating") ? own("deine", "meine") : "die"} besten zuerst</p></div>
    <div class="movie-grid similar-row">${movieGridHtml(similar.map(entry => entry.movie), "movie.html", "")}</div>`;
  settleCachedCovers(section);
}

/**
 * Cover im festen Rahmen (views/movie.html). Liegt dort schon dasselbe Bild -
 * etwa vom Cover-Flug (js/cover-flight.js) -, bleibt es stehen.
 */
function renderCover() {
  const frame = $("#detail-cover");
  const current = frame.querySelector("img.cover-image");
  if (movie.cover && current?.getAttribute("src") === movie.cover) return;
  frame.classList.toggle("is-loading", Boolean(movie.cover));
  frame.innerHTML = movie.cover
    ? `<img class="cover-image" src="${escapeHtml(movie.cover)}" alt="">`
    : `<span class="cover-placeholder">${icon("image")}</span>`;
  settleCachedCovers(frame.parentElement);
}

/** Knöpfe der Detailseite: Bearbeiten, Löschen, Cover ändern, Cover neu laden. */
function bindActions() {
  $("#edit-movie").onclick = () => {
    openMovieForm(state, movie, () => {
      movie = state.movies.find(item => item.id === movie.id);
      render();
    });
  };

  $("#delete-movie").onclick = async () => {
    // Steht der Titel noch in einer IMDb-Liste, bringt ihn der nächste Import zurück
    const question = movie.imdbLists.length
      ? `„${movie.title}“ entfernen?\n\nDer Titel steht noch in: ${movie.imdbLists.join(", ")}. Beim nächsten Import kommt er zurück, solange er dort bei IMDb steht.`
      : `„${movie.title}“ entfernen?`;
    if (!confirm(question)) return;
    // Position so, wie Entertainment beim Zurückkehren sortiert (Standard:
    // "Zuletzt hinzugekommen") - dort setzt die Lösch-Animation die Karte ein
    const index = displayOrder().findIndex(item => item.id === movie.id);
    state.movies = state.movies.filter(item => item.id !== movie.id);
    await saveDashboardData({ movies: state.movies });
    // Meldung und Ausblende-Animation übernimmt Entertainment. replace():
    // "Zurück" soll nicht auf die Seite des gelöschten Films führen.
    rememberDeletedMovie(movie, index);
    location.replace("movies.html");
  };

  $("#change-cover").onclick = async () => {
    const url = prompt("Adresse des Covers eingeben (leer lassen, um es zu entfernen):", movie.cover || "");
    if (url === null) return;
    movie = { ...movie, cover: url.trim() };
    state.movies = upsertMovie(state.movies, movie);
    await saveDashboardData({ movies: state.movies });
    showToast("Cover aktualisiert.", "success");
    render();
  };

  const refetch = $("#refetch-cover");
  if (!refetch) return;
  refetch.onclick = async () => {
    if (!state.omdbApiKey) {
      showToast("Dafür fehlt der OMDb-Schlüssel. Du hinterlegst ihn unter Einstellungen.", "warning");
      return;
    }
    refetch.disabled = true;
    refetch.textContent = "Wird geladen …";
    try {
      const poster = await fetchOmdbCover(movie.imdbId, state.omdbApiKey);
      if (!poster) {
        showToast("Zu diesem Titel liegt bei OMDb kein Cover vor.", "warning");
        return;
      }
      movie = { ...movie, cover: poster };
      state.movies = upsertMovie(state.movies, movie);
      await saveDashboardData({ movies: state.movies });
      showToast("Cover aktualisiert.", "success");
      render();
    } catch (error) {
      showToast(error.message || "Das Cover konnte nicht geladen werden.", "error");
    } finally {
      if (refetch.isConnected) { refetch.disabled = false; refetch.textContent = "Cover neu laden"; }
    }
  };
}

/**
 * Blättert zum Nachbar-Eintrag in der Reihenfolge, die Entertainment zeigt.
 * replace(): Blättern soll den Verlauf nicht füllen - "Zurück" führt weiter
 * dorthin, woher man ursprünglich kam.
 * @param {number} step - -1 = vorheriger, +1 = nächster Film.
 */
function goToNeighbour(step) {
  if (!movie) return;
  const order = displayOrder();
  const index = order.findIndex(item => item.id === movie.id);
  const target = order[index + step];
  if (!target) {
    showToast(step < 0 ? "Das ist der erste Titel." : "Das ist der letzte Titel.", "info");
    return;
  }
  location.replace(`movie.html?id=${encodeURIComponent(target.id)}`);
}

/** Hinweis, wenn die ID in der Adresse zu keinem Eintrag (mehr) passt. */
function showMissing(text = "Dieser Eintrag ist nicht mehr vorhanden.") {
  $("#movie-title").textContent = own("Eintrag nicht gefunden", "Titel nicht gefunden");
  $("#detail-layout").classList.add("is-missing");
  $("#movie-details").innerHTML = `
    <div class="empty-state">
      <span aria-hidden="true">·</span>
      <p>${escapeHtml(text)}</p>
      <a class="small-button" href="${own("movies.html", "index.html")}">${own("Zurück zu Entertainment", "Zur Sammlung")}</a>
    </div>`;
}

/** Website: Daten laden, Einlass, dann zeigen (nur lesen). */
async function initSite() {
  startSitePage({ title: `Titel · ${SITE_TITLE}` });
  for (const [selector, step] of [["#prev-title", -1], ["#next-title", 1]]) {
    const el = $(selector);
    if (el) el.onclick = event => { event.preventDefault(); if (el.hasAttribute("href")) goToNeighbour(step); };
  }
  try {
    state = await loadState();
  } catch (error) {
    showMissing(`Die Sammlung konnte nicht geladen werden. ${error.message || ""}`.trim());
    startSiteDetail({ access: null }, () => {});
    return;
  }
  const id = new URLSearchParams(location.search).get("id");
  movie = state.movies.find(item => item.id === id);
  // Erst nach dem Einlass zeigen (auch nicht im Fenstertitel) und blättern lassen
  startSiteDetail(state, () => {
    initShortcuts({ previousMovie: () => goToNeighbour(-1), nextMovie: () => goToNeighbour(1) });
    if (!movie) { showMissing("Diesen Titel gibt es in der Sammlung nicht (mehr)."); return; }
    render();
  });
}

/** Lädt den Zustand, sucht den Eintrag zur ID in der Adresse und zeigt ihn. */
async function init() {
  if (SITE) { await initSite(); return; }
  state = await loadState();

  const id = new URLSearchParams(location.search).get("id");
  movie = state.movies.find(item => item.id === id);

  initAppShell(state, {
    onImported: () => {
      state.movies = normalizeMovies(state.movies);
      movie = state.movies.find(item => item.id === id);
      if (movie) render(); else showMissing();
    },
  });

  initShortcuts({ previousMovie: () => goToNeighbour(-1), nextMovie: () => goToNeighbour(1) });

  if (!movie) { showMissing(); return; }
  render();
}

init().finally(markReady); // <html data-ready> für die Browser-Tests
