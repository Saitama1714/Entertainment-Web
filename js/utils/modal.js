import { $, escapeHtml } from "./dom.js";

/*
 * Ein einziger Dialog zur Zeit, gerendert in #modal-root. Kümmert sich um
 * Fokus (erstes Element beim Öffnen, Rückgabe beim Schließen), Esc und
 * einen Tab-Kreislauf innerhalb des Dialogs (WCAG AA).
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let lastFocusedElement = null;
let keydownHandler = null;
let closeHandler = null;

/**
 * Alle aktuell per Tab erreichbaren Elemente im Dialog. Wird bei jedem Tab
 * neu bestimmt, weil Dialoge Inhalte nachladen (z. B. Dateizeilen im Import)
 * und deaktivierte Knöpfe nicht erreichbar sind.
 */
const focusableIn = modal => [...modal.querySelectorAll(FOCUSABLE)]
  .filter(element => !element.disabled && element.getClientRects().length > 0);

/**
 * Öffnet ein Modal mit Titel + beliebigem HTML-Inhalt.
 * Kümmert sich um Fokus-Management, Escape-Taste und Tab-Trapping (WCAG AA).
 * @param {string} title
 * @param {string} contentHtml
 * @param {{onClose?: Function, small?: boolean}} [options] - onClose läuft einmal beim
 *   Schließen, egal ob per Knopf, Esc, × oder Klick daneben; small = schmales Fenster.
 */
export function openModal(title, contentHtml, { onClose = null, small = false } = {}) {
  // Schon ein Dialog offen? Dessen Tastatur-Handler zuerst entfernen und den
  // ursprünglichen Fokus behalten (nicht ein Element im alten Dialog).
  if (keydownHandler) document.removeEventListener("keydown", keydownHandler);
  else lastFocusedElement = document.activeElement;

  closeHandler = onClose;
  const root = $("#modal-root");
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal${small ? " modal--small" : ""}" role="dialog" aria-modal="true" tabindex="-1" aria-label="${escapeHtml(title)}">
        <header class="modal-header">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-button" id="close-modal" aria-label="Schließen">×</button>
        </header>
        <div class="modal-content">${contentHtml}</div>
      </section>
    </div>`;

  $("#close-modal").onclick = closeModal;
  $(".modal-backdrop").onclick = event => {
    if (event.target === event.currentTarget) closeModal();
  };

  const modal = $(".modal");
  (focusableIn(modal)[0] || modal).focus();

  keydownHandler = event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableIn(modal);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", keydownHandler);
}

/** Schließt das aktuell offene Modal und gibt den Fokus zurück. */
export function closeModal() {
  $("#modal-root").innerHTML = "";
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
  lastFocusedElement?.focus?.();
  lastFocusedElement = null;
  const handler = closeHandler;
  closeHandler = null;
  handler?.();
}
