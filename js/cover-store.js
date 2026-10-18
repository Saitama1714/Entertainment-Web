/*
 * Cover lokal speichern: Jedes Cover wird einmal geladen und im Dashboard
 * abgelegt (Cache Storage der Erweiterung, Name COVER_CACHE). Angezeigt wird
 * weiter die normale Adresse - der Browser nimmt sie ohnehin aus seinem
 * Zwischenspeicher. Klappt das nicht (offline, Adresse nicht mehr gültig),
 * springt das abgelegte Bild ein: Ein Listener auf `window` (Capture, also vor
 * allen anderen) fängt den Ladefehler ab, sucht das Cover hier und setzt es
 * ein. Gibt es keins, läuft der Fehler wie gewohnt weiter (Platzhalter usw.).
 *
 * Gespeichert wird nach und nach im Hintergrund (storeMissingCovers, von
 * Entertainment aus); Cover, die kein Titel mehr nutzt, fliegen dabei raus.
 *
 * Abholen darf die Erweiterung ein Bild nur von Seiten, für die sie die
 * Erlaubnis hat (manifest.json: m.media-amazon.com fest; andere Seiten wie
 * selbst eingetragene Cover nur, wenn du sie unter Einstellungen → Daten
 * erlaubst - optional_host_permissions). Ohne Erlaubnis wird gar nicht erst
 * angefragt (sonst meldet Chrome einen CORS-Fehler); das Cover wird dann ganz
 * normal angezeigt, nur nicht offline abgelegt.
 */

export const COVER_CACHE = "dashboard-covers-v1";
const CONCURRENCY = 3;

/** Nur Web-Adressen werden gespeichert (data:/blob: sind schon lokal). */
export const isStorableCover = url => typeof url === "string" && /^https?:\/\//i.test(url.trim());

const hasCaches = () => typeof caches !== "undefined";
/** Einheitliche Schreibweise der Adresse (wie sie der Cache als Schlüssel führt), oder "". */
const normal = url => { try { return new URL(url.trim()).href; } catch { return ""; } };
const localUrls = new Map(); // Adresse → blob:-Adresse (je Seite)

/**
 * Lokale Kopie eines Covers als blob:-Adresse, oder null.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export async function localCoverUrl(url) {
  if (!hasCaches() || !isStorableCover(url)) return null;
  if (localUrls.has(url)) return localUrls.get(url);
  try {
    const hit = await (await caches.open(COVER_CACHE)).match(normal(url));
    if (!hit) return null;
    const local = URL.createObjectURL(await hit.blob());
    localUrls.set(url, local);
    return local;
  } catch {
    return null;
  }
}

/* Ersatz bei Ladefehlern: vor allen anderen Fehler-Behandlungen */
if (typeof window !== "undefined") {
  window.addEventListener("error", event => {
    const el = event.target;
    const isImg = typeof HTMLImageElement !== "undefined" && el instanceof HTMLImageElement;
    const isSvgImage = typeof SVGImageElement !== "undefined" && el instanceof SVGImageElement;
    if (!isImg && !isSvgImage) return;
    if (el.dataset.coverTried) return; // zweiter Anlauf: normale Fehlerbehandlung
    const url = isImg ? el.getAttribute("src") : el.getAttribute("href");
    if (!isStorableCover(url)) return;
    event.stopImmediatePropagation();
    el.dataset.coverTried = "1";
    localCoverUrl(url).then(local => {
      if (!el.isConnected) return;
      if (local) {
        if (isImg) el.src = local; else el.setAttribute("href", local);
      } else {
        el.dispatchEvent(new Event("error")); // nichts gespeichert: wie bisher weiter
      }
    });
  }, true);
}

/** Ursprung einer Adresse („https://dh.prisma.de"), oder "". */
export const coverOrigin = url => { try { return new URL(url).origin; } catch { return ""; } };

/**
 * Darf die Erweiterung Bilder von diesem Ursprung abholen? Ohne
 * chrome.permissions (z. B. in Tests) gilt: ja.
 * @param {string} origin
 */
export async function mayFetchFrom(origin) {
  const permissions = typeof chrome !== "undefined" ? chrome.permissions : undefined;
  if (!permissions?.contains) return true;
  try { return await permissions.contains({ origins: [`${origin}/*`] }); } catch { return false; }
}

/** Erlaubnis je Ursprung für eine Liste von Adressen (ein Aufruf je Ursprung). */
async function permittedOrigins(urls) {
  const origins = [...new Set(urls.map(coverOrigin).filter(Boolean))];
  const allowed = new Set();
  await Promise.all(origins.map(async origin => { if (await mayFetchFrom(origin)) allowed.add(origin); }));
  return allowed;
}

/**
 * Bittet um die Erlaubnis, Cover von diesen Seiten abzuholen (nur aus einem
 * Klick heraus aufrufen - Chrome fragt nach).
 * @param {string[]} origins - z. B. ["https://dh.prisma.de"]
 * @returns {Promise<boolean>}
 */
export async function requestCoverOrigins(origins) {
  const permissions = typeof chrome !== "undefined" ? chrome.permissions : undefined;
  if (!permissions?.request || !origins.length) return false;
  try { return await permissions.request({ origins: origins.map(origin => `${origin}/*`) }); } catch { return false; }
}

/**
 * Speichert fehlende Cover im Hintergrund und räumt nicht mehr genutzte weg.
 * @param {Array<{cover?: string}>} movies
 * @param {{onProgress?: (stored: number, total: number) => void}} [options]
 * @returns {Promise<{stored: number, total: number, added: number}>}
 */
export async function storeMissingCovers(movies, { onProgress = () => {} } = {}) {
  const wanted = [...new Set(movies.map(movie => movie.cover).filter(isStorableCover).map(normal).filter(Boolean))];
  if (!hasCaches()) return { stored: 0, total: wanted.length, added: 0 };
  const cache = await caches.open(COVER_CACHE);
  const keys = await cache.keys();
  const have = new Set(keys.map(request => request.url));
  // nicht mehr genutzte Cover entfernen
  const wantedSet = new Set(wanted);
  await Promise.all(keys.filter(request => !wantedSet.has(request.url)).map(request => cache.delete(request)));
  const allowed = await permittedOrigins(wanted);
  // Nur von Seiten mit Erlaubnis abholen - andere gar nicht erst anfragen
  const missing = wanted.filter(url => !have.has(url) && allowed.has(coverOrigin(url)));
  let stored = wanted.filter(url => have.has(url)).length, added = 0;
  onProgress(stored, wanted.length);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { stored, total: wanted.length, added };
  const worker = async () => {
    while (missing.length) {
      const url = missing.shift();
      try {
        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (response.ok && (response.headers.get("content-type") || "").startsWith("image/")) {
          await cache.put(url, response);
          stored++; added++;
          onProgress(stored, wanted.length);
        }
      } catch { /* nicht erreichbar oder nicht erlaubt: beim nächsten Mal wieder */ }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { stored, total: wanted.length, added };
}

/**
 * Wie viele der Cover liegen schon lokal - und von welchen Seiten fehlt die
 * Erlaubnis zum Abholen?
 * @param {Array<{cover?: string}>} movies
 * @returns {Promise<{stored: number, total: number, blocked: number, blockedOrigins: string[]}>}
 */
export async function coverStoreStatus(movies) {
  const wanted = [...new Set(movies.map(movie => movie.cover).filter(isStorableCover).map(normal).filter(Boolean))];
  const allowed = await permittedOrigins(wanted);
  const blockedUrls = wanted.filter(url => !allowed.has(coverOrigin(url)));
  const blockedOrigins = [...new Set(blockedUrls.map(coverOrigin))].sort();
  const result = { stored: 0, total: wanted.length, blocked: blockedUrls.length, blockedOrigins };
  if (!hasCaches()) return result;
  try {
    const have = new Set((await (await caches.open(COVER_CACHE)).keys()).map(request => request.url));
    return { ...result, stored: wanted.filter(url => have.has(url)).length };
  } catch {
    return result;
  }
}
