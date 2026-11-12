import { buildTimeline, readBuildStyle, BUILD_DURATION } from "../logic/page-build-logic.js";
import { igniteBoard } from "./board-ignite.js";

/*
 * Aufbau der Übersicht beim Öffnen (2.44): Die Seite baut sich Stück für
 * Stück auf. Ob er spielt und in welchem Stil, hat js/boot.js schon vor dem
 * ersten Zeichnen entschieden (<html data-build="light|beam|film">) und die
 * Seite so lange dunkel gehalten (css/page-build.css). Hier wird abgespielt:
 *
 * - „Saallicht und Neon" (light): Logo, Kopfleiste, dann der Inhalt von oben
 *   nach unten glimmen auf; die Zitat-Leuchtreklame flackert an wie Neon,
 *   Überschriften zeichnen sich samt Linie von links.
 * - „Lichtkegel" (beam): Am Objektiv des Logos glüht Licht auf, ein Kreis
 *   gibt die Seite frei, ein warmer Strahl schwenkt darüber.
 * - „Filmstreifen" (film): Perforation läuft durch, das Bild flackert wie
 *   beim Anlaufen des Projektors, die Bereiche rasten von unten ein.
 *
 * - „Lichtkegel und Saallicht" (beam-light, 2.45): Lichtkegel, und jedes
 *   Stück glimmt auf, sobald der Lichtkreis es erreicht.
 * - „Filmstreifen und Neon" (film-neon, 2.45): Filmstreifen, danach zündet
 *   die Leuchtreklame und die Überschriften zeichnen sich.
 *
 * Im Foyer zünden dabei die Buchstaben der Programmtafel einzeln
 * (js/ui/board-ignite.js).
 *
 * Läuft der Kinovorhang, beginnt der Aufbau, wenn er (fast) offen ist.
 * Ein Klick, eine Taste oder Scrollen beendet ihn sofort. Gilt für beide
 * Designs (Kino-Noir und Foyer); nur Sichtbares wird bewegt.
 */

const root = document.documentElement;
const EASE = "cubic-bezier(.2, .7, .2, 1)";
const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];

let running = null; // { animations, layers, done }

const shown = element => {
  if (!element || element.offsetParent === null) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
};
const all = selector => [...document.querySelectorAll(selector)].filter(shown);

/** Die Stücke der Seite in Leserichtung, mit Rolle (für den Zeitplan). */
function collectPieces() {
  const pieces = [];
  const seen = new Set();
  const add = (element, role, group) => {
    if (!element || seen.has(element) || !shown(element)) return;
    // Nichts doppelt bewegen: liegt ein Stück schon in einem anderen, entfällt es
    for (const other of seen) if (other.contains(element) || element.contains(other)) return;
    seen.add(element);
    pieces.push({ element, role, group, top: element.getBoundingClientRect().top });
  };
  add(document.querySelector(".brand--medallion"), "logo");
  for (const part of document.querySelectorAll(".appbar-inner > *")) add(part, "bar");
  const quote = document.querySelector(".quote-of-day");
  add(quote?.closest(".foyer-card") || quote, "neon"); // im Foyer flackert die ganze Karte an
  add(document.querySelector(".page-head h1"), "title");
  for (const element of all(".page-head .clock-widget, .foyer-board, .foyer-card, .import-reminder, .backup-reminder, #foyer-kasse")) add(element, "panel");
  for (const element of all(".shell .section-head")) add(element, "head");
  for (const grid of all("#pinned-bookmarks, #movie-preview")) {
    for (const tile of grid.children) add(tile, "tile", grid.id);
  }
  return pieces.sort((a, b) => (a.role === "logo" ? -1 : b.role === "logo" ? 1 : 0));
}

function layer(className, style = {}) {
  const element = document.createElement("div");
  element.className = `page-build-layer ${className}`;
  element.setAttribute("aria-hidden", "true");
  Object.entries(style).forEach(([key, value]) => element.style.setProperty(key, value));
  document.body.append(element);
  running.layers.push(element);
  return element;
}

function animate(element, keyframes, options) {
  const animation = element.animate(keyframes, { fill: "backwards", ...options });
  running.animations.push(animation);
  return animation;
}

/** Ein Stück „Saallicht und Neon": Neon flackert, Überschrift zeichnet sich, sonst glimmt es auf. */
function lightPiece(element, role, delay) {
  const light = root.dataset.theme === "light";
  if (role === "neon") {
    animate(element, [
      { opacity: 0, filter: "brightness(.3)" }, { opacity: .9, filter: "brightness(1.6)", offset: .12 },
      { opacity: .15, offset: .2 }, { opacity: 1, filter: "brightness(1.4)", offset: .32 },
      { opacity: .4, offset: .38 }, { opacity: 1, filter: "brightness(1.25)", offset: .5 },
      { opacity: 1, filter: "brightness(1)" }], { duration: 700, delay });
  } else if (role === "head") {
    animate(element, [{ clipPath: "inset(0 100% 0 0)", opacity: .3 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }], { duration: 520, delay, easing: EASE });
  } else {
    // Im hellen Design ohne dunkle Zwischenstufe (wirkte dort grau)
    const from = light ? "brightness(1.1) saturate(.6)" : "brightness(.25) saturate(.4)";
    animate(element, [
      { opacity: 0, filter: from, transform: "translateY(6px)" },
      { opacity: 1, filter: "brightness(1.45) saturate(1.1)", transform: "none", offset: .55 },
      { opacity: 1, filter: "brightness(1) saturate(1)", transform: "none" }], { duration: 560, delay, easing: EASE });
  }
  if (element.matches(".foyer-board")) board(delay + 150);
}

/** Programmtafel im Foyer: Buchstaben zünden (gehören zum Aufbau, ein Klick beendet sie mit). */
function board(delay) {
  const box = document.querySelector("#foyer-board-lines");
  if (shown(box)) running.animations.push(...igniteBoard(box, { delay }));
}

/* --- Saallicht und Neon ------------------------------------------------- */
function playLight() {
  const pieces = collectPieces();
  const delays = buildTimeline(pieces, { viewport: innerHeight });
  // Grundhelligkeit kommt zuerst, wie Saallicht
  animate(layer("page-build-room"), [{ opacity: .85 }, { opacity: 0 }], { duration: 900, easing: "ease-out", fill: "forwards" });
  pieces.forEach(({ element, role }, index) => lightPiece(element, role, delays[index]));
}

/* --- Lichtkegel des Projektors ------------------------------------------ */
function playBeam() {
  return beamLayers(BUILD_DURATION.beam - 100);
}

/** Dunkelheit, Strahl, Objektivlicht; liefert die Lichtquelle (für die Kombination). */
function beamLayers(total) {
  const logo = document.querySelector(".brand--medallion");
  const box = shown(logo) ? logo.getBoundingClientRect() : { left: 24, top: 12, width: 120, height: 120 };
  // Das Objektiv sitzt rechts der Mitte des Medaillons
  const at = { "--build-x": `${Math.round(box.left + box.width * .78)}px`, "--build-y": `${Math.round(box.top + box.height * .42)}px` };
  animate(layer("page-build-dark", at), [{ "--build-r": "0px" }, { "--build-r": "40px", offset: .15 }, { "--build-r": `${Math.hypot(innerWidth, innerHeight) + 300}px` }], { duration: total, easing: "cubic-bezier(.5, 0, .3, 1)", fill: "forwards" });
  animate(layer("page-build-cone", at), [{ "--build-a": "60deg", opacity: 0 }, { opacity: 1, offset: .12 }, { "--build-a": "150deg", opacity: 1, offset: .75 }, { "--build-a": "170deg", opacity: 0 }], { duration: total, easing: "ease-in-out", fill: "forwards" });
  animate(layer("page-build-lens", at), [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .6 }, { opacity: 0 }], { duration: total, fill: "forwards" });
  if (shown(logo)) animate(logo, [{ filter: "brightness(1)" }, { filter: "brightness(1.5) drop-shadow(0 0 18px rgb(255 200 120 / .7))", offset: .2 }, { filter: "brightness(1)" }], { duration: total, fill: "none" });
  return { x: box.left + box.width * .78, y: box.top + box.height * .42 };
}

/* --- Lichtkegel und Saallicht (2.45) ------------------------------------- */
function playBeamLight() {
  const lens = beamLayers(BUILD_DURATION["beam-light"] - 100);
  const reach = Math.hypot(innerWidth, innerHeight);
  for (const { element, role } of collectPieces()) {
    if (role === "logo") continue; // das Logo leuchtet schon als Projektor
    const box = element.getBoundingClientRect();
    const distance = Math.hypot(box.left + box.width / 2 - lens.x, box.top + box.height / 2 - lens.y) / reach;
    lightPiece(element, role, 220 + Math.pow(distance, .8) * 900); // ungefähr, wenn der Lichtkreis ankommt
  }
}

/* --- Filmstreifen -------------------------------------------------------- */
function playFilm(plain = true) {
  for (const side of ["", "is-right"]) {
    animate(layer(`page-build-strip ${side}`), [{ backgroundPositionY: "0px", opacity: 1 }, { backgroundPositionY: "-1200px", opacity: 1, offset: .75 }, { backgroundPositionY: "-1240px", opacity: 0 }], { duration: BUILD_DURATION.film, easing: "cubic-bezier(.3, 0, .2, 1)", fill: "forwards" });
  }
  const flicker = layer("page-build-room");
  flicker.style.zIndex = 8999;
  animate(flicker, [{ opacity: .9 }, { opacity: .2, offset: .1 }, { opacity: .45, offset: .16 }, { opacity: .05, offset: .3 }, { opacity: .18, offset: .36 }, { opacity: 0 }], { duration: 900, fill: "forwards" });
  const blocks = all(".appbar, .shell > *").filter(element => !element.matches("#import-reminder-slot:empty, #backup-reminder-slot:empty"));
  blocks.forEach((element, index) => {
    animate(element, [
      { transform: "translateY(110px)", opacity: 0, filter: "blur(6px) brightness(1.4)" },
      { transform: "translateY(-7px)", opacity: 1, filter: "blur(0) brightness(1.15)", offset: .72 },
      { transform: "translateY(2px)", offset: .86 },
      { transform: "none", opacity: 1, filter: "none" }], { duration: 640, delay: 100 + Math.min(index, 6) * 110, easing: "cubic-bezier(.25, .8, .3, 1)" });
  });
  if (plain) board(400);
}

/* --- Filmstreifen und Neon (2.45) ---------------------------------------- */
function playFilmNeon() {
  playFilm(false);
  const pieces = collectPieces();
  const quote = pieces.find(piece => piece.role === "neon");
  if (quote) lightPiece(quote.element, "neon", 900);
  pieces.filter(piece => piece.role === "head").forEach((piece, index) => lightPiece(piece.element, "head", 1000 + index * 160));
  board(500);
}

const PLAYERS = { light: playLight, beam: () => { playBeam(); board(350); }, film: () => playFilm(), "beam-light": playBeamLight, "film-neon": playFilmNeon };

/** Alles sofort fertig: Animationen ans Ende, Schichten weg. */
export function finishPageBuild() {
  if (!running) return;
  const { animations, layers, onDone } = running;
  running = null;
  animations.forEach(animation => { try { animation.finish(); } catch { /* schon vorbei */ } });
  layers.forEach(element => element.remove());
  SKIP_EVENTS.forEach(type => removeEventListener(type, finishPageBuild, true));
  delete root.dataset.build;
  root.dataset.buildRun = "done";
  if (onDone) setTimeout(onDone, 350); // Vorschau: kurz die fertige Seite zeigen, dann zurück
}

function start(style, onDone = null) {
  finishPageBuild();
  running = { animations: [], layers: [], onDone };
  const current = running;
  root.dataset.buildRun = style;
  PLAYERS[style]();
  SKIP_EVENTS.forEach(type => addEventListener(type, finishPageBuild, { capture: true, passive: true }));
  // Ende: wenn die letzte Animation durch ist (Tafel im Foyer kann länger dauern)
  const end = Math.max(BUILD_DURATION[style], ...current.animations.map(animation => {
    const timing = animation.effect?.getTiming?.() || {};
    return (Number(timing.delay) || 0) + (Number(timing.duration) || 0);
  }));
  setTimeout(() => { if (running === current) finishPageBuild(); }, end + 150);
}

/** Wartet, bis der Kinovorhang (fast) offen ist - höchstens bis maxMs. */
function afterCurtain(callback, maxMs = 1900) {
  const playing = () => ["playing", "holding"].includes(root.dataset.curtainPhase);
  if (!playing()) { callback(); return; }
  const begin = performance.now();
  const timer = setInterval(() => {
    if (!playing() || (root.dataset.curtainPhase === "playing" && performance.now() - begin > maxMs)) {
      clearInterval(timer);
      callback();
    }
  }, 50);
}

/**
 * Spielt den Aufbau, wenn js/boot.js ihn für diesen Tab vorgesehen hat.
 * Aufrufen, sobald die Übersicht gezeichnet ist.
 */
export function playPageBuild() {
  const style = root.dataset.build;
  if (!style) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) {
    delete root.dataset.build;
    return;
  }
  // Zwei Bilder warten: Schriften und Cover sitzen, die Positionen stimmen
  afterCurtain(() => requestAnimationFrame(() => requestAnimationFrame(() => start(readBuildStyle(style)))));
}

/**
 * Vorschau aus den Einstellungen: spielt sofort (Seite muss die Übersicht
 * sein). onDone läuft, wenn sie durch ist oder abgebrochen wurde (2.45:
 * zurück in die Einstellungen).
 */
export function previewPageBuild(style, { onDone = null } = {}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  scrollTo({ top: 0 });
  root.dataset.build = readBuildStyle(style);
  start(readBuildStyle(style), onDone);
  return true;
}
