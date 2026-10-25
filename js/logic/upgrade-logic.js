/*
 * „Upgrade" – „Das Kopierwerk" (Registerkarte unter Entertainment, nur
 * Dashboard): Lieblinge, die noch auf DVD oder Blu-ray im Regal stehen,
 * sortiert danach, wie sehr sich der Sprung auf 4K (oder günstiger auf
 * Blu-ray) lohnt. Dazu die Merkliste („Auftragsschein") mit „Gekauft".
 * Reine Funktionen, getestet in tests/upgrade.test.mjs; Oberfläche in
 * js/ui/upgrade.js.
 *
 * Das Medium kommt aus der IMDb-Liste „Filmsammlung" (beim Import gewinnt
 * IMDb). „Gekauft" ändert deshalb nichts am Titel, sondern wird in
 * `upgradeList` gemerkt; meldet der Import das neue Medium, räumt
 * `tidyUpgradeList` den Eintrag weg.
 *
 * „Nicht upgraden" (2.40.1): state "skip" – der Titel fällt aus beiden
 * Listen, bis er zurückgesetzt wird (im Reiter oder auf der Detailseite).
 * Ein Import ändert daran nichts.
 */
import { ownScore } from "./detail-logic.js";
import { titleKind } from "./movies-logic.js";

/** Ziele: 4K (UHD Blu-ray) oder die günstigere Blu-ray. */
export const UPGRADE_TARGETS = ["4k", "bd"];
export const DEFAULT_TARGET = "4k";
/** Mindestnote je Ziel (umschaltbar 7/8/9). */
export const UPGRADE_MINS = [7, 8, 9];
export const DEFAULT_MIN = { "4k": 9, bd: 8 };

/** Stufe eines Mediums: DVD 1, Blu-ray 2, UHD Blu-ray 3, sonst 0. */
export function mediumRank(medium) {
  return { DVD: 1, "Blu-ray": 2, "UHD Blu-ray": 3 }[String(medium || "").trim()] || 0;
}
/** Stufe, die ein Ziel verlangt. */
export const targetRank = target => (target === "bd" ? 2 : 3);

/** Gewichte des Upgrade-Werts je Ziel (Summe 1). */
export const WEIGHTS = {
  "4k": { note: 0.6, medium: 0.25, reach: 0.15 },
  bd: { note: 0.75, medium: 0, reach: 0.25 },
};
const NOTE = { 10: 1, 9: 0.6, 8: 0.3, 7: 0.1 };
const clamp = v => Math.max(0, Math.min(1, v));
const votesOf = movie => Number(String(movie.numVotes ?? "").replace(/[^\d]/g, "")) || 0;

/**
 * Bestandteile (je 0–1): Note, Medium (DVD bringt den größeren Sprung),
 * Jahr und Bekanntheit (Stimmen logarithmisch, neuere Titel etwas vorn).
 */
export function scoreParts(movie) {
  const you = ownScore(movie) || 0;
  const votes = votesOf(movie);
  const year = Number.parseInt(movie.year, 10) || 0;
  const fame = votes ? clamp((Math.log10(votes) - 4.5) / 2) : 0;
  const age = year ? clamp((year - 1970) / 50) : 0;
  return {
    note: NOTE[you] ?? (you > 10 ? 1 : 0),
    medium: mediumRank(movie.medium) === 1 ? 1 : 0.45,
    reach: 0.6 * fame + 0.4 * age,
  };
}

/** Upgrade-Wert 0–100. */
export function upgradeScore(movie, target = DEFAULT_TARGET) {
  const p = scoreParts(movie), w = WEIGHTS[target] || WEIGHTS[DEFAULT_TARGET];
  return Math.round(100 * (w.note * p.note + w.medium * p.medium + w.reach * p.reach));
}

/** Zustände eines Eintrags: gemerkt, gekauft, nicht upgraden. */
export const UPGRADE_STATES = ["wish", "bought", "skip"];

/** Liste lesen: nur gültige Einträge, je Titel einer (der jüngste gewinnt). */
export function readUpgradeList(value) {
  const list = Array.isArray(value) ? value : [];
  const byId = new Map();
  for (const item of list) {
    if (!item || typeof item.id !== "string" || !UPGRADE_TARGETS.includes(item.target) || !UPGRADE_STATES.includes(item.state)) continue;
    byId.set(item.id, { id: item.id, target: item.target, state: item.state, at: typeof item.at === "string" ? item.at : "" });
  }
  return [...byId.values()];
}

/**
 * Merkliste aufräumen: Einträge zu Titeln, die es nicht mehr gibt oder die
 * das Ziel schon erreicht haben (Import meldet das neue Medium), fallen weg.
 * @returns {{list: Array, done: Array}} done = erledigte Käufe (für eine Meldung)
 */
export function tidyUpgradeList(list, movies) {
  const byId = new Map(movies.map(m => [m.id, m]));
  const keep = [], done = [];
  for (const item of readUpgradeList(list)) {
    const movie = byId.get(item.id);
    if (!movie) continue;
    if (item.state === "skip") { keep.push(item); continue; } // bleibt, bis man zurücksetzt
    if (mediumRank(movie.medium) >= targetRank(item.target)) { if (item.state === "bought") done.push(item); continue; }
    keep.push(item);
  }
  return { list: keep, done };
}

/**
 * Kandidaten für ein Ziel: eigene Note ab `min`, Medium unter dem Ziel (für
 * 4K: DVD und Blu-ray, für Blu-ray: nur DVD), keine Videospiele, nichts, was
 * schon gekauft oder auf „Nicht upgraden" gesetzt ist. Bester Wert zuerst, bei Gleichstand bekannter.
 * @returns {Array<{movie, score: number, parts: object}>}
 */
export function upgradeCandidates(movies, { target = DEFAULT_TARGET, min = DEFAULT_MIN[DEFAULT_TARGET], list = [] } = {}) {
  const bought = new Set(readUpgradeList(list).filter(item => item.state === "bought" || item.state === "skip").map(item => item.id));
  const need = targetRank(target);
  return movies
    .filter(m => {
      const rank = mediumRank(m.medium);
      return rank >= 1 && rank < need && (ownScore(m) || 0) >= min && titleKind(m) !== "game" && !bought.has(m.id);
    })
    .map(movie => ({ movie, score: upgradeScore(movie, target), parts: scoreParts(movie) }))
    .sort((a, b) => b.score - a.score || votesOf(b.movie) - votesOf(a.movie) || String(a.movie.title).localeCompare(String(b.movie.title), "de"));
}

/** Bestand je Medium (für die Zahlen im Kopf). */
export function shelfCounts(movies) {
  const out = { dvd: 0, bd: 0, uhd: 0 };
  for (const m of movies) {
    const rank = mediumRank(m.medium);
    if (rank === 1) out.dvd++; else if (rank === 2) out.bd++; else if (rank === 3) out.uhd++;
  }
  return out;
}

/** Merken (für ein Ziel), nicht mehr merken, gekauft, rückgängig. Gibt eine neue Liste zurück. */
export function setUpgradeItem(list, id, { target, state } = {}, now = new Date()) {
  const rest = readUpgradeList(list).filter(item => item.id !== id);
  if (!state) return rest;
  return [...rest, { id, target: UPGRADE_TARGETS.includes(target) ? target : DEFAULT_TARGET, state, at: now.toISOString() }];
}

/** Eintrag „Nicht upgraden" eines Titels (oder null). */
export const skipOf = (list, id) => readUpgradeList(list).find(item => item.id === id && item.state === "skip") || null;

/** Alle „Nicht upgraden" zurücksetzen (Merken/Gekauft bleiben). */
export const clearSkips = list => readUpgradeList(list).filter(item => item.state !== "skip");

/** Bildpunkte je Medium (für „Was du gewinnst"). */
export const PIXELS = { dvd: 720 * 480, bd: 1920 * 1080, uhd: 3840 * 2160 };
