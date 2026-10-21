import { normalizeMovies } from "./collection.js";
import { SITE } from "./utils/host.js";
import { loadSiteState, saveSiteData } from "./site/site-data.js";

/*
 * Zugriff auf chrome.storage.local sowie Sichern/Wiederherstellen des
 * kompletten Dashboard-Zustands. chrome.storage.local gehört zur
 * Extension-ID (fest über den Schlüssel im Manifest) und übersteht Updates.
 *
 * Auf der Website (<html data-site>, js/utils/host.js) gibt es kein
 * chrome.storage: loadState() liest dort data/sammlung.json, und
 * saveDashboardData() merkt sich nur die Ansicht (js/site/site-data.js).
 */

/** Alle gespeicherten Werte mit ihren Standardwerten. Neue Einstellungen hier ergänzen. */
const DEFAULTS = {
  theme: "dark",                 // "dark" (Standard) | "light" | "system"
  pinnedBookmarkIds: [],         // IDs der angehefteten Chrome-Lesezeichen (Reihenfolge = Anzeige)
  movies: [],                    // Einträge unter Entertainment (Aufbau: collection.js/newMovie)
  omdbApiKey: "",
  curtainIcon: "popcorn",        // Deko unten links, siehe CURTAIN_ICONS
  introMode: "hourly",           // Kinovorhang: "always" | "hourly" | "every2h" | "daily" | "off"
  clickEffect: "zoom",           // Klick-Animation für Links: "zoom" | "off"
  clickDuration: 450,            // Dauer der Klick-Animation in ms: 250 | 450 | 800
  projectorDust: true,           // Lichtkegel mit Staub im Kopf der Übersicht (js/ui/projector-dust.js)
  universeIntro: "hourly",       // Urknall im Filmuniversum: "session" | "always" | "hourly" | "every2h" | "daily" | "off" (js/logic/universe-logic.js)
  duelIntro: "hourly",           // Auftritt in „Du gegen IMDb": Werte wie universeIntro (js/logic/duel-logic.js)
  logoMotion: null,              // Logo-Animation {mode, effects, tempo} (js/logic/logo-motion-logic.js); null = Standard
  lastImdbImportAt: "",          // Datenstand des letzten IMDb-Imports (ISO)
  importReminderDays: 30,        // Erinnerung nach so vielen Tagen, 0 = nie
  importReminderSnoozedUntil: "",// "Später erinnern" gilt bis (ISO)
  importWindowDays: 28,          // Filter "Import" zeigt Neu/Geändert der letzten so vielen Tage
  sortImdbDownloads: true,       // IMDb-Exporte beim Herunterladen in Downloads/IMDb-Exporte legen
  deleteImportedFiles: true,     // nach dem Import die importierten Dateien aus dem Download-Ordner löschen
  ratingsListName: "",           // Name, unter dem der Bewertungs-Export importiert wird (Standard „Bewertungen")
  collectionListName: "",        // Name der IMDb-Liste mit der physischen Sammlung (Häkchen im Import)
  lastBackupAt: "",              // Zeitpunkt der letzten Sicherung als Datei (ISO)
  backupReminderDays: 30,        // Erinnerung an eine Sicherung nach so vielen Tagen, 0 = nie
  backupReminderSnoozedUntil: "",// "Später erinnern" für die Sicherung gilt bis (ISO)
  autoBackup: true,              // automatische Sicherung nach Import/Änderungen (js/ui/auto-backup.js)
  websiteFile: true,             // dabei auch sammlung.json für die Website speichern
  websiteOptions: null,          // Häkchen für die Website-Datei (OPTIONAL_GROUPS); null = Standard
  websiteAccess: null,           // Passwort der Website als Prüfwert {salt, hash}; null = ohne
  autoBackupIds: [],             // intern: Download-IDs der automatischen Sicherungen (älteste zuerst)
  websiteFileId: -1,             // intern: Download-ID der letzten sammlung.json
  autoBackupPending: false,      // intern: Titel geändert, Sicherung steht noch aus
  entertainmentView: null,       // gemerkte Ansicht unter Entertainment (js/logic/view-logic.js), nur dieser Rechner
  castData: {},                  // Besetzung von OMDb je IMDb-Kennung (js/logic/cast-logic.js) - Teil der Sicherung
  duelThreshold: 1.5,            // „Du gegen IMDb": ab diesem Abstand Geheimtipp/unterschätzt (js/logic/duel-logic.js) - kommt auf die Website
  castFetch: null,               // Abruf der Besetzung: {enabled, pausedUntil, lastError, activeAt} (js/cast-fetch.js)
};
const KEYS = Object.keys(DEFAULTS);

/**
 * Interne Werte der automatischen Sicherung: gehören zu diesem Chrome
 * (Download-Liste), nicht in eine Sicherungsdatei.
 */
const LOCAL_ONLY = new Set(["autoBackupIds", "websiteFileId", "autoBackupPending", "entertainmentView"]);

/** Lädt den aktuellen Dashboard-Zustand, mit Defaults für fehlende Werte. */
export async function getDashboardData() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return {
    ...DEFAULTS,
    ...stored,
    movies: Array.isArray(stored.movies) ? stored.movies : [],
    pinnedBookmarkIds: Array.isArray(stored.pinnedBookmarkIds) ? stored.pinnedBookmarkIds : [],
  };
}

/**
 * Lädt den Zustand für eine Seite: wie getDashboardData, zusätzlich mit
 * vollständig normalisierten Einträgen (fehlende Felder ergänzt).
 */
export async function loadState() {
  if (SITE) return loadSiteState();
  const state = await getDashboardData();
  state.movies = normalizeMovies(state.movies);
  syncBootMirror(state);
  return state;
}

/**
 * Hält die synchrone Kopie für js/boot.js aktuell (Design und wann der
 * Vorhang spielt). Aufrufen, wenn sich theme oder introMode ändern.
 * Nie ein Fehler nach außen: ohne Kopie startet die Seite einfach mit den
 * Standardwerten.
 * @param {{theme: string, introMode: string}} state
 */
export function syncBootMirror(state) {
  try {
    localStorage.setItem("dashboard:theme", state.theme || "dark");
    localStorage.setItem("dashboard:intro-mode", state.introMode || "hourly");
  } catch {
    // localStorage nicht verfügbar - nur der Start ist dann nicht optimiert
  }
}

/**
 * Speichert einen Teil des Zustands (nur die übergebenen Schlüssel).
 * Ändern sich die Titel, steht danach eine automatische Sicherung an: Das
 * Flag hält das auch über ein Schließen der Seite hinweg fest, das Ereignis
 * weckt js/ui/auto-backup.js auf dieser Seite.
 */
export async function saveDashboardData(partial) {
  if (SITE) return saveSiteData(partial);
  const moviesChanged = "movies" in partial;
  await chrome.storage.local.set(moviesChanged ? { ...partial, autoBackupPending: true } : partial);
  if (moviesChanged && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("dashboard:movies-saved"));
}

/** Erstellt das exportierbare JSON-Objekt (für den Download-Button). */
export async function exportDashboard() {
  const data = await getDashboardData();
  for (const key of LOCAL_ONLY) delete data[key];
  return { version: 1, exportedAt: new Date().toISOString(), data };
}

/**
 * Importiert eine zuvor exportierte Dashboard-Datei.
 * @param {object} payload - Geparstes JSON aus der importierten Datei.
 * @throws {Error} Wenn das Format nicht unterstützt wird.
 */
export async function importDashboard(payload) {
  if (!payload || payload.version !== 1 || !payload.data || typeof payload.data !== "object") {
    throw new Error("Dies ist keine unterstützte Dashboard-Datei.");
  }
  const safe = {};
  for (const key of KEYS) if (key in payload.data && !LOCAL_ONLY.has(key)) safe[key] = payload.data[key];
  if (!Array.isArray(safe.movies ?? []) || !Array.isArray(safe.pinnedBookmarkIds ?? [])) {
    throw new Error("Die Datei enthält ungültige Daten.");
  }
  // Kaputte Einträge (null, Zahlen …) nicht übernehmen - sonst scheitert jedes Laden
  if (safe.movies) safe.movies = safe.movies.filter(movie => movie && typeof movie === "object" && !Array.isArray(movie));
  await saveDashboardData(safe);
}
