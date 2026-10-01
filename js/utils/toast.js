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
 */
export function showToast(message, type = "info") {
  const root = ensureContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  root.appendChild(toast);

  // Für CSS-Transition: erst im nächsten Frame die "sichtbar"-Klasse setzen.
  requestAnimationFrame(() => toast.classList.add("toast-visible"));

  const remove = () => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    // Sicherheitsnetz, falls keine Transition läuft (dann käme transitionend nie)
    setTimeout(() => toast.remove(), 600);
  };
  setTimeout(remove, CONFIG.TOAST_DURATION_MS);
  toast.addEventListener("click", remove);
}
