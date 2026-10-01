import { openModal } from "../utils/modal.js";

/*
 * Tastenkürzel für alle Seiten. Jede Seite meldet an, was bei ihr möglich
 * ist; Kürzel ohne Aktion auf der aktuellen Seite tun nichts.
 *
 * Grundregeln, damit nichts mit normaler Bedienung kollidiert:
 * - Solange ein Dialog offen ist, gelten nur die Tasten des Dialogs.
 * - Beim Tippen in Feldern (Suche, Formulare, Auswahllisten) greifen keine
 *   Kürzel - einzige Ausnahme: Esc im Suchfeld leert die Suche.
 * - Mit Strg, Alt oder Cmd gedrückt bleibt alles beim Browser.
 * - Gedrückt gehaltene Tasten lösen nicht mehrfach aus.
 */

const SHORTCUTS = [
  { keys: ["?"], label: "Diese Übersicht anzeigen", where: "Überall" },
  { keys: ["/"], label: "Suche öffnen", where: "Sammlung" },
  { keys: ["Esc"], label: "Suche leeren (im Suchfeld)", where: "Sammlung" },
  { keys: ["←", "→"], label: "Vorheriger / nächster Titel", where: "Detailseite" },
];

let actions = {};
let installed = false;

const isModalOpen = () => (document.getElementById("modal-root")?.childElementCount ?? 0) > 0;

/** Tippt man gerade in ein Eingabeelement? */
function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

/** Öffnet die Übersicht aller Tastenkürzel als Dialog. */
export function openShortcutHelp() {
  const rows = SHORTCUTS.map(item => `
      <tr>
        <td class="shortcut-keys">${item.keys.map(key => `<kbd>${key}</kbd>`).join(" ")}</td>
        <td>${item.label}</td>
        <td class="meta">${item.where}</td>
      </tr>`).join("");

  openModal("Tastenkürzel", `
    <table class="shortcut-table">
      <thead class="visually-hidden"><tr><th>Taste</th><th>Aktion</th><th>Wo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    `);
}

/** Zentraler Tastatur-Handler; Regeln siehe Kommentar am Dateianfang. */
function onKeydown(event) {
  if (event.defaultPrevented || event.isComposing) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isModalOpen()) return;

  const search = actions.search || null;

  // Esc im Suchfeld: erst leeren, beim zweiten Mal das Feld verlassen
  if (event.key === "Escape" && search && event.target === search) {
    event.preventDefault();
    if (search.value) {
      search.value = "";
      actions.onSearchCleared?.();
    } else {
      search.blur();
    }
    return;
  }

  if (isTypingTarget(event.target) || event.repeat) return;

  switch (event.key) {
    case "?":
      event.preventDefault();
      openShortcutHelp();
      break;
    case "/":
      if (!search) return;
      event.preventDefault(); // sonst landet der Schrägstrich im Feld
      search.focus();
      search.select();
      break;
    case "ArrowLeft":
      if (!actions.previousMovie) return;
      event.preventDefault();
      actions.previousMovie();
      break;
    case "ArrowRight":
      if (!actions.nextMovie) return;
      event.preventDefault();
      actions.nextMovie();
      break;
    default:
  }
}

/**
 * Meldet die auf dieser Seite verfügbaren Aktionen an. Einmal pro Seite aufrufen.
 * @param {object} [pageActions]
 * @param {HTMLInputElement} [pageActions.search]
 * @param {Function} [pageActions.onSearchCleared] - nach Esc im Suchfeld
 * @param {Function} [pageActions.previousMovie]
 * @param {Function} [pageActions.nextMovie]
 */
export function initShortcuts(pageActions = {}) {
  actions = pageActions;
  if (installed) return;
  installed = true;
  document.addEventListener("keydown", onKeydown);
}
