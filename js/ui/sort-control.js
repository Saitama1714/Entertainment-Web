import { escapeHtml } from "../utils/dom.js";

/*
 * Sortier-Steuerung unter Entertainment (auch auf der Website): Auswahl des
 * Kriteriums plus Pfeil-Knopf für die Richtung. Wechselt das Kriterium,
 * springt die Richtung auf dessen Startrichtung (z. B. Titel A–Z,
 * Bewertungen absteigend). Markup: <select> + <button class="sort-dir">.
 */

const ICONS = {
  desc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M13 6h8M13 11h6M13 16h4"/></svg>',
  asc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 20V4M3 8l4-4 4 4M13 8h4M13 13h6M13 18h8"/></svg>',
};
const LABELS = { desc: "Absteigend", asc: "Aufsteigend" };

/**
 * @param {{select: HTMLSelectElement, button: HTMLButtonElement,
 *   options: Array<{value: string, label: string, direction: string}>,
 *   key: string, direction: "asc"|"desc", onChange: Function}} config
 *   onChange({key, direction}) nach jeder Änderung.
 */
export function initSortControl({ select, button, options, key, direction, onChange }) {
  let current = { key, direction };
  const paint = () => {
    const other = current.direction === "desc" ? "asc" : "desc";
    button.innerHTML = ICONS[current.direction];
    button.dataset.direction = current.direction;
    button.title = LABELS[current.direction];
    button.setAttribute("aria-label", `${LABELS[current.direction]} sortiert – umschalten auf ${LABELS[other].toLowerCase()}`);
  };
  select.innerHTML = options.map(option =>
    `<option value="${escapeHtml(option.value)}"${option.value === current.key ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  paint();
  select.onchange = () => {
    const option = options.find(item => item.value === select.value);
    current = { key: select.value, direction: option?.direction || "desc" };
    paint();
    onChange({ ...current });
  };
  button.onclick = () => {
    current = { ...current, direction: current.direction === "desc" ? "asc" : "desc" };
    paint();
    onChange({ ...current });
  };
}
