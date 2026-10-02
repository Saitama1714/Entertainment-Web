import { loadCollection, standLabel } from "../data-source.js";
import {
  searchMovies, filterMovies, sortMovies, toggleFilterValue,
  emptyFilters, hasActiveFilters, SORT_OPTIONS, DEFAULT_SORT,
} from "../logic/movies-logic.js";
import { movieGridHtml, settleCachedCovers } from "../ui/movie-card.js";
import { filterChipsHtml, initFilterBar } from "../ui/movie-filters.js";
import { renderStats } from "../ui/stats.js";
import { initSiteShell } from "../ui/site-shell.js";
import { initShortcuts } from "../ui/shortcuts.js";
import { initCurtain, renderCornerDecoration } from "../ui/curtain.js";
import { $, $$, escapeHtml, debounce, emptyState } from "../utils/dom.js";
import { CONFIG, SITE_TITLE, CORNER_ICON } from "../utils/constants.js";

/*
 * Hauptseite (index.html): die Sammlung mit zwei Registerkarten - „Titel"
 * (Raster mit Suche, Filter-Chips, Sortierung) und „Auf einen Blick"
 * (Zahlen und Zufallspicker). Nur lesen: Daten kommen aus data/sammlung.json.
 *
 * Suche, Filter, Sortierung und Registerkarte bleiben für die Dauer des
 * Besuchs erhalten (sessionStorage), damit man nach einer Detailseite dort
 * weitermacht, wo man war.
 */

const VIEW_KEY = "site:view";
let collection = { movies: [], include: new Set() };
let filters = emptyFilters();
let sortKey = DEFAULT_SORT;

/** Merkt sich Suche, Filter, Sortierung und Registerkarte für diesen Besuch. */
function saveView() {
  try {
    sessionStorage.setItem(VIEW_KEY, JSON.stringify({
      query: $("#movie-search").value, filters, sortKey, tab: $(".view-tab[aria-selected='true']")?.id,
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
    if (SORT_OPTIONS.some(option => option.value === view.sortKey)) sortKey = view.sortKey;
    return view.tab;
  } catch {
    return null;
  }
}

/** Sortier-Optionen, die zur Datendatei passen (ohne eigene Bewertung keine Sortierung danach). */
const sortOptions = () => SORT_OPTIONS
  .filter(option => option.value !== "yourRating" || collection.include.has("rating"))
  // Auf der Website spricht der Besitzer: „Meine" statt „Deine" Bewertung
  .map(option => (option.value === "yourRating" ? { ...option, label: "Meine Bewertung (hoch → niedrig)" } : option));

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
  const sorted = sortMovies(filtered, sortKey);

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

/** Registerkarten „Titel" / „Auf einen Blick" (ARIA-Tablist, Pfeiltasten). */
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

  $("#movie-sort").innerHTML = sortOptions().map(option =>
    `<option value="${option.value}" ${option.value === sortKey ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  $("#movie-sort").onchange = event => { sortKey = event.target.value; renderMovies(); };

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
  renderCornerDecoration({ curtainIcon: CORNER_ICON });
  initSiteShell();
  const tab = restoreView();

  try {
    collection = await loadCollection();
  } catch (error) {
    $("#collection-count").textContent = "";
    $("#movies-grid").innerHTML = emptyState(`Die Sammlung konnte nicht geladen werden. ${error.message || ""}`.trim());
    initTabs(null);
    return;
  }
  if (!sortOptions().some(option => option.value === sortKey)) sortKey = DEFAULT_SORT;
  $("#collection-stand").textContent = standLabel(collection);

  bindEvents();
  initTabs(tab);
  renderMovies();
  renderStats(collection, { detailHref: "titel.html", emptyText: "Noch keine Titel veröffentlicht.", withSeen: collection.include.has("seen") });
}

// Vorhang sofort starten (nicht erst nach dem Laden der Daten)
initCurtain();
init();
