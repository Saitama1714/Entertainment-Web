/*
 * Design „Foyer" (2.41): zweites Design neben Kino-Noir, umschaltbar in den
 * Einstellungen (`design`). Reine Funktionen - Spule (Navigation), Saalschilder,
 * Programmtafel und Kasse. Oberfläche in js/ui/foyer.js, Aussehen in
 * css/foyer.css; getestet in tests/foyer.test.mjs.
 *
 * Am Handy und in schmalen Fenstern gilt immer Kino-Noir (Nutzerwunsch);
 * wer dort die Desktop-Ansicht wählt, bekommt ein breites Fenster und damit
 * das Foyer.
 */
import { titleKind } from "./movies-logic.js";

export const DESIGNS = ["noir", "foyer"];
export const DEFAULT_DESIGN = "noir";
/** Ab dieser Fensterbreite darf das Foyer erscheinen (darunter Kino-Noir, wie die Handy-Grenze im Styleguide). */
export const FOYER_MIN_WIDTH = 681;

/** Gespeicherter Wert → "noir" | "foyer". */
export const readDesign = value => (DESIGNS.includes(value) ? value : DEFAULT_DESIGN);

/** Gilt das Foyer gerade (gewählt und breit genug)? */
export const foyerActive = (design, width) => readDesign(design) === "foyer" && Number(width) >= FOYER_MIN_WIDTH;

/* ---- Säle --------------------------------------------------------------- */

/** Die Reiter unter Entertainment als Säle (Reihenfolge wie die Reiterleiste). */
export const SAAL_ROOMS = [
  { tab: "titles", name: "Titel", line: "Alle Titel der Kinothek – suchen, filtern, sortieren" },
  { tab: "timeline", name: "Zeitleiste", line: "Die Kinothek als Cover-Strom – nach Erscheinen oder Bewertung" },
  { tab: "universe", name: "Filmuniversum", line: "Jeder Titel ein Stern, jedes Genre eine Galaxie" },
  { tab: "stats", name: "Heute", line: "Was passt heute? Eingrenzen und einen ziehen" },
  { tab: "year", name: "Filmjahr", line: "Dein Jahr in Filmen, Akt für Akt" },
  { tab: "duel", name: "Du gegen IMDb", line: "Das Duell – deine Wertung gegen die der Welt" },
  { tab: "upgrade", name: "Upgrade", line: "Das Kopierwerk – was den Sprung auf 4K verdient" },
];

/**
 * Saalschild eines Reiters mit den Nachbarsälen (ringsum, wie die Pfeiltasten in der Reiterleiste).
 * @param {string} tab
 * @param {string[]} [available] - Reiter, die es auf der Seite gibt (fehlende werden übersprungen)
 */
export function saalInfo(tab, available = SAAL_ROOMS.map(room => room.tab)) {
  const rooms = SAAL_ROOMS.filter(room => available.includes(room.tab));
  const index = Math.max(0, rooms.findIndex(room => room.tab === tab));
  const room = rooms[index] || SAAL_ROOMS[0];
  const at = step => rooms[(index + step + rooms.length) % rooms.length];
  return { number: 2, ...room, compact: room.tab !== "titles", prev: at(-1), next: at(1) };
}

/* ---- Spule ----------------------------------------------------------------- */

/**
 * Ziele der Spule. Innen die vier Bereiche, außen die Säle von Entertainment.
 * @param {{page: string, tab?: string, base?: string, available?: string[]}} where
 *   page: "home" | "bookmarks" | "movies" | "detail"; base: Pfad zur Wurzel ("" oder "../").
 * @returns {{inner: Array, outer: Array}} Einträge {id, label, sub, href?, action?, current}
 */
export function spoolItems({ page, tab = "", base = "", available } = {}) {
  const views = base ? "" : "views/";
  const rooms = SAAL_ROOMS.filter(room => !available || available.includes(room.tab));
  const inner = [
    { id: "home", label: "Foyer", sub: "Übersicht", href: `${base}index.html` },
    { id: "bookmarks", label: "Lesezeichen", sub: "Saal 1", href: `${views}bookmarks.html` },
    { id: "movies", label: "Entertainment", sub: "Saal 2", href: `${views}movies.html` },
    { id: "settings", label: "Vorführraum", sub: "Einstellungen", action: "settings" },
  ].map(item => ({ ...item, current: item.id === page || (page === "detail" && item.id === "movies") }));
  const outer = rooms.map(room => ({
    id: `tab-${room.tab}`, label: room.name, sub: "",
    href: `${views}movies.html?view=${room.tab}`,
    action: page === "movies" ? "tab" : undefined,
    tab: room.tab,
    current: page === "movies" && room.tab === tab,
  }));
  for (const item of inner) if (item.current) item.sub = `${item.sub} · hier bist du`;
  return { inner, outer };
}

/** Rand zum Fenster, den die aufgeklappte Nabe mindestens hält (Styleguide-Ergänzung 1: --s-5). */
export const SPOOL_MARGIN = 22;

/**
 * Mittelpunkt der aufgeklappten Spule: dort, wo das Medaillon sitzt - aber so
 * weit nach innen gerückt, dass die vergrößerte Nabe samt Leuchten ganz im
 * Fenster bleibt. Seit 2.41.3 sitzt der Spulen-Knopf oben rechts; mit
 * `viewportWidth` hält die Nabe auch zum rechten Rand Abstand.
 * @param {{x: number, y: number}} medal - Mittelpunkt des Knopfs bzw. Medaillons
 * @param {number} hubRadius - Radius der vergrößerten Nabe (mit Leuchten)
 * @param {number} [margin]
 * @param {number} [viewportWidth]
 */
export function spoolCenter(medal, hubRadius, margin = SPOOL_MARGIN, viewportWidth = Infinity) {
  const min = hubRadius + margin;
  return { x: Math.min(Math.max(medal.x, min), viewportWidth - min), y: Math.max(medal.y, min) };
}

/** Maße der aufgeklappten Spule (px bei voller Größe). */
export const SPOOL = {
  hub: 164,          // Durchmesser der Nabe (Logo)
  glow: 14,          // Leuchten um die Nabe
  innerR: 210,       // Bogen der vier Bereiche
  outerR: 590,       // Bogen der Säle
  innerGap: 64,      // senkrechter Abstand der Bereiche
  outerGap: 62,      // senkrechter Abstand der Säle
  innerLabel: 340,   // größte Breite einer Bereichs-Beschriftung (mit Unterzeile)
  outerLabel: 270,   // größte Breite eines Saal-Namens
  margin: 32,        // Rand zum Fenster
};

/**
 * Lage aller Beschriftungen der Spule (2.41.1): zwei Bögen um die Nabe, auf
 * jedem Bogen gleiche senkrechte Abstände; der äußere Bogen liegt so weit
 * draußen, dass sich die Beschriftungen beider Bögen nie überdecken. Wird das
 * Fenster knapp, schrumpft alles gemeinsam (`scale`, höchstens bis 0,6).
 * `side: "right"` (seit 2.41.3, Knopf oben rechts): alles gespiegelt, die
 * Bögen öffnen sich nach links; `x` ist dann der rechte Rand der Beschriftung
 * (dort sitzt der Punkt), die Schrift läuft nach links.
 * @param {{x: number, y: number}} medal - Mittelpunkt des Knopfs bzw. Medaillons
 * @param {{width: number, height: number}} viewport
 * @param {{inner: number, outer: number, side?: "left"|"right"}} counts
 */
export function spoolLayout(medal, viewport, { inner, outer, side = "left" }) {
  const dir = side === "right" ? -1 : 1;
  const center = spoolCenter(medal, SPOOL.hub / 2 + SPOOL.glow, SPOOL_MARGIN, viewport.width);
  const room = dir > 0 ? viewport.width - center.x : center.x;
  const byWidth = (room - SPOOL.margin) / (SPOOL.outerR + SPOOL.outerLabel);
  const byHeight = (viewport.height - center.y - SPOOL.margin - 30) / Math.max(1, (outer - 1) * SPOOL.outerGap);
  const scale = Math.round(Math.max(0.6, Math.min(1, byWidth, byHeight)) * 1000) / 1000;
  const ring = (count, radius, gap) => Array.from({ length: count }, (_, i) => {
    const dy = i * gap * scale;
    const r = radius * scale;
    return { x: Math.round(center.x + dir * Math.sqrt(Math.max(0, r * r - dy * dy))), y: Math.round(center.y + dy) };
  });
  return {
    center, scale, side: dir > 0 ? "left" : "right",
    innerR: Math.round(SPOOL.innerR * scale),
    outerR: Math.round(SPOOL.outerR * scale),
    reel: Math.round(2 * (SPOOL.innerR - 46) * scale),
    inner: ring(inner, SPOOL.innerR, SPOOL.innerGap),
    outer: ring(outer, SPOOL.outerR, SPOOL.outerGap),
    caption: { x: Math.round(center.x + dir * (SPOOL.outerR * scale - 12)), y: Math.round(center.y - 52 * scale) },
  };
}

/* ---- Programmtafel und Kasse --------------------------------------------- */

/** Zufallsfolge aus einem Text (gleicher Text → gleiche Folge). */
export function seededRandom(text) {
  let seed = 2166136261;
  for (const char of String(text)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zwei Titel für die Programmtafel: „Jetzt" und „Danach" - noch nicht
 * gesehene Filme und Serien (keine Spiele), für den Tag fest, „Neu stecken"
 * zählt `round` hoch. Ohne Offene: die bestbewerteten.
 * @param {Array} movies
 * @param {{day: string, round?: number}} options
 */
export function programmPicks(movies, { day, round = 0 } = {}) {
  const watchable = movies.filter(movie => titleKind(movie) !== "game");
  let pool = watchable.filter(movie => !movie.seen);
  if (!pool.length) pool = [...watchable].sort((a, b) => (Number(b.yourRating) || 0) - (Number(a.yourRating) || 0)).slice(0, 12);
  const rng = seededRandom(`${day}#${round}`);
  const shuffled = [...pool].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 2);
}

/** Steckbuchstaben: Großbuchstaben, höchstens `max` Zeichen (sonst mit „…"); lange Titel brechen auf der Tafel um. */
export function boardText(text, max = 80) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().toLocaleUpperCase("de-DE").replace(/ß/g, "SS");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

const WEEKDAYS = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"];
const MONTHS = ["JANUAR", "FEBRUAR", "MÄRZ", "APRIL", "MAI", "JUNI", "JULI", "AUGUST", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DEZEMBER"];

/**
 * Zeilen der Programmtafel.
 * @returns {Array<{tag?: string, text: string}>}
 */
export function boardLines({ date = new Date(), picks = [], openCount = 0 } = {}) {
  const lines = [{ text: `${WEEKDAYS[date.getDay()]} · ${date.getDate()}. ${MONTHS[date.getMonth()]}` }];
  if (picks[0]) lines.push({ tag: "JETZT", text: boardText(picks[0].title) });
  if (picks[1]) lines.push({ tag: "DANACH", text: boardText(picks[1].title) });
  lines.push({ text: openCount === 1 ? "1 FILM WARTET" : openCount ? `${openCount.toLocaleString("de-DE")} FILME WARTEN` : "ALLES GESEHEN" });
  return lines;
}

/** Offene Filme und Serien (ohne Spiele) - „… Filme warten" auf der Tafel. */
export const openWatchable = movies => movies.filter(movie => !movie.seen && titleKind(movie) !== "game").length;

/** Zahlen für die Eintrittskarte (Kasse) im Foyer. */
export function kasse(movies) {
  const total = movies.length;
  const seen = movies.filter(movie => movie.seen).length;
  return { total, seen, open: total - seen, percent: total ? Math.round(100 * seen / total) : 0 };
}
