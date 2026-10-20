import { normalizeMovies } from "../collection.js";
import { setImportWindowDays } from "../logic/movies-logic.js";
import { readAccess } from "../logic/access-logic.js";
import { readCastData } from "../logic/cast-logic.js";
import { readThreshold } from "../logic/duel-logic.js";
import { setIncluded } from "../utils/host.js";

/*
 * Nur Website (Entertainment-Web, <html data-site>): Daten kommen aus
 * data/sammlung.json statt aus chrome.storage. js/storage.js leitet
 * loadState() und saveDashboardData() auf der Website hierher um - die Seiten
 * des Dashboards laufen dadurch unverändert, nur lesend.
 *
 * Gespeichert wird auf der Website nur die Ansicht (Registerkarte, Suche,
 * Filter, Sortierung …) für die Dauer des Besuchs (sessionStorage), damit
 * man nach einer Detailseite dort weitermacht, wo man war.
 */

export const DATA_URL = "data/sammlung.json";
const VIEW_KEY = "site:view";

/**
 * Bringt den Inhalt der Datendatei in die Form, die die Seiten erwarten.
 * Reine Funktion (tests/site.test.mjs).
 * @param {*} data - geparste data/sammlung.json (js/logic/publish-logic.js).
 * @throws {Error} bei unbekanntem Format.
 */
export function parseCollection(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.movies)) throw new Error("Die Datendatei hat ein unbekanntes Format.");
  const include = Array.isArray(data.include) ? data.include.map(String) : [];
  const has = key => include.includes(key);
  // newMovie() setzt bei fehlendem Medium „DVD" (Altbestand im Dashboard) -
  // hier heißt ein fehlendes Medium immer „keins"
  const movies = normalizeMovies(data.movies
    .filter(movie => movie && typeof movie === "object" && !Array.isArray(movie))
    .map(movie => ({ ...movie, medium: has("medium") && typeof movie.medium === "string" ? movie.medium : "" })));
  return {
    movies,
    include,
    importWindowDays: Number(data.importWindowDays) > 0 ? Number(data.importWindowDays) : 28,
    exportedAt: String(data.exportedAt || ""),
    generatedAt: String(data.generatedAt || ""),
    decor: typeof data.decor === "string" ? data.decor : "", // "" = Standard der Website
    access: readAccess(data.access), // Prüfwert für den Einlass, null = ohne Passwort
    castData: readCastData(data.cast), // Besetzung je IMDb-Kennung (ältere Dateien: keine)
    duelThreshold: readThreshold(data.duelThreshold), // Schwelle „Ich gegen IMDb" wie im Dashboard (ältere Dateien: 1,5)
  };
}

/** „Stand: 1. Oktober 2026" - Zeitpunkt der Sicherung, aus der die Datei entstand. */
export function standLabel(collection) {
  const time = Date.parse(collection.exportedAt || collection.generatedAt || "");
  if (!Number.isFinite(time)) return "";
  return `Stand: ${new Date(time).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`;
}

function readView() {
  try { return JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null"); } catch { return null; }
}

let cache = null;

/**
 * Zustand wie loadState() im Dashboard - aus der Datendatei. Einmal pro Seite.
 * @throws {Error} wenn die Datei fehlt oder kaputt ist (Text für die Seite).
 */
export function loadSiteState() {
  cache ??= fetch(DATA_URL, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Die Datendatei fehlt (${DATA_URL}).`);
      return response.json();
    })
    .then(data => {
      const collection = parseCollection(data);
      setIncluded(collection.include);
      setImportWindowDays(collection.importWindowDays); // Filter „Import" wie im Dashboard
      return {
        ...collection,
        site: true,
        omdbApiKey: "",
        castFetch: null, // kein Abruf auf der Website
        entertainmentView: readView(),
      };
    });
  return cache;
}

/**
 * „Speichern" auf der Website: nur die Ansicht, nur für diesen Besuch.
 * Alles andere (Titel, Einstellungen) gibt es hier nicht zu speichern.
 */
export async function saveSiteData(partial) {
  if (!("entertainmentView" in partial)) return;
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(partial.entertainmentView)); } catch { /* ohne Speicher: beim Zurückkommen eben neu */ }
}

/** Gemerkte Ansicht dieses Besuchs (z. B. für das Blättern auf der Detailseite). */
export const siteView = readView;
