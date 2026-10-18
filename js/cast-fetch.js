import { fetchOmdbData, OmdbFatalError } from "./cover.js";
import { CONFIG } from "./utils/constants.js";
import {
  castTargets, parseOmdbCast, readCastData, pruneCastData, nextQuotaReset,
} from "./logic/cast-logic.js";

/*
 * Besetzung nachladen (Darsteller und Drehbuch von OMDb) für die
 * Registerkarte „Besetzung". Läuft im Hintergrund, solange Entertainment
 * offen ist, und merkt sich alles in chrome.storage.local:
 *
 * - `castData`  IMDb-Kennung → {a: Darsteller, w: Drehbuch, d: Regie, t: Datum}.
 *               Getrennt von den Titeln gespeichert, damit sich der Abruf und
 *               das Speichern der Titel (Import, Bearbeiten, andere Tabs) nie
 *               gegenseitig überschreiben. Teil der Sicherung.
 * - `castFetch` {enabled, pausedUntil, lastError, activeAt}: Einmal per Knopf
 *               eingeschaltet (Einstellungen oder Registerkarte), läuft der
 *               Abruf danach bei jedem Öffnen von Entertainment weiter - auch
 *               für neue Titel nach einem Import.
 *
 * OMDb erlaubt rund 1.000 Anfragen am Tag. Am Tageslimit pausiert der Abruf
 * bis nach Mitternacht (UTC) und macht dann von selbst weiter.
 * Cover gehen vor: Titel ohne Cover kommen zuerst dran, und dieselbe Antwort
 * bringt das Cover mit (onCover). Läuft gerade „Fehlende Cover laden",
 * wartet der Abruf (shouldPause).
 * Nur ein Tab ruft gleichzeitig ab (Web Locks).
 */

export const CAST_FETCH_DEFAULTS = { enabled: false, pausedUntil: "", lastError: "", activeAt: "" };
const SAVE_EVERY = 20;
const LOCK = "dashboard-cast-fetch";

/** Liest den gespeicherten Schalter; Kaputtes fällt auf die Standardwerte zurück. */
export function readCastFetch(value) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: v.enabled === true,
    pausedUntil: typeof v.pausedUntil === "string" ? v.pausedUntil : "",
    lastError: typeof v.lastError === "string" ? v.lastError : "",
    activeAt: typeof v.activeAt === "string" ? v.activeAt : "",
  };
}

async function readStored() {
  const stored = await chrome.storage.local.get(["castData", "castFetch"]);
  return { castData: readCastData(stored.castData), castFetch: readCastFetch(stored.castFetch) };
}

/** Ändert den Schalter (nur die übergebenen Werte). */
export async function updateCastFetch(patch) {
  const { castFetch } = await readStored();
  const next = { ...castFetch, ...patch };
  await chrome.storage.local.set({ castFetch: next });
  return next;
}

/**
 * Einschalten (Knopf „Besetzung laden"): hebt auch eine Pause und einen
 * alten Fehler auf - z. B. nach einem neuen OMDb-Schlüssel.
 */
export const enableCastFetch = () => updateCastFetch({ enabled: true, pausedUntil: "", lastError: "" });
export const disableCastFetch = () => updateCastFetch({ enabled: false });

/** Neue Angaben in den aktuellen Stand übernehmen (andere Tabs schreiben ggf. mit). */
async function flush(pending, movies) {
  if (!Object.keys(pending).length) return;
  const { castData } = await readStored();
  const merged = pruneCastData({ ...castData, ...pending }, movies);
  await chrome.storage.local.set({ castData: merged });
  for (const key of Object.keys(pending)) delete pending[key];
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Läuft der Abruf gerade irgendwo (in diesem oder einem anderen Tab)? */
export function castFetchActive(castFetch, now = Date.now()) {
  const at = Date.parse(castFetch.activeAt || "");
  return Number.isFinite(at) && now - at < 90_000;
}

/**
 * Ein Durchgang: holt die fehlende Besetzung, bis alles da ist, das
 * Tageslimit erreicht ist oder ein Fehler weitere Anfragen sinnlos macht.
 * @param {object} options
 * @param {() => Array} options.getMovies - aktueller Stand der Titel.
 * @param {string} options.apiKey
 * @param {() => boolean} [options.shouldPause] - true: jetzt aufhören (z. B. Cover-Abruf läuft).
 * @param {(movieId: string, cover: string) => void} [options.onCover] - Cover aus derselben Antwort.
 * @param {(done: number) => void} [options.onProgress] - nach jedem Titel.
 * @returns {Promise<"done"|"paused"|"off"|"busy"|"error"|"stopped"|"nokey">}
 */
export async function runCastFetch({ getMovies, apiKey, shouldPause = () => false, onCover = () => {}, onProgress = () => {} }) {
  if (!apiKey) return "nokey";
  const start = await readStored();
  if (!start.castFetch.enabled) return "off";
  if (start.castFetch.pausedUntil && Date.parse(start.castFetch.pausedUntil) > Date.now()) return "paused";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "stopped";

  const work = async () => {
    const { castData } = await readStored();
    const targets = castTargets(getMovies(), castData);
    if (!targets.length) {
      await updateCastFetch({ pausedUntil: "", lastError: "" });
      return "done";
    }
    const pending = {};
    let done = 0;
    let result = "done";
    await updateCastFetch({ activeAt: new Date().toISOString(), pausedUntil: "" });
    for (const movie of targets) {
      const { castFetch } = await readStored();
      if (!castFetch.enabled) { result = "off"; break; }
      if (shouldPause()) { result = "stopped"; break; }
      try {
        const data = await fetchOmdbData(movie.imdbId, apiKey);
        pending[movie.imdbId] = parseOmdbCast(data || {});
        const poster = data?.Poster && data.Poster !== "N/A" ? data.Poster : "";
        if (poster) onCover(movie.id, poster);
      } catch (error) {
        if (error instanceof OmdbFatalError) {
          if (error.kind === "limit") {
            await flush(pending, getMovies());
            await updateCastFetch({ pausedUntil: nextQuotaReset(Date.now()), activeAt: "" });
            return "paused";
          }
          if (error.kind === "key") {
            await flush(pending, getMovies());
            await updateCastFetch({ lastError: error.message, activeAt: "" });
            return "error";
          }
          result = "stopped"; // kein Netz: beim nächsten Öffnen weiter
          break;
        }
        // Serverfehler bei diesem einen Titel: auslassen, beim nächsten Mal wieder
      }
      done++;
      onProgress(done);
      if (Object.keys(pending).length >= SAVE_EVERY) {
        await flush(pending, getMovies());
        await updateCastFetch({ activeAt: new Date().toISOString() });
      }
      await wait(CONFIG.OMDB_FETCH_DELAY_MS);
    }
    await flush(pending, getMovies());
    await updateCastFetch(result === "done" ? { activeAt: "", lastError: "" } : { activeAt: "" });
    return result;
  };

  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(LOCK, { ifAvailable: true }, lock => (lock ? work() : "busy"));
  }
  return work();
}
