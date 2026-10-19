import "../cover-store.js"; // Ersatz aus dem lokalen Cover-Speicher, wenn ein Cover nicht lädt
import { loadState, saveDashboardData } from "../storage.js";
import { normalizeMovies, upsertMovie } from "../collection.js";
import { fetchOmdbCover } from "../cover.js";
import { openMovieForm } from "../ui/movie-form.js";
import { initAppShell } from "../ui/app-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { $, $$, escapeHtml, safeUrl, markReady } from "../utils/dom.js";
import { sortMovies, searchMovies, filterMovies, streamingSearchUrl, DEFAULT_SORT, titleKind, genresOf } from "../logic/movies-logic.js";
import { readCastData, splitNames } from "../logic/cast-logic.js";
import { releaseLabel, imdbScore, ownScore, countriesDe, languagesDe, joinParts } from "../logic/detail-logic.js";
import { runtimeOf, runtimeLabel } from "../logic/tonight-logic.js";
import { formatDay } from "../utils/format.js";
import { faviconUrl } from "../bookmarks.js";
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

const field = (label, value, { wide = false, html = false } = {}) =>
  value ? `<div class="detail-field${wide ? " is-wide" : ""}"><dt>${label}</dt><dd>${html ? value : escapeHtml(value)}</dd></div>` : "";

/** Unter Entertainment bzw. auf der Website: Sammlung mit einem Filter (Genre, Person). */
const collectionLink = (key, value) => `${own("movies.html", "index.html")}?${key}=${encodeURIComponent(value)}`;

/** Namen als Links zu „ihren" Titeln unter Entertainment. */
const peopleHtml = names => names.map(name =>
  `<a class="detail-person" href="${escapeHtml(collectionLink("person", name))}" title="${escapeHtml(`Alle Titel mit ${name}`)}">${escapeHtml(name)}</a>`).join(", ");

/** Seiten-Icon: im Dashboard aus Chromes Favicon-Speicher (wie bei den Lesezeichen), auf der Website von der Seite selbst. */
const iconOf = url => (SITE ? new URL("/favicon.ico", url).href : faviconUrl(url));

/** Knopf zu einer anderen Seite (IMDb, WerStreamt.es) mit deren Icon. */
const siteButton = (url, label) => url
  ? `<a class="small-button detail-link" href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noreferrer">
      <img class="detail-favicon" src="${escapeHtml(iconOf(url))}" alt="" width="16" height="16" decoding="async">${label}</a>`
  : "";

/**
 * „Meine Bewertung" als Leuchtreklame: die Zahl leuchtet, darunter zehn
 * Birnen - so viele brennen, wie Punkte vergeben sind (beim Öffnen
 * nacheinander, css/detail.css). Noch nicht bewertet: „?" und alle aus.
 */
function ratingHtml() {
  const score = ownScore(movie);
  const label = own("Deine Bewertung", "Meine Bewertung");
  const bulbs = Array.from({ length: 10 }, (_, i) =>
    `<i class="rating-bulb${score && i < score ? " is-on" : ""}" style="--i:${i}"></i>`).join("");
  return `
    <div class="rating-marquee${score ? "" : " is-empty"}" role="img" aria-label="${escapeHtml(`${label}: ${score ? `${score} von 10` : "noch nicht bewertet"}`)}">
      <span class="rating-number" aria-hidden="true"><b>${score ?? "?"}</b><small>/10</small></span>
      <span class="rating-side" aria-hidden="true"><span class="rating-kicker">${label}</span><span class="rating-bulbs">${bulbs}</span></span>
    </div>`;
}

/** Zeichnet alle Angaben des aktuellen Eintrags und verdrahtet die Knöpfe. */
function render() {
  document.title = `${movie.title} · ${own("Dashboard", SITE_TITLE)}`;
  $("#movie-title").textContent = movie.title;

  renderCover();
  const actions = $("#detail-cover-actions");
  if (actions) actions.innerHTML = SITE ? "" : `
    <button class="small-button" id="change-cover">Cover ändern</button>
    ${movie.imdbId ? `<button class="small-button" id="refetch-cover">Cover neu laden</button>` : ""}`;

  // Oben: Kinoticket und Medium; darunter hervorgehoben die Bewertung und alle Knöpfe auf einer Höhe
  const summary = [
    has("seen") ? seenTicketHtml(movie) : "",
    has("medium") && movie.medium ? `<span class="detail-medium">${escapeHtml(movie.medium)}</span>` : "",
  ].join("");
  const links = [siteButton(movie.imdbUrl, "IMDb"), siteButton(streamingSearchUrl(movie), "WerStreamt.es")].join("");
  const edit = SITE ? "" : `
    <button class="small-button" id="edit-movie">Bearbeiten</button>
    <button class="small-button danger" id="delete-movie">Löschen</button>`;

  // Angaben (Besetzung und OMDb-Angaben aus castData, js/logic/cast-logic.js)
  const entry = readCastData(state.castData)[String(movie.imdbId || "").trim()] || null;
  const directors = splitNames(movie.directors);
  const runtime = runtimeOf(movie);
  const imdb = imdbScore(movie);
  const genres = genresOf(movie);
  const extraScores = entry ? joinParts([entry.rt && `Rotten Tomatoes ${entry.rt.replace("%", " %")}`, entry.mc && `Metascore ${entry.mc}`]) : "";
  const place = entry ? joinParts([countriesDe(entry.c).join(", "), languagesDe(entry.l).join(", ")]) : "";
  const facts = [
    field("Originaltitel", movie.originalTitle),
    field("Erschienen", releaseLabel(movie)),
    field("Laufzeit", runtime ? `${runtimeLabel(runtime)}${titleKind(movie) === "series" ? " je Folge" : ""}` : ""),
    field("Art", movie.titleType),
    field("IMDb-Wertung", imdb ? `<b>${imdb.score}</b>${imdb.votes ? ` · ${escapeHtml(imdb.votes)}` : ""}` : "", { html: true }),
    field("Weitere Wertungen", extraScores),
    field("Staffeln", entry?.s || ""),
    field("Genre", genres.length ? `<span class="detail-chips">${genres.map(name =>
      `<a class="detail-chip" href="${escapeHtml(collectionLink("genre", name))}" title="${escapeHtml(`Alle Titel im Genre ${name}`)}">${escapeHtml(name)}</a>`).join("")}</span>` : "", { wide: true, html: true }),
    field("Regie", peopleHtml(directors.length ? directors : entry?.d || []), { html: true }),
    field("Drehbuch", peopleHtml(entry?.w || []), { html: true }),
    field("Darsteller", peopleHtml(entry?.a || []), { wide: true, html: true }),
    field("Altersfreigabe", entry?.r ? `${entry.r} (USA)` : ""),
    field("Land · Sprache", place),
    has("lists") ? field("IMDb-Listen", movie.imdbLists.join(", "), { wide: true }) : "",
  ].join("");
  // Selten gebraucht: eingeklappt
  const more = [
    field("In IMDb aufgenommen", formatDay(movie.imdbCreated) || movie.imdbCreated),
    field("In IMDb geändert", formatDay(movie.imdbModified) || movie.imdbModified),
    field("Beschreibung", movie.imdbDescription),
    has("notes") ? field("Notizen", movie.notes) : "",
  ].join("");

  $("#movie-details").innerHTML = `
        ${summary ? `<div class="detail-summary">${summary}</div>` : ""}
        <div class="detail-bar">
          ${has("rating") ? ratingHtml() : ""}
          <div class="detail-buttons">${links}${links && edit ? `<span class="detail-sep" aria-hidden="true"></span>` : ""}${edit}</div>
        </div>
        <dl class="details-grid">${facts}</dl>
        ${more ? `<details class="detail-more"><summary>Mehr Details</summary><dl class="details-grid">${more}</dl></details>` : ""}`;
  for (const img of $$(".detail-favicon")) img.addEventListener("error", () => img.remove(), { once: true });

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
    <div class="section-head"><h2 id="similar-title">Ähnlich in ${own("deiner", "der")} Kinothek</h2>
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
      <a class="small-button" href="${own("movies.html", "index.html")}">${own("Zurück zu Entertainment", "Zur Kinothek")}</a>
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
    showMissing(`Die Kinothek konnte nicht geladen werden. ${error.message || ""}`.trim());
    startSiteDetail({ access: null }, () => {});
    return;
  }
  const id = new URLSearchParams(location.search).get("id");
  movie = state.movies.find(item => item.id === id);
  // Erst nach dem Einlass zeigen (auch nicht im Fenstertitel) und blättern lassen
  startSiteDetail(state, () => {
    initShortcuts({ previousMovie: () => goToNeighbour(-1), nextMovie: () => goToNeighbour(1) });
    if (!movie) { showMissing("Diesen Titel gibt es in der Kinothek nicht (mehr)."); return; }
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
