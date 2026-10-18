/*
 * Automatische Sicherung - reine Logik ohne Chrome-APIs (getestet in
 * tests/auto-backup.test.mjs). Ablauf und Downloads: js/ui/auto-backup.js.
 *
 * Nach jedem IMDb-Import und jeder Änderung an den Titeln legt das
 * Dashboard still eine Sicherung im Download-Ordner ab (Unterordner
 * AUTO_BACKUP_FOLDER) und behält die letzten AUTO_BACKUP_KEEP. Auf Wunsch
 * entsteht daneben gleich die Datendatei der Website (sammlung.json).
 */

/** Unterordner im Download-Ordner. */
export const AUTO_BACKUP_FOLDER = "Dashboard-Sicherungen";

/** So viele automatische Sicherungen bleiben liegen; ältere löscht das Dashboard. */
export const AUTO_BACKUP_KEEP = 5;

/** Datendatei der Website - wird jedes Mal ersetzt. */
export const WEBSITE_FILE = `${AUTO_BACKUP_FOLDER}/sammlung.json`;

/** Wartezeit nach der letzten Änderung, damit mehrere Speichervorgänge eine Sicherung ergeben. */
export const AUTO_BACKUP_DELAY_MS = 4000;

const pad = value => String(value).padStart(2, "0");

/**
 * Dateiname einer automatischen Sicherung mit lokalem Zeitstempel, z. B.
 * „Dashboard-Sicherungen/dashboard-sicherung-2026-10-08_22-45-03.json" -
 * so sortiert der Ordner von selbst nach Zeit.
 * @param {Date} [date]
 * @returns {string}
 */
export function backupFileName(date = new Date()) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${AUTO_BACKUP_FOLDER}/dashboard-sicherung-${day}_${time}.json`;
}

/**
 * Welche automatischen Sicherungen bleiben, welche fallen weg.
 * @param {number[]} ids - Download-IDs, älteste zuerst (die neue zuletzt).
 * @param {number} [keep]
 * @returns {{keep: number[], remove: number[]}}
 */
export function pruneBackups(ids, keep = AUTO_BACKUP_KEEP) {
  const valid = (Array.isArray(ids) ? ids : []).filter(id => Number.isInteger(id) && id >= 0);
  const unique = valid.filter((id, index) => valid.indexOf(id) === index);
  const cut = Math.max(0, unique.length - keep);
  return { keep: unique.slice(cut), remove: unique.slice(0, cut) };
}
