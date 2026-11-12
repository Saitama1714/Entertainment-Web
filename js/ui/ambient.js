import { coverPalette, glowTone, cssTriplet, packPalette, unpackPalette } from "../logic/ambient-logic.js";
import { localCoverUrl, isStorableCover, coverOrigin, mayFetchFrom } from "../cover-store.js";

/*
 * Cover-Stimmung (2.42): Jedes Cover gibt seine Farbe an die Umgebung ab -
 * als Lichtschein auf der Detailseite und als Leuchten, wenn man im Raster
 * über ein Cover fährt. Die Farben bestimmt js/logic/ambient-logic.js aus
 * einer winzigen Kopie des Bildes; gemerkt werden sie in localStorage
 * („dashboard:ambient"), damit jedes Cover nur einmal gerechnet wird.
 *
 * Das Bild kommt aus dem lokalen Cover-Speicher oder - mit Erlaubnis für die
 * Seite - frisch geladen. Klappt beides nicht (z. B. auf der Website ohne
 * CORS), bleibt es beim neutralen Messington; der Rest der Seite merkt davon
 * nichts.
 */

const STORE_KEY = "dashboard:ambient";
const MAX_ENTRIES = 3000;
const SAMPLE_W = 24, SAMPLE_H = 36;

let memory = null;          // Adresse → gepackte Palette ("r,g,b;r,g,b" oder "-")
const running = new Map();  // Adresse → laufende Berechnung
let saveTimer = 0;

function load() {
  if (memory) return memory;
  memory = new Map();
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    for (const [url, packed] of Object.entries(stored)) memory.set(url, packed);
  } catch { /* privat oder voll - dann eben ohne Gedächtnis */ }
  return memory;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const entries = [...memory].slice(-MAX_ENTRIES); // älteste fallen raus
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* egal - nächstes Mal wird neu gerechnet */ }
  }, 400);
}

/** Das Cover als Blob: lokal abgelegt, sonst frisch (nur mit Erlaubnis). */
async function coverBlob(url) {
  const local = await localCoverUrl(url);
  if (local) return (await fetch(local)).blob();
  if (!(await mayFetchFrom(coverOrigin(url)))) return null;
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  return response.ok ? response.blob() : null;
}

/** Winzige Kopie zeichnen und die Pixel lesen. */
async function samplePixels(blob) {
  const bitmap = await createImageBitmap(blob, { resizeWidth: SAMPLE_W, resizeHeight: SAMPLE_H, resizeQuality: "low" });
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(SAMPLE_W, SAMPLE_H)
    : Object.assign(document.createElement("canvas"), { width: SAMPLE_W, height: SAMPLE_H });
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, SAMPLE_W, SAMPLE_H);
  bitmap.close?.();
  return context.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
}

/**
 * Tragende Farben eines Covers (gemerkt), oder null.
 * @param {string} url
 * @returns {Promise<{primary: object, secondary: object}|null>}
 */
export function coverAmbient(url) {
  if (!isStorableCover(url)) return Promise.resolve(null);
  const known = load().get(url);
  if (known !== undefined) return Promise.resolve(unpackPalette(known));
  if (running.has(url)) return running.get(url);
  const job = (async () => {
    try {
      const blob = await coverBlob(url);
      if (!blob) return null; // nicht abrufbar: nicht merken, vielleicht klappt es später
      const palette = coverPalette(await samplePixels(blob));
      memory.set(url, packPalette(palette));
      save();
      return palette;
    } catch {
      return null;
    } finally {
      running.delete(url);
    }
  })();
  running.set(url, job);
  return job;
}

const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";

/**
 * Farben als CSS-Variablen setzen (--amb-1, --amb-2 als „r g b") oder entfernen.
 * @param {HTMLElement} element
 * @param {{primary: object, secondary: object}|null} palette
 */
export function applyAmbient(element, palette) {
  if (!palette) {
    element.style.removeProperty("--amb-1");
    element.style.removeProperty("--amb-2");
    return;
  }
  element.style.setProperty("--amb-1", cssTriplet(glowTone(palette.primary, theme())));
  element.style.setProperty("--amb-2", cssTriplet(glowTone(palette.secondary, theme())));
}

/* Raster: beim ersten Darüberfahren die Farbe des Covers holen; das Leuchten
   selbst macht CSS (.movie-card[data-amb="1"]:hover, css/collection.css). */
function onCardHover(event) {
  const card = event.target.closest?.(".movie-card");
  if (!card || card.dataset.amb) return;
  const url = card.querySelector("img.cover-image")?.getAttribute("src");
  if (!isStorableCover(url)) return;
  card.dataset.amb = "…";
  coverAmbient(url).then(palette => {
    applyAmbient(card, palette);
    card.dataset.amb = palette ? "1" : "0";
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("pointerover", onCardHover, { passive: true });
  document.addEventListener("focusin", onCardHover);
}
