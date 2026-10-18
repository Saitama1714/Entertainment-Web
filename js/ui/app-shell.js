import { $ } from "../utils/dom.js";
import { saveDashboardData, syncBootMirror } from "../storage.js";
import { openSettingsModal } from "./settings-modal.js";
import { initLinkTransitions } from "./link-transition.js";
import { initBrandMedallion } from "./brand-medallion.js";
import { initAutoBackup } from "./auto-backup.js";
import { normalizeMovies } from "../collection.js";

/*
 * Gemeinsame Kopfleiste aller Seiten: Logo-Medaillon, Design-Auswahl
 * (Hell/Dunkel/System), Einstellungen-Knopf und Zurück-Knopf. Schaltet außerdem die
 * Klick-Animationen für Links ein (js/ui/link-transition.js) - so hat jede
 * Seite sie, ohne sie einzeln einzubinden.
 */

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let themedState = null;

/**
 * Setzt das gespeicherte Design auf das Dokument und synchronisiert die Auswahl.
 * "System" wird hier in hell/dunkel aufgelöst - das CSS kennt nur diese zwei
 * Werte. Gespeichert bleibt "system", die Auswahl zeigt weiterhin "System".
 */
export function applyTheme(state) {
  themedState = state;
  const resolved = state.theme === "system" ? (darkQuery.matches ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = resolved;
  syncBootMirror(state); // damit der nächste Seitenstart gleich im richtigen Design beginnt
  const select = $("#theme-select");
  if (select) select.value = state.theme;
}

// Stellt Windows/macOS während des Betriebs um, zieht "System" sofort mit.
darkQuery.addEventListener("change", () => {
  if (themedState?.theme === "system") applyTheme(themedState);
});

/**
 * Verdrahtet die Kopfleiste, die auf allen Seiten identisch ist:
 * Design-Auswahl und Einstellungen-Dialog (inkl. Export/Import).
 * @param {object} state - Aktueller Dashboard-Zustand.
 * @param {{onImported?: Function}} [hooks] - onImported wird nach einem
 *   erfolgreichen Datei-Import aufgerufen, damit die Seite neu rendern kann.
 */
export function initAppShell(state, hooks = {}) {
  applyTheme(state);
  followOtherTabs(state, hooks);
  initBrandMedallion({ motion: state.logoMotion }); // Logo-Animation nach den Einstellungen
  initLinkTransitions(state);
  initAutoBackup(state); // Sicherung nach Import/Änderungen (Einstellungen → Daten)

  const select = $("#theme-select");
  if (select) {
    select.addEventListener("change", async event => {
      state.theme = event.target.value;
      await saveDashboardData({ theme: state.theme });
      applyTheme(state);
    });
  }

  const settingsButton = $("#settings-button");
  if (settingsButton) {
    settingsButton.addEventListener("click", () => openSettingsModal(state, hooks.onImported));
  }

  const backButton = $("#back-button");
  if (backButton) {
    backButton.addEventListener("click", () => {
      // Wurde die Seite direkt geöffnet, gibt es keinen Verlauf zum Zurückgehen.
      if (window.history.length > 1) window.history.back();
      else window.location.href = location.pathname.includes("/views/") ? "../index.html" : "index.html";
    });
  }
}

/*
 * Mehrere Dashboard-Tabs: Jede Seite lädt ihre Daten einmal und speichert
 * später die ganze Liste zurück. Ändert ein anderer Tab Titel oder Favoriten
 * (Import, Löschen, Sortieren …), übernimmt diese Seite den neuen Stand sofort
 * und zeichnet neu - sonst würde ihr nächstes Speichern die Änderung des
 * anderen Tabs überschreiben. Eigene Speichervorgänge kommen hier ebenfalls
 * an, ändern aber nichts (gleicher Stand) und lösen kein Neuzeichnen aus.
 */
const SHARED_KEYS = ["movies", "pinnedBookmarkIds"];

function followOtherTabs(state, hooks) {
  globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    for (const key of SHARED_KEYS) {
      const next = changes[key]?.newValue;
      if (!Array.isArray(next) || JSON.stringify(next) === JSON.stringify(state[key])) continue;
      state[key] = key === "movies" ? normalizeMovies(next) : next;
      changed = true;
    }
    if (changed) hooks.onImported?.();
  });
}
