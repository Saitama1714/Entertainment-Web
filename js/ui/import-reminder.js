import { reminderStatus } from "../logic/imdb-import-logic.js";
import { snoozeUntil } from "../logic/reminder-logic.js";
import { saveDashboardData } from "../storage.js";
import { showToast } from "../utils/toast.js";
import { plural } from "../utils/format.js";

/*
 * Hinweis, wenn die IMDb-Daten älter sind als in den Einstellungen gewählt.
 * Erscheint auf Seiten mit einem Platzhalter #import-reminder-slot.
 * Der Datenstand liegt in chrome.storage.local und in jeder Sicherung -
 * ein Update des Dashboards ändert daran nichts.
 */

const SNOOZE_DAYS = 3;
let options = {};

/**
 * Zeigt oder entfernt den Hinweis. Ohne Optionen werden die zuletzt
 * übergebenen verwendet (z. B. wenn die Einstellungen sich ändern).
 * @param {object} state
 * @param {{importHref?: string, onImport?: Function}} [pageOptions]
 *   importHref: Link zur Import-Seite; onImport: öffnet den Import direkt.
 */
export function renderImportReminder(state, pageOptions) {
  if (pageOptions) options = pageOptions;
  const slot = document.getElementById("import-reminder-slot");
  if (!slot) return;

  const status = reminderStatus(state, Date.now());
  if (!status.due) { slot.innerHTML = ""; return; }

  const message = status.never
    ? "Noch kein IMDb-Import mit Datenstand. Importiere deine Listen, damit Entertainment aktuell ist."
    : `Deine IMDb-Daten sind ${plural(status.ageDays, "Tag", "Tage")} alt – Zeit für einen frischen Export.`;
  const action = options.onImport
    ? `<button class="button" type="button" id="reminder-import">Jetzt importieren</button>`
    : `<a class="button" href="${options.importHref || "views/movies.html?import=1"}">Jetzt importieren</a>`;

  slot.innerHTML = `
    <div class="import-reminder" role="status">
      <p>${message}</p>
      <div class="import-reminder-actions">
        ${action}
        <button class="button quiet" type="button" id="reminder-snooze">In ${SNOOZE_DAYS} Tagen erinnern</button>
      </div>
    </div>`;

  slot.querySelector("#reminder-import")?.addEventListener("click", () => options.onImport());
  slot.querySelector("#reminder-snooze").addEventListener("click", async () => {
    state.importReminderSnoozedUntil = snoozeUntil(Date.now(), SNOOZE_DAYS);
    await saveDashboardData({ importReminderSnoozedUntil: state.importReminderSnoozedUntil });
    slot.innerHTML = "";
    showToast(`Erinnerung in ${SNOOZE_DAYS} Tagen wieder.`, "info");
  });
}
