import { escapeHtml } from "../utils/dom.js";
import { has, SITE } from "../utils/host.js";
import { filterMovies } from "../logic/movies-logic.js";
import {
  RANGE_FIELDS, rangeField, rangeBounds, normalizeRange, rangeHistogram, rangePresets,
  rangeLabel, rangeInputValue, parseRangeInput,
} from "../logic/range-filter-logic.js";

/*
 * Filter „Bereiche“ (2.49): ein weiterer Knopf in der Filterleiste unter
 * Entertainment (js/ui/movie-filters.js). Er klappt je Kriterium einen Regler
 * mit zwei Griffen auf - mit Balken darüber (wie viele Titel wo liegen),
 * Eingabefeldern für genaue Werte und Schnellwahl. Gesetzte Bereiche stehen
 * zusätzlich als Pille mit × in der Leiste.
 *
 * Beim Ziehen wird nur das Raster neu gezeichnet (onChange live), damit der
 * Griff nicht verloren geht; beim Loslassen die ganze Leiste. Die Rechnung
 * steht in js/logic/range-filter-logic.js.
 */

/** Kriterien, die es hier gibt (Website: nur veröffentlichte, und nur mit Werten). */
function fields(allMovies) {
  return RANGE_FIELDS
    .filter(field => !SITE || !field.site || has(field.site))
    .map(field => ({ field, bounds: rangeBounds(allMovies, field.key) }))
    .filter(entry => entry.bounds && entry.bounds[0] < entry.bounds[1]);
}

const labelOf = field => (SITE && field.siteLabel ? field.siteLabel : field.label);
const share = (value, [low, high]) => ((value - low) / (high - low)).toFixed(4); // Anteil 0…1 für --from/--to

function blockHtml({ field, bounds }, searched, filters) {
  const { key, step } = field;
  const range = filters.ranges?.[key] || bounds;
  const set = Boolean(filters.ranges?.[key]);
  const base = filterMovies(searched, filters, "", key); // alle übrigen Filter, ohne diesen Bereich
  const buckets = rangeHistogram(base, key, bounds);
  const top = Math.max(1, ...buckets.map(bucket => bucket.count));
  const bars = buckets.map(bucket => `<i data-from="${bucket.from}" data-to="${bucket.to}" class="${bucket.to > range[0] && bucket.from <= range[1] ? "is-in" : ""}" style="height:${bucket.count ? 8 + (92 * bucket.count) / top : 0}%"></i>`).join("");
  const presets = rangePresets(key, bounds).map(preset => {
    const on = set && preset.range[0] === range[0] && preset.range[1] === range[1];
    return `<button type="button" class="range-preset" data-range-preset="${key}" data-from="${preset.range[0]}" data-to="${preset.range[1]}" aria-pressed="${on}">${escapeHtml(preset.label)}</button>`;
  }).join("");
  const label = labelOf(field);
  const input = (value, end) => `<input class="range-num" ${field.month ? 'type="month"' : 'type="text" inputmode="decimal"'} data-range-num="${key}" data-end="${end}"
      value="${escapeHtml(rangeInputValue(key, value))}" aria-label="${escapeHtml(label)} ${end ? "bis" : "von"}" autocomplete="off">`;
  const thumb = (value, end) => `<input type="range" class="range-thumb" data-range-thumb="${key}" data-end="${end}" min="${bounds[0]}" max="${bounds[1]}" step="${step}" value="${value}"
      aria-label="${escapeHtml(label)} ${end ? "bis" : "von"}" aria-valuetext="${escapeHtml(field.format(value))}">`;
  return `
    <div class="range-block${set ? " is-set" : ""}" data-range="${key}">
      <div class="range-head"><span class="range-name">${escapeHtml(label)}</span>
        <span class="range-values">${input(range[0], 0)}<span aria-hidden="true">bis</span>${input(range[1], 1)}</span></div>
      <div class="range-bars" aria-hidden="true">${bars}</div>
      <div class="range-slider" style="--from:${share(range[0], bounds)};--to:${share(range[1], bounds)}">
        <span class="range-track"></span><span class="range-fill"></span>${thumb(range[0], 0)}${thumb(range[1], 1)}</div>
      <div class="range-ends" aria-hidden="true"><span>${escapeHtml(field.format(bounds[0]))}</span><span>${escapeHtml(field.format(bounds[1]))}</span></div>
      <div class="range-presets">${presets}${set ? `<button type="button" class="range-preset range-all" data-range-clear="${key}">Alle</button>` : ""}</div>
    </div>`;
}

/**
 * Knopf „Bereiche“ samt Auswahl, für filterChipsHtml.
 * @param {boolean} open - gerade aufgeklappt?
 */
export function rangeGroupHtml(allMovies, searched, filters, open, chevron) {
  const list = fields(allMovies);
  if (!list.length) return "";
  const count = list.filter(({ field }) => filters.ranges?.[field.key]).length;
  const badge = count ? `<span class="filter-drop-badge"><span class="visually-hidden">, gesetzt: </span>${count}</span>` : "";
  return `
    <div class="filter-drop filter-drop-ranges${count ? " is-active" : ""}" data-group="ranges">
      <button type="button" class="filter-drop-button" aria-expanded="${open}" aria-controls="filter-panel-ranges">
        <span class="filter-drop-text"><span class="filter-group-label">Bereiche</span>${badge}</span>${chevron}
      </button>
      <div class="filter-drop-panel range-panel" id="filter-panel-ranges" role="group" aria-label="Bereiche"${open ? "" : " hidden"}>
        <div class="filter-drop-head"><span>Bereiche</span><button type="button" class="filter-drop-done">Fertig</button></div>
        <div class="range-list">${list.map(entry => blockHtml(entry, searched, filters)).join("")}</div>
      </div>
    </div>`;
}

/** Pillen der gesetzten Bereiche (mit ×), vor den Knöpfen der Leiste. */
export function rangePillsHtml(filters) {
  return RANGE_FIELDS
    .filter(field => filters.ranges?.[field.key])
    .map(field => `<button type="button" class="filter-chip filter-set" data-category="range" data-value="${field.key}" aria-pressed="true" title="Bereich aufheben">
        <span class="filter-chip-label">${escapeHtml(rangeLabel(field.key, filters.ranges[field.key], { site: SITE }))}</span><span aria-hidden="true">×</span></button>`)
    .join("");
}

/**
 * Verdrahtet die Regler in der Filterleiste. Einmal pro Seite.
 * @param {HTMLElement} container - #filter-chips
 * @param {{movies: () => Array, ranges: () => object, onChange: (ranges: object, options: {live: boolean, focus?: string}) => void}} options
 */
export function initRangeFilter(container, { movies, ranges, onChange }) {
  const boundsOf = key => rangeBounds(movies(), key);
  const commit = (key, low, high, { live = false, focus = "" } = {}) => {
    const next = { ...ranges() };
    const range = normalizeRange(key, low, high, boundsOf(key));
    if (range) next[key] = range; else delete next[key];
    onChange(next, { live, focus });
  };

  // Ziehen: Anzeige des Reglers sofort, Raster live
  container.addEventListener("input", event => {
    const thumb = event.target.closest?.("[data-range-thumb]");
    if (!thumb) return;
    const block = thumb.closest(".range-block");
    const key = thumb.dataset.rangeThumb;
    const [first, second] = block.querySelectorAll("[data-range-thumb]");
    let low = Number(first.value);
    let high = Number(second.value);
    if (low > high) { if (thumb === first) { low = high; first.value = low; } else { high = low; second.value = high; } }
    const bounds = boundsOf(key);
    const field = rangeField(key);
    block.querySelector(".range-slider").style.cssText = `--from:${share(low, bounds)};--to:${share(high, bounds)}`;
    const [fromInput, toInput] = block.querySelectorAll("[data-range-num]");
    fromInput.value = rangeInputValue(key, low);
    toInput.value = rangeInputValue(key, high);
    thumb.setAttribute("aria-valuetext", field.format(Number(thumb.value)));
    for (const bar of block.querySelectorAll(".range-bars i")) bar.classList.toggle("is-in", Number(bar.dataset.to) > low && Number(bar.dataset.from) <= high);
    commit(key, low, high, { live: true });
  });

  container.addEventListener("change", event => {
    const thumb = event.target.closest?.("[data-range-thumb]");
    const field = event.target.closest?.("[data-range-num]");
    if (!thumb && !field) return;
    const block = event.target.closest(".range-block");
    const key = block.dataset.range;
    if (thumb) {
      const [first, second] = block.querySelectorAll("[data-range-thumb]");
      commit(key, Number(first.value), Number(second.value), { focus: `[data-range-thumb="${key}"][data-end="${thumb.dataset.end}"]` });
      return;
    }
    const current = ranges()[key] || boundsOf(key);
    const value = parseRangeInput(key, field.value);
    if (value === null) { field.value = rangeInputValue(key, current[Number(field.dataset.end)]); return; }
    const [low, high] = field.dataset.end === "1" ? [current[0], value] : [value, current[1]];
    commit(key, low, high, { focus: `[data-range-num="${key}"][data-end="${field.dataset.end}"]` });
  });

  // Enter im Zahlenfeld übernimmt (ohne das Formular o. Ä. auszulösen)
  container.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.closest?.("[data-range-num]")) { event.preventDefault(); event.target.blur(); event.target.focus(); }
  });

  container.addEventListener("click", event => {
    const preset = event.target.closest("[data-range-preset]");
    if (preset) {
      const key = preset.dataset.rangePreset;
      const current = ranges()[key];
      const from = Number(preset.dataset.from);
      const to = Number(preset.dataset.to);
      const same = current && current[0] === from && current[1] === to; // nochmal antippen hebt auf
      const bounds = boundsOf(key);
      commit(key, same ? bounds[0] : from, same ? bounds[1] : to, { focus: `[data-range-preset="${key}"][data-from="${from}"][data-to="${to}"]` });
      return;
    }
    const clear = event.target.closest("[data-range-clear]");
    if (clear) {
      const key = clear.dataset.rangeClear;
      const bounds = boundsOf(key);
      commit(key, bounds[0], bounds[1], { focus: `[data-range-thumb="${key}"][data-end="0"]` });
    }
  });
}
