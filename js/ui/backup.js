import { exportDashboard, saveDashboardData } from "../storage.js";
import { ageReminder, snoozeUntil } from "../logic/reminder-logic.js";
import { showToast } from "../utils/toast.js";
import { plural } from "../utils/format.js";

/*
 * Sicherung als Datei und Erinnerung daran. Alle Daten liegen nur lokal in
 * Chrome - wird die Erweiterung entfernt, sind sie weg. Die Erinnerung
 * erscheint auf der Startseite (#backup-reminder-slot), wenn die letzte
 * Sicherung älter ist als eingestellt (Standard: 30 Tage).
 */

const SNOOZE_DAYS = 7;

/** Status der Sicherungs-Erinnerung (siehe ageReminder). */
export function backupReminderStatus(state, now) {
  return ageReminder({
    lastAt: state.lastBackupAt,
    intervalDays: state.backupReminderDays,
    snoozedUntil: state.backupReminderSnoozedUntil,
  }, now);
}

/**
 * Speichert den kompletten Zustand als JSON-Datei und merkt sich den
 * Zeitpunkt (steht damit auch schon in der Datei selbst).
 * @param {object} state - lastBackupAt wird aktualisiert.
 */
export async function downloadBackup(state) {
  state.lastBackupAt = new Date().toISOString();
  state.backupReminderSnoozedUntil = "";
  await saveDashboardData({ lastBackupAt: state.lastBackupAt, backupReminderSnoozedUntil: "" });

  const payload = await exportDashboard();
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "dashboard-sicherung.json";
  link.click();
  // Erst nach dem Start des Downloads freigeben - sofort freigeben kann ihn abbrechen
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Sicherung gespeichert.", "success");
}

/**
 * Zeigt oder entfernt den Hinweis auf eine fällige Sicherung. Ohne Daten
 * (keine Favoriten, keine Einträge) gibt es nichts zu sichern und keinen Hinweis.
 * @param {object} state
 */
export function renderBackupReminder(state) {
  const slot = document.getElementById("backup-reminder-slot");
  if (!slot) return;
  const hasData = state.movies.length > 0 || state.pinnedBookmarkIds.length > 0;
  const status = backupReminderStatus(state, Date.now());
  if (!hasData || !status.due) { slot.innerHTML = ""; return; }

  const message = status.never
    ? "Du hast noch keine Sicherung gespeichert. Deine Daten liegen nur in Chrome – eine Datei schützt sie, falls die Erweiterung einmal entfernt wird."
    : `Deine letzte Sicherung ist ${plural(status.ageDays, "Tag", "Tage")} alt.`;
  slot.innerHTML = `
    <div class="import-reminder" role="status">
      <p>${message}</p>
      <div class="import-reminder-actions">
        <button class="button" type="button" id="backup-now">Jetzt sichern</button>
        <button class="button quiet" type="button" id="backup-snooze">In ${SNOOZE_DAYS} Tagen erinnern</button>
      </div>
    </div>`;

  slot.querySelector("#backup-now").addEventListener("click", async () => {
    await downloadBackup(state);
    slot.innerHTML = "";
  });
  slot.querySelector("#backup-snooze").addEventListener("click", async () => {
    state.backupReminderSnoozedUntil = snoozeUntil(Date.now(), SNOOZE_DAYS);
    await saveDashboardData({ backupReminderSnoozedUntil: state.backupReminderSnoozedUntil });
    slot.innerHTML = "";
    showToast(`Erinnerung in ${SNOOZE_DAYS} Tagen wieder.`, "info");
  });
}
