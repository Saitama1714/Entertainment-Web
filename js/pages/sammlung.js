import { loadCollection, standLabel } from "../data-source.js";
import {
  searchMovies, filterMovies, sortMovies, toggleFilterValue,
  emptyFilters, hasActiveFilters, SORT_OPTIONS, DEFAULT_SORT, resolveSort,
} from "../logic/movies-logic.js";
import { movieGridHtml, settleCachedCovers } from "../ui/movie-card.js";
import { filterChipsHtml, initFilterBar } from "../ui/movie-filters.js";
import { initSortControl } from "../ui/sort-control.js";
import { renderStats } from "../ui/stats.js";
import { initSiteShell } from "../ui/site-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { initCurtain, renderCornerDecoration, releaseCurtain } from "../ui/curtain.js";
import { openGate, releaseGate } from "../ui/site-gate.js";
import { initTimeline } from "../ui/timeline.js";
import { renderQuoteOfDay } from "../ui/quote-of-day.js";
import { $, $$, escapeHtml, debounce, emptyState } from "../utils/dom.js";
import { CONFIG, SITE_TITLE, CORNER_ICON } from "../utils/constants.js";

/*
 * Hauptseite (index.html): die Sammlung mit drei Registerkarten - „Titel"
 * (Raster mit Suche, Filter-Chips, Sortierung), „Zeitleiste" (Cover Flow +
 * Zeitleiste, gemeinsam mit dem Dashboard; dieselbe Suche und dieselben
 * Filter, ohne Sortierung) und „Auf einen Blick" (Zahlen und Zufallspicker).
 * Nur lesen: Daten kommen aus data/sammlung.json.
 *
 * Suche, Filter, Sortierung, Registerkarte und Ansicht der Zeitleiste bleiben
 * für die Dauer des Besuchs erhalten (sessionStorage), damit man nach einer
 * Detailseite dort weitermacht, wo man war.
 */

const VIEW_KEY = "site:view";
let collection = { movies: [], include: new Set() };
let filters = emptyFilters();
let sortKey = DEFAULT_SORT;
let sortDirection = resolveSort(DEFAULT_SORT).direction;

// Zeitleiste: bekommt dieselbe gesuchte und gefilterte Liste wie das Raster,
// aber erst, wenn ihre Registerkarte offen ist (sonst nur vormerken)
let timeline = null;
let timelineMode = "";
let timelineList = [];
let timelineStale = true;
const timelineVisible = () => !$("#timeline-panel").hidden;

function syncTimeline() {
  if (!timeline) return;
  if (timelineVisible()) { timeline.update(timelineList); timelineStale = false; }
  else timelineStale = true;
}

/** Merkt sich Suche, Filter, Sortierung und Registerkarte für diesen Besuch. */
function saveView() {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({
      query: $("#movie-search").value, filters, sortKey, sortDirection, tab: $(".view-tab[aria-selected='true']")?.id,
      timelineMode: timeline ? timeline.mode() : timelineMode,
    }));
  } catch { /* ohne Speicher: beim Zurückkommen eben wieder ungefiltert */ }
}

/** Holt den gemerkten Zustand zurück (nur Werte, die es noch gibt). */
function restoreView() {
  try {
    const view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null");
    if (!view) return null;
    $("#movie-search").value = typeof view.query === "string" ? view.query : "";
    const base = emptyFilters();
    for (const key of Object.keys(base)) if (Array.isArray(view.filters?.[key])) base[key] = view.filters[key].map(String);
    filters = base;
    if (view.sortKey) ({ key: sortKey, direction: sortDirection } = resolveSort(view.sortKey, view.sortDirection));
    if (typeof view.timelineMode === "string") timelineMode = view.timelineMode;
    return view.tab;
  } catch {
    return null;
  }
}

/** Sortier-Optionen, die zur Datendatei passen (ohne eigene Bewertung keine Sortierung danach). */
// Website: Standard bleibt die IMDb-Bewertung - sie steht deshalb vorn
const sortOptions = () => [...SORT_OPTIONS].sort((a, b) => (b.value === DEFAULT_SORT) - (a.value === DEFAULT_SORT))
  .filter(option => option.value !== "yourRating" || collection.include.has("rating"))
  .filter(option => option.value !== "seenAt" || collection.include.has("seen"))
  // Auf der Website spricht der Besitzer: „Meine" statt „Deine" Bewertung
  .map(option => (option.value === "yourRating" ? { ...option, label: "Meine Bewertung" } : option));

/** Zeigt die Filter-/Sortierzeile (nur wenn es Titel gibt) und baut die Chips neu. */
function renderToolbar(searched) {
  const row = $("#toolbar-row");
  row.hidden = collection.movies.length === 0;
  if (row.hidden) return;
  const hide = ["media", "seen", "lists"].filter(category => !collection.include.has({ media: "medium", seen: "seen", lists: "lists" }[category]));
  $("#filter-chips").innerHTML = filterChipsHtml(collection.movies, searched, filters, { hide });
}

/** Zeichnet das Raster: Suche → Filter → Sortierung, dazu Zähler und Chips. */
function renderMovies() {
  const query = $("#movie-search").value;
  const searched = searchMovies(collection.movies, query);
  const filtered = filterMovies(searched, filters);
  const sorted = sortMovies(filtered, sortKey, sortDirection);
  timelineList = filtered;
  syncTimeline();

  const empty = collection.movies.length === 0
    ? emptyState("Hier sind noch keine Titel veröffentlicht.")
    : emptyState(query.trim() || !hasActiveFilters(filters) ? "Keine Treffer. Andere Suche versuchen?" : "Keine Treffer für diese Filter.");
  $("#movies-grid").innerHTML = movieGridHtml(sorted, "titel.html", empty);
  settleCachedCovers($("#movies-grid"));
  renderToolbar(searched);

  const total = collection.movies.length;
  const shown = filtered.length;
  $("#collection-count").textContent = total === 0 ? "Noch keine Titel." : shown === total ? `${total} Titel` : `${shown} von ${total} Titeln`;
  saveView();
}

/**
 * Registerkarten „Titel" / „Zeitleiste" / „Auf einen Blick" (ARIA-Tablist,
 * Pfeiltasten). Suche und Filter stehen über den Panels; bei „Auf einen
 * Blick" sind sie ausgeblendet, in der Zeitleiste nur die Sortierung.
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
    const view = target.id.replace("tab-", "");
    const controls = $("#entertainment-controls");
    controls.hidden = view === "stats";
    controls.dataset.view = view;
    if (view === "timeline" && timeline) {
      if (timelineStale) { timeline.update(timelineList); timelineStale = false; }
      timeline.show();
    }
    saveView();
  };
  tabs.forEach((tab, index) => {
    tab.onclick = () => select(tab);
    tab.addEventListener("keydown", event => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      const next = step !== undefined ? (index + step + tabs.length) % tabs.length
        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      tabs[next].focus();
      select(tabs[next]);
    });
  });
  const start = tabs.find(tab => tab.id === initial);
  if (start) select(start);
}

/** Verdrahtet Suche, Sortierung und Chips (Chips per Event-Delegation). */
function bindEvents() {
  $("#movie-search").oninput = debounce(renderMovies, CONFIG.SEARCH_DEBOUNCE_MS);
  initShortcuts({ search: $("#movie-search"), onSearchCleared: renderMovies });

  initSortControl({
    select: $("#movie-sort"), button: $("#movie-sort-dir"), options: sortOptions(),
    key: sortKey, direction: sortDirection,
    onChange: ({ key, direction }) => { sortKey = key; sortDirection = direction; renderMovies(); },
  });

  initFilterBar($("#filter-chips")); // Gruppen auf-/zuklappen, Tastatur, Suchfeld
  $("#filter-chips").addEventListener("click", event => {
    const chip = event.target.closest(".filter-chip");
    if (chip) {
      const { category, value } = chip.dataset;
      filters = toggleFilterValue(filters, category, value);
      renderMovies();
      $$(".filter-chip", $("#filter-chips")).find(item => item.dataset.category === category && item.dataset.value === value)?.focus();
      return;
    }
    if (event.target.closest("#filter-reset")) {
      filters = emptyFilters();
      renderMovies();
      $("#filter-chips").focus();
    }
  });
}

async function init() {
  document.title = SITE_TITLE;
  $("#site-title").textContent = SITE_TITLE;
  renderQuoteOfDay(); // Filmzitat des Tages wie auf der Startseite des Dashboards
  initSiteShell();
  const tab = restoreView();

  try {
    collection = await loadCollection();
  } catch (error) {
    $("#collection-count").textContent = "";
    $("#movies-grid").innerHTML = emptyState(`Die Sammlung konnte nicht geladen werden. ${error.message || ""}`.trim());
    initTabs(null);
    releaseGate();
    releaseCurtain();
    renderCornerDecoration({ curtainIcon: CORNER_ICON });
    return;
  }
  // Dekoration unten links wie im Dashboard gewählt (ältere Datendateien: Popcorn)
  renderCornerDecoration({ curtainIcon: collection.decor || CORNER_ICON });
  // Einlass: Der Vorhang (wenn er bei diesem Besuch spielt) wartet
  // geschlossen und öffnet sich erst, wenn die Sammlung frei ist - ohne
  // Passwort gleich, mit Passwort nach der richtigen Eingabe
  if (openGate(collection.access, { onUnlock: releaseCurtain })) releaseCurtain();
  if (!sortOptions().some(option => option.value === sortKey)) ({ key: sortKey, direction: sortDirection } = resolveSort(DEFAULT_SORT));
  $("#collection-stand").textContent = standLabel(collection);

  // Zeitleiste: Ansicht „Bewertet" nur, wenn die eigene Bewertung veröffentlicht ist
  timeline = initTimeline($("#timeline-panel"), {
    detailHref: "titel.html",
    modes: collection.include.has("rating") ? ["release", "rated"] : ["release"],
    mode: timelineMode || undefined,
    ratingLabel: "Meine Bewertung",
    onModeChange: saveView,
  });
  bindEvents();
  initTabs(tab);
  renderMovies();
  renderStats(collection, { detailHref: "titel.html", emptyText: "Noch keine Titel veröffentlicht.", withSeen: collection.include.has("seen") });
}

// Vorhang sofort starten (nicht erst nach dem Laden der Daten)
initCurtain();
init();
