import { getDashboardData, exportDashboard, saveDashboardData } from "../storage.js";
import {
  backupFileName, pruneBackups, WEBSITE_FILE, AUTO_BACKUP_DELAY_MS,
} from "../logic/auto-backup-logic.js";
import { buildPublicData, defaultOptions } from "../logic/publish-logic.js";
import { readAccess } from "../logic/access-logic.js";
import { AUTO_BACKUP_FOLDER } from "../logic/auto-backup-logic.js";
import { showToast } from "../utils/toast.js";

/*
 * Automatische Sicherung (Einstellungen → Daten). Nach jedem IMDb-Import und
 * jeder Änderung an den Titeln - saveDashboardData() setzt dafür
 * `autoBackupPending` und meldet „dashboard:movies-saved" - speichert das
 * Dashboard ein paar Sekunden später still eine Sicherung in den
 * Download-Ordner (Unterordner „Dashboard-Sicherungen") und, wenn
 * eingeschaltet, daneben sammlung.json für die Website. Die letzten 5
 * automatischen Sicherungen bleiben, ältere löscht es selbst; von Hand
 * gespeicherte Sicherungen sind nie betroffen.
 *
 * Wird die Seite vorher geschlossen, bleibt `autoBackupPending` stehen, und
 * die nächste Dashboard-Seite holt die Sicherung nach.
 *
 * Still heißt: kein Speichern-Dialog und - mit der Berechtigung
 * „downloads.ui" - für diesen Moment auch keine Download-Blase von Chrome.
 * Eingebunden über initAppShell (js/ui/app-shell.js), also auf jeder Seite.
 */

let timer = 0;
let running = false;
let again = false;

const downloads = () => globalThis.chrome?.downloads;

/** Wartet, bis ein Download fertig (oder abgebrochen) ist - höchstens `ms`. */
function whenDone(id, ms = 15000) {
  return new Promise(resolve => {
    const api = downloads();
    let finished = false;
    const done = state => {
      if (finished) return;
      finished = true;
      api.onChanged?.removeListener(listener);
      clearTimeout(limit);
      resolve(state);
    };
    const listener = delta => {
      if (delta.id === id && delta.state?.current && delta.state.current !== "in_progress") done(delta.state.current);
    };
    api.onChanged?.addListener(listener);
    const limit = setTimeout(() => done("timeout"), ms);
    api.search({ id }).then(([item]) => { if (item && item.state !== "in_progress") done(item.state); }).catch(() => {});
  });
}

/*
 * Landet die Datei nicht im Unterordner, läuft im Hintergrund noch ein
 * älteres js/background.js (Chrome lädt es erst beim Neuladen der
 * Erweiterung neu, die Seiten dagegen sofort). Dann einmal darauf hinweisen.
 */
let warned = false;
async function checkName(id) {
  try {
    const [item] = await downloads().search({ id });
    const inFolder = new RegExp(`(^|[\\\\/])${AUTO_BACKUP_FOLDER}[\\\\/]`).test(item?.filename || "");
    if (item && !inFolder && !warned) {
      warned = true;
      showToast("Die Sicherung hat einen falschen Namen bekommen. Bitte die Erweiterung unter chrome://extensions einmal neu laden.", "warning");
    }
  } catch { /* nur ein Hinweis */ }
}

/** Legt eine JSON-Datei still im Download-Ordner ab und liefert die Download-ID. */
async function saveJson(filename, value, conflictAction) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 1)], { type: "application/json" }));
  // Name für js/background.js vormerken: Weil es dort einen Listener für
  // onDeterminingFilename gibt, übergeht Chrome sonst `filename` und nimmt
  // die zufällige Kennung der Blob-Adresse als Dateinamen
  await chrome.storage.local.set({ downloadNames: { [url]: { filename, conflictAction } } });
  try {
    const id = await downloads().download({ url, filename, saveAs: false, conflictAction });
    await whenDone(id);
    await checkName(id);
    return id;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Download-Blase von Chrome kurz aus- und wieder einschalten (nur mit „downloads.ui"). */
async function quietUi(enabled) {
  try {
    // Merken, solange die Blase aus ist: Wird der Tab mittendrin geschlossen,
    // schaltet die nächste Seite sie wieder ein (initAutoBackup)
    await chrome.storage.local.set({ downloadUiQuiet: !enabled });
    await downloads()?.setUiOptions?.({ enabled });
  } catch { /* ohne Berechtigung: Blase erscheint eben */ }
}

/** Entfernt eine alte automatische Sicherung: Datei und Eintrag in der Download-Liste. */
async function removeBackup(id) {
  try { await downloads().removeFile(id); } catch { /* schon gelöscht oder verschoben */ }
  try { await downloads().erase({ id }); } catch { /* egal */ }
}

/**
 * Führt eine automatische Sicherung aus (sofern eingeschaltet).
 * @param {{onlyIfPending?: boolean}} [options] - onlyIfPending: nachgeholte
 *   Sicherung beim Seitenstart - nur, wenn sie nicht schon ein anderer Tab
 *   erledigt hat (mehrere Tabs öffnen gleichzeitig, z. B. beim Chrome-Start).
 */
export async function runAutoBackup({ onlyIfPending = false } = {}) {
  if (running) { again = true; return false; }
  const api = downloads();
  if (!api?.download) return false;
  running = true;
  try {
    const settings = await getDashboardData();
    if (settings.autoBackup === false) return false;
    if (onlyIfPending && !settings.autoBackupPending) return false;
    // Zuerst zurücksetzen: Kommt währenddessen eine Änderung, steht sie wieder an
    const now = new Date();
    await chrome.storage.local.set({ autoBackupPending: false });

    const payload = await exportDashboard();
    await quietUi(false);
    try {
      const id = await saveJson(backupFileName(now), payload, "uniquify");
      const { keep, remove } = pruneBackups([...settings.autoBackupIds, id]);
      for (const old of remove) await removeBackup(old);
      // Zählt wie eine Sicherung von Hand: die Erinnerung beginnt von vorn
      const update = { autoBackupIds: keep, lastBackupAt: now.toISOString(), backupReminderSnoozedUntil: "" };

      if (settings.websiteFile !== false) {
        const options = { ...defaultOptions(), ...(settings.websiteOptions || {}) };
        const data = buildPublicData(payload, options, { now, access: readAccess(settings.websiteAccess) });
        const fileId = await saveJson(WEBSITE_FILE, data, "overwrite");
        // Die Datei wird ersetzt; nur den alten Eintrag in der Download-Liste aufräumen
        if (settings.websiteFileId >= 0 && settings.websiteFileId !== fileId) {
          try { await api.erase({ id: settings.websiteFileId }); } catch { /* egal */ }
        }
        update.websiteFileId = fileId;
      }
      await chrome.storage.local.set(update);
    } finally {
      await quietUi(true);
    }
    window.dispatchEvent(new CustomEvent("dashboard:auto-backup", { detail: { at: now.toISOString() } }));
    return true;
  } catch (error) {
    console.warn("[Dashboard] Automatische Sicherung fehlgeschlagen:", error);
    // Beim nächsten Mal noch einmal versuchen
    try { await chrome.storage.local.set({ autoBackupPending: true }); } catch { /* egal */ }
    return false;
  } finally {
    running = false;
    if (again) { again = false; schedule(); }
  }
}

/** Sicherung nach kurzer Ruhe: mehrere Speichervorgänge ergeben eine Sicherung. */
function schedule(delay = AUTO_BACKUP_DELAY_MS, options = {}) {
  clearTimeout(timer);
  timer = setTimeout(() => runAutoBackup(options), delay);
}

/**
 * Hört auf geänderte Titel und holt eine ausstehende Sicherung nach.
 * @param {{autoBackup?: boolean, autoBackupPending?: boolean}} state
 */
export function initAutoBackup(state) {
  window.addEventListener("dashboard:movies-saved", () => schedule());
  // Zufälliger Versatz: Öffnen mehrere Tabs gleichzeitig, holt nur einer nach
  if (state.autoBackup !== false && state.autoBackupPending) schedule(1500 + Math.random() * 1500, { onlyIfPending: true });
  // Download-Blase nach einer abgebrochenen Sicherung wieder einschalten
  chrome.storage.local.get({ downloadUiQuiet: false })
    .then(({ downloadUiQuiet }) => { if (downloadUiQuiet && !running) quietUi(true); })
    .catch(() => {});
}
