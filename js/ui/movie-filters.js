import { escapeHtml } from "../utils/dom.js";
import {
  KIND_FILTER_OPTIONS, MEDIA_FILTER_OPTIONS, SEEN_FILTER_OPTIONS, IMPORT_FILTER_OPTIONS,
  listFilterOptions, genreFilterOptions, importFilterOptions, facetCounts, hasActiveFilters,
} from "../logic/movies-logic.js";

/*
 * Filterleiste unter Entertainment (auch auf der Website Entertainment-Web
 * genutzt): je Gruppe ein Knopf (Art, Genre, Medium, Status, Liste, Import),
 * der eine kleine Auswahlliste aufklappt. Gefiltert wird sofort beim Anklicken.
 *
 * Die Optionen sind weiterhin <button class="filter-chip" data-category
 * data-value aria-pressed> - die Seiten (movies-view.js, sammlung.js)
 * schalten sie wie bisher per Event-Delegation um und zeichnen danach neu.
 * Welche Gruppe gerade offen ist und was im Suchfeld einer langen Liste
 * steht, merkt sich dieses Modul, damit beides das Neuzeichnen übersteht.
 * Welche Titel ein Filter trifft und wie gezählt wird, steht in movies-logic.js.
 */

/** Ab so vielen Optionen bekommt eine Gruppe ein Suchfeld und zwei Spalten. */
const MANY_OPTIONS = 9;

let openCategory = "";
const searchText = {};

const CHEVRON = `<svg class="filter-drop-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;

const matches = (label, query) => !query || label.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de"));

/** Eine Option (aria-pressed = aktiv). */
function chipHtml(category, option, count, active, query) {
  const empty = count === 0 && !active ? " is-empty" : "";
  const hidden = matches(option.label, query) ? "" : " hidden";
  return `
    <button type="button" class="filter-chip${empty}" data-category="${category}" data-value="${escapeHtml(option.value)}"
            aria-pressed="${active}"${hidden}>
      <span class="filter-chip-label">${escapeHtml(option.label)}</span><span class="chip-count">${count}</span>
    </button>`;
}

/** Was der Knopf einer Gruppe zusätzlich zeigt: die eine Auswahl oder die Anzahl. */
function summaryHtml(options, active) {
  const chosen = options.filter(option => active.has(option.value));
  if (chosen.length === 1) return `<span class="filter-drop-value">: ${escapeHtml(chosen[0].label)}</span>`;
  if (chosen.length > 1) return `<span class="filter-drop-badge"><span class="visually-hidden">, gewählt: </span>${chosen.length}</span>`;
  return "";
}

/** Eine Gruppe: Knopf + aufklappbare Auswahl; leer, wenn es nichts zu wählen gibt. */
function groupHtml(label, category, options, filters, counts) {
  if (!options.length) return "";
  const active = new Set(filters[category]);
  const open = openCategory === category;
  const many = options.length >= MANY_OPTIONS;
  const query = many ? searchText[category] || "" : "";
  const chips = options
    .map(option => chipHtml(category, option, counts[category].get(option.value) || 0, active.has(option.value), query))
    .join("");
  const search = many
    ? `<input type="search" class="filter-drop-search" placeholder="${escapeHtml(label)} suchen …" aria-label="${escapeHtml(label)} durchsuchen" value="${escapeHtml(query)}" autocomplete="off">`
    : "";
  return `
    <div class="filter-drop${active.size ? " is-active" : ""}" data-group="${category}">
      <button type="button" class="filter-drop-button" aria-expanded="${open}" aria-controls="filter-panel-${category}">
        <span class="filter-drop-text"><span class="filter-group-label">${escapeHtml(label)}</span>${summaryHtml(options, active)}</span>${CHEVRON}
      </button>
      <div class="filter-drop-panel${many ? " is-many" : ""}" id="filter-panel-${category}" role="group" aria-label="${escapeHtml(label)}"${open ? "" : " hidden"}>
        <div class="filter-drop-head"><span>${escapeHtml(label)}</span><button type="button" class="filter-drop-done">Fertig</button></div>
        ${search}
        <div class="filter-drop-options">${chips}</div>
      </div>
    </div>`;
}

/**
 * Baut die komplette Filterleiste (Art, Genre, Medium, Status, IMDb-Liste, Import).
 * Die Gruppe "Import" erscheint nur, solange etwas neu/geändert ist (oder eine
 * Option daraus noch aktiv ist, damit man sie wieder lösen kann).
 * Welche Genre- und Listen-Optionen es gibt, richtet sich nach der ganzen Sammlung (damit
 * sie beim Tippen in der Suche nicht auftauchen/verschwinden); die Zahlen
 * nach der bereits durchsuchten Teilmenge.
 * @param {Array} allMovies - komplette Sammlung.
 * @param {Array} searched - Sammlung nach Suchbegriff, vor den Filtern.
 * @param {{kind: string[], genres: string[], media: string[], seen: string[], lists: string[], import: string[]}} filters
 * @param {{hide?: string[]}} [options] - Gruppen, die entfallen (z. B. auf der
 *   Website, wenn Medium oder Gesehen-Status nicht veröffentlicht sind).
 * @returns {string} Leer, solange es nichts zu filtern gibt.
 */
export function filterChipsHtml(allMovies, searched, filters, { hide = [] } = {}) {
  const counts = facetCounts(searched, filters);
  const listOptions = listFilterOptions(allMovies).map(name => ({ value: name, label: name }));
  const genreOptions = genreFilterOptions(allMovies).map(name => ({ value: name, label: name }));
  const importOptions = filters.import?.length ? IMPORT_FILTER_OPTIONS : importFilterOptions(allMovies);
  const groups = [
    ["Art", "kind", KIND_FILTER_OPTIONS],
    ["Genre", "genres", genreOptions],
    ["Medium", "media", MEDIA_FILTER_OPTIONS],
    ["Status", "seen", SEEN_FILTER_OPTIONS],
    ["Liste", "lists", listOptions],
    ["Import", "import", importOptions],
  ].filter(([, category]) => !hide.includes(category))
    .map(([label, category, options]) => groupHtml(label, category, options, filters, counts))
    .join("");
  if (!groups) return "";
  const reset = hasActiveFilters(filters)
    ? `<button type="button" class="filter-reset" id="filter-reset">Filter zurücksetzen</button>`
    : "";
  return `<div class="filter-bar">${groups}${reset}</div>`;
}

/* ---------------------------------------------------------------------------
 * Verhalten: auf-/zuklappen, Tastatur, Suchfeld. Einmal pro Seite aufrufen.
 * ------------------------------------------------------------------------- */

const narrow = () => window.matchMedia("(max-width: 680px)").matches;
const visibleOptions = panel => [...panel.querySelectorAll(".filter-chip:not([hidden])")];

/** Zeigt die offene Gruppe (und nur die) und hält ihre Auswahl im Fenster. */
function applyOpenState(container) {
  for (const drop of container.querySelectorAll(".filter-drop")) {
    const open = drop.dataset.group === openCategory;
    const panel = drop.querySelector(".filter-drop-panel");
    drop.querySelector(".filter-drop-button").setAttribute("aria-expanded", String(open));
    drop.classList.toggle("is-open", open);
    panel.hidden = !open;
    panel.classList.remove("align-end");
    if (open && !narrow() && panel.getBoundingClientRect().right > document.documentElement.clientWidth - 12) {
      panel.classList.add("align-end");
    }
  }
  document.documentElement.classList.toggle("filter-sheet-open", Boolean(openCategory) && narrow());
}

/**
 * Verdrahtet die Filterleiste in `container` (#filter-chips). Das Umschalten
 * der Optionen selbst bleibt bei der Seite (Klick auf .filter-chip).
 * @param {HTMLElement} container
 */
export function initFilterBar(container) {
  const setOpen = (category, { focus = "" } = {}) => {
    const previous = openCategory;
    openCategory = category;
    applyOpenState(container);
    const drop = container.querySelector(`.filter-drop[data-group="${previous || category}"]`);
    if (focus === "button") drop?.querySelector(".filter-drop-button")?.focus();
    if (focus === "first" && category) {
      const panel = container.querySelector(`#filter-panel-${category}`);
      (panel?.querySelector(".filter-drop-search") || visibleOptions(panel)[0])?.focus();
    }
  };
  const close = options => { if (openCategory) setOpen("", options); };

  // Nach jedem Neuzeichnen durch die Seite: offene Gruppe wieder ausrichten
  new MutationObserver(() => applyOpenState(container)).observe(container, { childList: true });

  container.addEventListener("click", event => {
    const button = event.target.closest(".filter-drop-button");
    if (button) {
      const category = button.closest(".filter-drop").dataset.group;
      setOpen(openCategory === category ? "" : category);
      return;
    }
    if (event.target.closest(".filter-drop-done")) close({ focus: "button" });
  });

  container.addEventListener("input", event => {
    const field = event.target.closest(".filter-drop-search");
    if (!field) return;
    const drop = field.closest(".filter-drop");
    searchText[drop.dataset.group] = field.value;
    for (const chip of drop.querySelectorAll(".filter-chip")) {
      chip.hidden = !matches(chip.querySelector(".filter-chip-label").textContent, field.value);
    }
  });

  container.addEventListener("keydown", event => {
    if (event.key === "Escape" && openCategory) {
      event.preventDefault();
      event.stopPropagation(); // nicht zusätzlich die Suche leeren o. Ä.
      close({ focus: "button" });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const drop = event.target.closest(".filter-drop");
    if (!drop) return;
    if (event.target.closest(".filter-drop-button")) {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      setOpen(drop.dataset.group, { focus: "first" });
      return;
    }
    const panel = drop.querySelector(".filter-drop-panel");
    const items = [panel.querySelector(".filter-drop-search"), ...visibleOptions(panel)].filter(Boolean);
    const index = items.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    items[Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))].focus();
  });

  // Klick oder Fokus außerhalb der offenen Gruppe schließt sie. Auf dem
  // Handy (Auswahl als Blatt von unten) schluckt der schließende Tipp den
  // Klick, damit man nicht versehentlich einen Titel öffnet.
  document.addEventListener("click", event => {
    if (!openCategory || event.target.closest?.(`.filter-drop[data-group="${openCategory}"]`)) return;
    if (!event.target.isConnected) return; // Option wurde gerade neu gezeichnet
    if (narrow()) { event.preventDefault(); event.stopPropagation(); }
    close();
  }, true);
  document.addEventListener("focusin", event => {
    if (openCategory && !event.target.closest?.(`.filter-drop[data-group="${openCategory}"]`)) close();
  });
  window.addEventListener("resize", () => applyOpenState(container));
}
