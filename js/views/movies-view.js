import { storeMissingCovers } from "../cover-store.js"; // auch: Ersatz, wenn ein Cover nicht lädt
import { loadState, saveDashboardData } from "../storage.js";
import { normalizeMovies } from "../collection.js";
import {
  searchMovies, filterMovies, sortMovies, toggleFilterValue,
  emptyFilters, hasActiveFilters, SORT_OPTIONS, DEFAULT_SORT, setImportWindowDays, resolveSort,
} from "../logic/movies-logic.js";
import { fetchMissingCovers } from "../cover.js";
import { movieGridHtml, movieCardHtml, settleCachedCovers } from "../ui/movie-card.js";
import { captureGrid, animateGrid } from "../ui/grid-motion.js";
import { filterChipsHtml, initFilterBar } from "../ui/movie-filters.js";
import { initSortControl } from "../ui/sort-control.js";
import { renderStats } from "../ui/stats.js";
import { initAppShell } from "../ui/app-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { $, $$, escapeHtml, debounce, emptyState, markReady, reducedMotion } from "../utils/dom.js";
import { showToast } from "../utils/toast.js";
import { takeDeletedMovie, playRemoval } from "../ui/deleted-movie.js";
import { CONFIG } from "../utils/constants.js";
import { openImdbImport } from "../ui/imdb-import.js";
import { openSeenCleanup } from "../ui/seen-cleanup.js";
import { openOrphanCleanup } from "../ui/orphan-cleanup.js";
import { renderImportReminder } from "../ui/import-reminder.js";
import { initCurtain } from "../ui/curtain.js";
import { initTimeline } from "../ui/timeline.js";
import { initUniverse } from "../ui/universe.js";
import { initFilmYear } from "../ui/film-year.js";
import { initDuel } from "../ui/duel.js";
import { runCastFetch, readCastFetch, enableCastFetch, castFetchActive } from "../cast-fetch.js";
import { readCastData, castStatus, creditsOf, personKey } from "../logic/cast-logic.js";
import { readEntertainmentView } from "../logic/view-logic.js";
import { SITE, has } from "../utils/host.js";
import { startSitePage, startSiteCollection, siteLoadFailed } from "../site/site-page.js";
import { siteSortOptions, SITE_DEFAULT_SORT } from "../site/site-logic.js";

/*
 * Seite „Entertainment" (views/movies.html): sechs Registerkarten - "Titel"
 * (Raster mit Suche, Filter-Chips, Sortierung, IMDb-Import, Cover-Nachladen),
 * "Zeitleiste" (Cover Flow + Zeitleiste, js/ui/timeline.js), "Filmuniversum"
 * (Genres und Besetzung in einem All, js/ui/universe.js) - beide mit derselben
 * Suche und denselben Filtern, ohne Sortierung -, "Heute" (Zahlen und
 * Roulette, js/ui/stats.js), "Filmjahr" (Jahresrückblick in Karten,
 * js/ui/film-year.js; ohne Suche und Filter) und "Du gegen IMDb" (eigene
 * Note gegen IMDb, js/ui/duel.js; mit Suche und Filtern, ohne Sortierung). Filter und Sortierung gelten nur für
 * die laufende Sitzung. Der Kinovorhang steht hier
 * wie auf der Übersicht an den Rändern, aber immer schon geöffnet.
 *
 * Auf der Website (index.html, gebaut mit npm run build:site; SITE aus
 * js/utils/host.js) läuft dieselbe Seite nur lesend: Daten aus
 * data/sammlung.json, ohne Import, Cover- und Besetzungs-Abruf; dazu Einlass,
 * Filmzitat und Stand (js/site/site-page.js). Suche, Filter und Sortierung
 * bleiben dort für die Dauer des Besuchs erhalten.
 */

let state;
let coverFetchRunning = false; // steuert das Lade-Skelett während "Cover laden"
// Filter und Sortierung gelten bewusst nur für die laufende Sitzung (nicht
// gespeichert) - beim nächsten Öffnen der Seite ist die Sammlung wieder
// ungefiltert zu sehen.
let filters = emptyFilters();
// Standard: deine eigene Bewertung, beste zuerst (Website: IMDb-Bewertung)
let sortOptions = SORT_OPTIONS; // Website: nach dem Laden je nach veröffentlichten Angaben (init)
let { key: sortKey, direction: sortDirection } = resolveSort(SITE ? SITE_DEFAULT_SORT : DEFAULT_SORT);

// Zeitleiste: bekommt dieselbe gesuchte und gefilterte Liste wie das Raster -
// aber erst, wenn ihre Registerkarte offen ist (sonst nur vormerken)
let timeline = null;
let timelineList = [];
let timelineStale = true;
const timelineVisible = () => !$("#timeline-panel").hidden;

function syncTimeline() {
  if (!timeline) return;
  if (timelineVisible()) { timeline.update(timelineList); timelineStale = false; }
  else timelineStale = true;
}

// Filmuniversum: dieselbe gesuchte und gefilterte Liste; die Lage im All
// kommt aus der ganzen Kinothek (alles bleibt an seinem Platz)
let universe = null;
const syncUniverse = (query, filtered) => universe?.update({ all: state.movies, filtered, query, castData: state.castData });

// Filmjahr: immer die ganze Kinothek (ohne Suche und Filter)
let filmYear = null;
const syncFilmYear = () => filmYear?.update(state.movies, state.castData);

// Du gegen IMDb: dieselbe gesuchte und gefilterte Liste wie das Raster
let duel = null;
let thresholdTimer = 0;

// Gemerkte Ansicht (Registerkarte, Ansichten) -
// nur auf diesem Rechner, Suche und Filter bleiben bewusst Sitzungssache
let view = {};
let viewTimer = 0;
function rememberView(patch) {
  view = { ...view, ...patch };
  if (SITE) { saveDashboardData({ entertainmentView: view }); return; } // Website: sessionStorage, sofort (gleich danach kann die Detailseite kommen)
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => saveDashboardData({ entertainmentView: view }), 250);
}

/** Zeigt die Filter-/Sortierzeile (nur wenn es Einträge gibt) und baut die Chips neu. */
function renderToolbar(searched) {
  const row = $("#toolbar-row");
  row.hidden = state.movies.length === 0;
  if (row.hidden) return;
  $("#filter-chips").innerHTML = filterChipsHtml(state.movies, searched, filters); // Website: ohne nicht veröffentlichte Gruppen
}

/**
 * Zeichnet das Raster: Suche → Filter → Sortierung, dazu Zähler und Chips.
 * Wird nach jeder Änderung aufgerufen (billig genug bei einigen hundert Einträgen).
 * @param {{animate?: boolean}} [options] - animate: Suche/Filter/Sortierung
 *   geändert - die Cover gleiten an ihren neuen Platz (js/ui/grid-motion.js).
 */
function renderMovies({ animate = false } = {}) {
  const query = $("#movie-search").value;
  const searched = searchMovies(state.movies, query, state.castData); // mit Darstellern und Drehbuch
  const filtered = filterMovies(searched, filters);
  const sorted = sortMovies(filtered, sortKey, sortDirection);
  timelineList = filtered;
  syncTimeline();
  duel?.update(filtered, { filtered: Boolean(query.trim()) || hasActiveFilters(filters) });
  syncUniverse(query, filtered);

  const empty = state.movies.length === 0
    ? emptyState(SITE ? "Hier sind noch keine Titel veröffentlicht." : "Noch nichts importiert. Deine IMDb-Listen holst du über „Mehr“ → „IMDb-Listen importieren“.")
    : emptyState(query.trim() || !hasActiveFilters(filters)
      ? "Keine Treffer. Andere Suche versuchen?"
      : "Keine Treffer für diese Filter.");
  const grid = $("#movies-grid");
  const before = animate && !grid.closest("[hidden]") ? captureGrid(grid) : null;
  grid.innerHTML = movieGridHtml(sorted, "movie.html", empty, { coverPending: coverFetchRunning });
  settleCachedCovers(grid);
  animateGrid(grid, before);
  renderToolbar(searched);

  const total = state.movies.length;
  const shown = filtered.length;
  $("#collection-count").textContent = total === 0
    ? "Noch nichts importiert."
    : shown === total
      ? `${total} Titel`
      : `${shown} von ${total} Titeln`;
  if (SITE) rememberView({ browse: { query, filters, sortKey, sortDirection } }); // Website: für diesen Besuch
}

// Bleibt während des anschließenden Cover-Ladens vorn in der Statuszeile
// stehen, damit die Import-Zusammenfassung lesbar bleibt.
let statusPrefix = "";

/** Schreibt eine Zeile in die Statuszeile unter der Suche (ggf. mit Import-Zusammenfassung davor). */
function setStatus(text) {
  const element = $("#csv-import-status");
  if (element) element.textContent = statusPrefix ? `${statusPrefix} ${text}` : text;
}

/** Öffnet den Import mehrerer IMDb-Listen; danach Cover für neue Filme laden. */
function startImdbImport() {
  openImdbImport(state, {
    onImported: async (result, summary) => {
      renderMovies();
      renderStats(state);
      syncFilmYear();
      renderImportReminder(state);
      statusPrefix = "";
      setStatus(summary);
      renderCastStatus();
      if (!result.added || !state.omdbApiKey) return;
      statusPrefix = summary.endsWith(".") ? summary : `${summary}.`;
      try { await runCoverFetch(); } finally { statusPrefix = ""; }
      if (state.castFetch.enabled) startCastFetch(); // Besetzung der neuen Titel
    },
  });
}

/**
 * Ein gefundenes Cover in den aktuellen Stand übernehmen (nur, wenn der Titel
 * noch keins hat) und nur die eine Karte im Raster austauschen - nicht das
 * ganze Raster samt Filterleiste (bei hunderten Covern sonst ständig neu).
 */
function applyCover(id, cover) {
  let updated = null;
  state.movies = state.movies.map(movie => {
    if (movie.id !== id || movie.cover) return movie;
    updated = { ...movie, cover };
    return updated;
  });
  const card = updated && $("#movies-grid").querySelector(`.movie-card[data-movie-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.outerHTML = movieCardHtml(updated, card.getAttribute("href"), { coverPending: true });
  settleCachedCovers($("#movies-grid"));
}

/** So viele neue Cover, dann wird zwischengespeichert (Tab zu = nichts verloren). */
const COVER_SAVE_EVERY = 20;

/**
 * „Fehlende Cover laden": holt nacheinander die Poster bei OMDb. Jedes Cover
 * landet im *aktuellen* Stand (was Import, Aufräumen oder ein anderer Tab
 * inzwischen geändert haben, bleibt erhalten) und wird zwischendurch gespeichert.
 */
async function runCoverFetch() {
  if (!state.omdbApiKey) {
    setStatus("Dafür fehlt der OMDb-Schlüssel. Du hinterlegst ihn unter Einstellungen.");
    showToast("OMDb-Schlüssel fehlt.", "warning");
    return;
  }

  if (coverFetchRunning) return; // läuft schon - kein zweiter paralleler Durchgang
  const missing = state.movies.filter(movie => movie.imdbId && !movie.cover).length;
  if (missing === 0) {
    setStatus("Alle Titel mit IMDb-Verknüpfung haben bereits ein Cover.");
    return;
  }

  coverFetchRunning = true;
  renderMovies();
  setStatus(`Cover werden geladen: 0 von ${missing}`);
  let unsaved = 0;
  try {
    const result = await fetchMissingCovers(state.movies, state.omdbApiKey, (done, total, current) => {
      setStatus(`Cover werden geladen: ${done} von ${total}`);
      if (!current?.cover) return;
      applyCover(current.id, current.cover);
      if (++unsaved >= COVER_SAVE_EVERY) {
        unsaved = 0;
        saveDashboardData({ movies: state.movies }).catch(() => {}); // am Ende wird ohnehin gespeichert
      }
    });
    await saveDashboardData({ movies: state.movies });

    const noPoster = missing - result.updated - result.failed;
    const parts = [`${result.updated} Cover geladen`];
    if (!result.fatal && noPoster > 0) parts.push(`${noPoster} ohne Cover bei OMDb`);
    if (result.failed) parts.push(`${result.failed} fehlgeschlagen`);
    const summary = result.fatal ? `${parts.join(", ")}. Abgebrochen: ${result.fatal}` : `${parts.join(", ")}.`;
    setStatus(summary);
    showToast(summary, result.fatal ? "error" : result.failed || noPoster ? "warning" : "success");
  } catch (error) {
    const message = error.message || "Die Cover konnten nicht geladen werden.";
    setStatus(message);
    showToast(message, "error");
  } finally {
    coverFetchRunning = false;
    scheduleCoverStore(); // neue Cover gleich lokal ablegen
    renderMovies();
    if (state.castFetch?.enabled && !castFetchRunning) scheduleCastFetch(); // Cover gingen vor, jetzt die Besetzung
  }
}

/** Schließt das Menü „Mehr". */
function closeToolsMenu() {
  $("#tools-menu").removeAttribute("open");
}

/**
 * Registerkarten „Titel" / „Zeitleiste" / „Filmuniversum" / „Heute" / „Filmjahr" / „Du gegen IMDb": Klick oder
 * Pfeiltasten (ARIA-Tablist-Muster, direkte Aktivierung) wechseln Reiter und
 * zugehöriges Panel. Suche und Filter stehen über den Panels und gelten für
 * „Titel", „Zeitleiste", „Filmuniversum" und „Du gegen IMDb"; bei „Heute" und „Filmjahr" sind sie ausgeblendet.
 */
function initTabs(initial) {
  const tabs = $$(".view-tab");
  const panelOf = tab => $(`#${tab.getAttribute("aria-controls")}`);

  const select = target => {
    for (const tab of tabs) {
      const active = tab === target;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panelOf(tab).hidden = !active;
    }
    const tabName = target.id.replace("tab-", "");
    // Schmale Fenster: Leiste wischbar - gewählten Reiter in den sichtbaren Bereich holen
    const bar = target.parentElement;
    if (bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, target.offsetLeft - (bar.clientWidth - target.offsetWidth) / 2);
    const controls = $("#entertainment-controls");
    controls.hidden = tabName === "stats" || tabName === "year";
    controls.dataset.view = tabName;
    if (tabName === "timeline") {
      if (timelineStale) { timeline.update(timelineList); timelineStale = false; }
      timeline.show();
    }
    if (tabName === "universe") universe.show();
    if (tabName === "year") filmYear.show();
    if (tabName === "duel") duel.show();
    rememberView({ tab: tabName });
  };

  tabs.forEach((tab, index) => {
    tab.onclick = () => select(tab);
    tab.addEventListener("keydown", event => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const next = step !== undefined ? (index + step + tabs.length) % tabs.length
        : event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
        : null;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  });
  const start = tabs.find(tab => tab.id === `tab-${initial}`);
  if (start && start !== tabs[0]) select(start);
  selectTab = name => select($(`#tab-${name}`));
}

/** Wechselt die Registerkarte (gesetzt von initTabs). */
let selectTab = () => {};

/**
 * Aus dem Filmuniversum (Galaxie): „Im Raster zeigen" - ein Genre als normaler Genre-Filter,
 * eine Schnittmenge als eigener Filter (alle Genres zugleich). Suche und
 * übrige Filter weichen, damit genau diese Titel zu sehen sind.
 * @param {string[]} genres
 */
function showGenresInGrid(genres) {
  filters = { ...emptyFilters(), ...(genres.length > 1 ? { genresAll: genres } : { genres }) };
  $("#movie-search").value = "";
  selectTab("titles");
  renderMovies();
  $("#entertainment-controls").scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }); // Filter mit der Schnittmenge im Blick
}

/**
 * Aus dem Filmuniversum (Dossier eines Menschen): „Im Raster zeigen" - die Titel einer Person als eigener
 * Filter (Knopf „Mit …"). Suche und übrige Filter weichen.
 * @param {string[]} ids
 * @param {string} name
 */
function showPersonInGrid(ids, name) {
  filters = { ...emptyFilters(), person: ids, personName: name };
  $("#movie-search").value = "";
  selectTab("titles");
  renderMovies();
  $("#entertainment-controls").scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
}

/**
 * Von der Detailseite: ?genre=… oder ?person=… zeigt diese Titel im Raster
 * (Genre-Filter bzw. „Mit …"). Der Parameter verschwindet danach aus der
 * Adresse, damit Neuladen wieder die normale Ansicht zeigt.
 */
function applyLinkFilter() {
  const params = new URLSearchParams(location.search);
  const genre = params.get("genre");
  const person = params.get("person");
  if (!genre && !person) return;
  if (genre) filters = { ...emptyFilters(), genres: [genre] };
  else {
    const key = personKey(person);
    const ids = state.movies.filter(movie => creditsOf(movie, state.castData).some(credit => credit.key === key)).map(movie => movie.id);
    filters = { ...emptyFilters(), person: ids, personName: person };
  }
  $("#movie-search").value = "";
  params.delete("genre");
  params.delete("person");
  history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : ""));
  selectTab("titles");
}

/** Sucht nach dem Neu-Rendern denselben Chip wieder, um den Tastaturfokus zu halten. */
function refocusChip(category, value) {
  $$(".filter-chip", $("#filter-chips")).find(chip => chip.dataset.category === category && chip.dataset.value === value)?.focus();
}

/** Verdrahtet Suche, Menü, Sortierung und Chips (Chips per Event-Delegation). */
function bindEvents() {
  // Debounce: verhindert, dass bei jedem Tastendruck das Raster neu entsteht.
  $("#movie-search").oninput = debounce(() => renderMovies({ animate: true }), CONFIG.SEARCH_DEBOUNCE_MS);
  // Filmuniversum: Enter in der Suche fliegt zum ersten Treffer
  $("#movie-search").addEventListener("keydown", event => {
    if (event.key !== "Enter" || $("#universe-panel")?.hidden !== false) return;
    event.preventDefault();
    renderMovies();
    universe?.flyToMatch();
  });
  initShortcuts({ search: $("#movie-search"), onSearchCleared: () => renderMovies({ animate: true }) });
  initSortControl({
    select: $("#movie-sort"), button: $("#movie-sort-dir"), options: sortOptions,
    key: sortKey, direction: sortDirection,
    onChange: ({ key, direction }) => { sortKey = key; sortDirection = direction; renderMovies({ animate: true }); },
  });
  bindFilterChips();
  if (SITE) return; // Website: nur anschauen - kein Menü „Mehr"
  $("#imdb-import-button").onclick = () => { closeToolsMenu(); startImdbImport(); };
  $("#fetch-covers-button").onclick = () => { closeToolsMenu(); runCoverFetch(); };
  $("#seen-cleanup-button").onclick = () => {
    closeToolsMenu();
    openSeenCleanup(state, () => { renderMovies(); renderStats(state); syncFilmYear(); });
  };
  $("#orphan-cleanup-button").onclick = () => {
    closeToolsMenu();
    openOrphanCleanup(state, () => { renderMovies(); renderStats(state); syncFilmYear(); });
  };
  document.addEventListener("click", event => {
    const menu = $("#tools-menu");
    if (menu.hasAttribute("open") && !menu.contains(event.target)) closeToolsMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeToolsMenu();
  });
}

/** Filter-Chips: aufklappbare Gruppen, ein Klick-Listener für die ganze Leiste. */
function bindFilterChips() {
  initFilterBar($("#filter-chips")); // Gruppen auf-/zuklappen, Tastatur, Suchfeld
  // Ein Listener für die ganze Chip-Leiste: Chips entstehen bei jedem Render
  // neu (Zählung ändert sich), einzelne Handler wären also nutzlos.
  $("#filter-chips").addEventListener("click", event => {
    const chip = event.target.closest(".filter-chip");
    if (chip) {
      const { category, value } = chip.dataset;
      filters = toggleFilterValue(filters, category, value);
      renderMovies({ animate: true });
      refocusChip(category, value);
      return;
    }
    if (event.target.closest("#filter-reset")) {
      filters = emptyFilters();
      renderMovies({ animate: true });
      $("#filter-chips").focus();
    }
  });
}

/**
 * Cover lokal speichern (js/cover-store.js): fehlende im Hintergrund holen,
 * wenn der Browser gerade nichts zu tun hat - nach dem Laden der Seite und
 * nach Import oder Cover-Abruf.
 */
let coverStoreRunning = false;
function scheduleCoverStore() {
  const run = async () => {
    if (coverStoreRunning) return;
    coverStoreRunning = true;
    try { await storeMissingCovers(state.movies); } finally { coverStoreRunning = false; }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 5000 }); else setTimeout(run, 1500);
}

/*
 * Besetzung nachladen (js/cast-fetch.js): einmal eingeschaltet, läuft der
 * Abruf bei jedem Öffnen von Entertainment im Hintergrund weiter, bis alles
 * da ist oder das OMDb-Tageslimit erreicht ist. Cover gehen vor: Läuft
 * „Fehlende Cover laden", wartet er; Cover aus seinen Antworten landen im Raster.
 */
let castFetchRunning = false;
let castFetchDone = 0;
async function startCastFetch() {
  if (castFetchRunning || !state.omdbApiKey) { renderCastStatus(); return; }
  castFetchRunning = true;
  castFetchDone = 0;
  let unsaved = 0;
  renderCastStatus();
  try {
    await runCastFetch({
      getMovies: () => state.movies,
      apiKey: state.omdbApiKey,
      shouldPause: () => coverFetchRunning,
      onCover: (id, cover) => {
        applyCover(id, cover);
        if (++unsaved >= COVER_SAVE_EVERY) { unsaved = 0; saveDashboardData({ movies: state.movies }).catch(() => {}); }
      },
      onProgress: done => { castFetchDone = done; renderCastStatus(); },
    });
  } catch {
    // z. B. Speicher voll: beim nächsten Öffnen erneut
  } finally {
    castFetchRunning = false;
    if (unsaved) await saveDashboardData({ movies: state.movies }).catch(() => {});
    if (unsaved) scheduleCoverStore();
    renderCastStatus();
  }
}
function scheduleCastFetch() {
  const run = () => { if (state.castFetch.enabled) startCastFetch(); };
  setTimeout(() => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 4000 }) : run()), 2500);
}

/** Zeile unter dem Netz: Stand des Abrufs, ggf. mit Knopf zum Starten. */
function renderCastStatus() {
  if (!universe) return;
  if (SITE) { // Website: nichts abzurufen - höchstens der Hinweis, dass die Besetzung noch fehlt
    universe.setStatus(Object.keys(state.castData).length ? "" : "Darsteller und Drehbuch kommen mit der nächsten Aktualisierung der Kinothek dazu – bis dahin nur die Regie.");
    return;
  }
  const { total, done, remaining } = castStatus(state.movies, state.castData);
  const n = value => value.toLocaleString("de-DE");
  const fetch = state.castFetch;
  const progress = total ? done / total : null;
  if (!total) { universe.setStatus(""); return; }
  if (!state.omdbApiKey) { universe.setStatus("Darsteller und Drehbuch brauchen den OMDb-Schlüssel (Einstellungen → Entertainment)."); return; }
  if (!fetch.enabled) {
    universe.setStatus(remaining ? `Bisher nur Regie${done ? ` und Besetzung für ${n(done)} von ${n(total)} Titeln` : ""}.` : "Besetzung vollständig.",
      { action: remaining ? `Besetzung laden (${n(remaining)} Titel)` : "", progress: done ? progress : null });
    return;
  }
  if (fetch.lastError) { universe.setStatus(`Besetzung: angehalten – ${fetch.lastError}`, { progress }); return; }
  if (!remaining) { universe.setStatus("Besetzung vollständig – neue Titel kommen von selbst dazu."); return; }
  const paused = fetch.pausedUntil && Date.parse(fetch.pausedUntil) > Date.now();
  if (paused) { universe.setStatus(`Besetzung: ${n(done)} von ${n(total)} Titeln geladen · OMDb-Tageslimit erreicht, morgen geht es von selbst weiter`, { progress }); return; }
  if (castFetchRunning || castFetchActive(fetch)) { universe.setStatus(`Besetzung wird geladen: ${n(done)} von ${n(total)} Titeln`, { progress }); return; }
  universe.setStatus(`Besetzung: ${n(done)} von ${n(total)} Titeln geladen · geht beim nächsten Öffnen weiter`, { progress });
}

/** Lädt den Zustand, zeichnet die Seite, spielt ggf. die Lösch-Animation und öffnet ggf. den Import. */
async function init() {
  if (SITE) {
    startSitePage();
    try { state = await loadState(); } catch (error) {
      $("#collection-count").textContent = "";
      siteLoadFailed(error, $("#movies-grid"));
      return;
    }
    startSiteCollection(state);
    sortOptions = siteSortOptions(SORT_OPTIONS);
  } else {
    state = await loadState();
    initAppShell(state, {
      onImported: () => { state.movies = normalizeMovies(state.movies); renderMovies(); renderStats(state); syncFilmYear(); renderImportReminder(state); scheduleCoverStore(); },
    });
  }
  setImportWindowDays(state.importWindowDays);
  window.addEventListener("dashboard:import-window", () => renderMovies());

  view = readEntertainmentView(state.entertainmentView);
  if (SITE && view.browse) { // Website: Suche, Filter und Sortierung dieses Besuchs
    $("#movie-search").value = view.browse.query;
    filters = view.browse.filters;
    if (sortOptions.some(option => option.value === view.browse.sortKey)) ({ key: sortKey, direction: sortDirection } = resolveSort(view.browse.sortKey, view.browse.sortDirection));
  }
  timeline = initTimeline($("#timeline-panel"), {
    mode: view.timelineMode,
    onModeChange: mode => rememberView({ timelineMode: mode }),
  });
  state.castData = readCastData(state.castData);
  state.castFetch = readCastFetch(state.castFetch);
  universe = initUniverse($("#universe-panel"), {
    mode: view.universeMode,
    onModeChange: mode => rememberView({ universeMode: mode }),
    onShowGenre: genre => showGenresInGrid([genre]),
    onShowPerson: showPersonInGrid,
    onStartFetch: async () => {
      if (!state.omdbApiKey) { showToast("Dafür fehlt der OMDb-Schlüssel (Einstellungen).", "warning"); return; }
      state.castFetch = await enableCastFetch();
      startCastFetch();
    },
    introMode: () => state.universeIntro,
  });
  if (SITE && !has("rating")) { // Website ohne Bewertungen: kein Filmjahr, kein „Ich gegen IMDb"
    for (const id of ["#tab-year", "#year-panel", "#tab-duel", "#duel-panel"]) $(id).remove();
  }
  else {
    filmYear = initFilmYear($("#year-panel"));
    syncFilmYear();
    duel = initDuel($("#duel-panel"), {
      threshold: state.duelThreshold,
      introMode: () => state.duelIntro,
      onThreshold: value => {
        state.duelThreshold = value;
        if (SITE) return; // Website: nur für diesen Besuch
        clearTimeout(thresholdTimer);
        thresholdTimer = setTimeout(() => saveDashboardData({ duelThreshold: value }), 300);
      },
      onGenre: name => {
        filters = { ...filters, genres: [name], genresAll: [] };
        renderMovies({ animate: false });
        $("#entertainment-controls").scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
      },
    });
  }
  bindEvents();
  initTabs(view.tab);
  applyLinkFilter();
  renderMovies();
  renderStats(state);
  renderCastStatus();
  if (SITE) return; // Website: kein Import, kein Abruf, keine anderen Tabs

  renderImportReminder(state, { onImport: startImdbImport });

  // Von der Startseite über "Jetzt importieren": Dialog direkt öffnen und
  // den Parameter entfernen, damit Neuladen ihn nicht erneut öffnet
  const params = new URLSearchParams(location.search);
  if (params.has("import")) {
    history.replaceState(null, "", location.pathname);
    startImdbImport();
  }

  scheduleCoverStore();
  scheduleCastFetch();
  // Besetzung und Schalter ändern sich auch aus anderen Tabs und den Einstellungen
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.castData) {
      state.castData = readCastData(changes.castData.newValue);
      syncFilmYear();
      if ($("#movie-search").value.trim()) renderMovies(); // Suche findet jetzt auch die neuen Darsteller
      else syncUniverse("", timelineList); // das Filmuniversum bekommt die neue Besetzung
      renderCastStatus();
    }
    if (changes.castFetch) {
      const before = state.castFetch;
      state.castFetch = readCastFetch(changes.castFetch.newValue);
      if (state.castFetch.enabled && !before.enabled) startCastFetch();
      renderCastStatus();
    }
    if (changes.omdbApiKey) { state.omdbApiKey = changes.omdbApiKey.newValue || ""; renderCastStatus(); }
  });

  // Kommt man von der Detailseite nach dem Löschen: Meldung + Ausblenden
  const deleted = takeDeletedMovie();
  if (deleted && !state.movies.some(movie => movie.id === deleted.movie.id)) {
    showToast(`„${deleted.movie.title}“ entfernt.`, "info");
    playRemoval($("#movies-grid"), deleted);
  }
}

// Vorhang sofort in den Ruhezustand bringen (nicht erst nach dem Laden der Daten)
initCurtain();
init().finally(markReady); // <html data-ready> für die Browser-Tests
