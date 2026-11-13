import { CONFIG } from "./constants.js";

/*
 * Kurze, nicht blockierende Meldungen unten rechts (Ersatz für alert()).
 * Der Container wird beim ersten Toast angelegt und ist eine Live-Region,
 * damit Screenreader die Meldung vorlesen.
 */

let container = null;

/** Legt den gemeinsamen Container beim ersten Aufruf an. */
function ensureContainer() {
  if (container) return container;
  container = document.createElement("div");
  container.className = "toast-stack";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("role", "status");
  document.body.appendChild(container);
  return container;
}

/**
 * Zeigt eine kurze, nicht-blockierende Benachrichtigung an (Ersatz für alert()).
 * @param {string} message
 * @param {"info"|"success"|"warning"|"error"} [type="info"]
 * @param {{action?: {label: string, onClick: () => void}, duration?: number}} [options]
 *   action: Knopf in der Meldung (z. B. „Rückgängig", 2.46); bleibt dann länger stehen.
 */
export function showToast(message, type = "info", { action = null, duration = 0 } = {}) {
  const root = ensureContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toast-action";
    button.textContent = action.label;
    button.addEventListener("click", event => { event.stopPropagation(); action.onClick(); remove(); });
    toast.append(button);
  }
  root.appendChild(toast);

  // Für CSS-Transition: erst im nächsten Frame die "sichtbar"-Klasse setzen.
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  const remove = () => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    // Sicherheitsnetz, falls keine Transition läuft (dann käme transitionend nie)
    setTimeout(() => toast.remove(), 600);
  };
  setTimeout(remove, duration || (action ? CONFIG.TOAST_DURATION_MS * 2 : CONFIG.TOAST_DURATION_MS));
  toast.addEventListener("click", remove);
}
