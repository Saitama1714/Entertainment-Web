import { $ } from "../utils/dom.js";
import { CURTAIN_ICON_MARKUP } from "./curtain-icons.js";
import { createCurtainTimeline, normalizeCurtainStyle, restFrame, restWidth } from "../logic/curtain-motion.js";
import { createCurtainRenderer } from "./curtain-gl.js";

/**
 * Zeigt die in den Einstellungen gewählte Dekoration unten links an (oder
 * blendet sie aus, wenn "Kein Symbol" gewählt ist).
 * @param {object} state - Dashboard-Zustand mit state.curtainIcon.
 * @param {object} [options]
 * @param {boolean} [options.instant=false] - true bei einer nachträglichen
 *   Änderung in den Einstellungen: zeigt/versteckt sofort, ohne die
 *   Eintritts-Animation erneut abzuspielen (die läuft nur beim ersten Laden
 *   der Seite ab, gesteuert allein über CSS).
 */
export function renderCornerDecoration(state, { instant = false } = {}) {
  const el = $("#corner-decor");
  if (!el) return;

  const markup = CURTAIN_ICON_MARKUP[state.curtainIcon];
  el.classList.toggle("corner-decor--empty", !markup);
  el.classList.toggle("corner-decor--instant", instant);
  el.innerHTML = markup || "";
}

/*
 * Kino-Intro der Startseite (Stile in css/curtain.css).
 *
 * Stil "classic": reine CSS-Animation wie bisher - hier wird nur die
 * Fensterbreite nachgemessen und der Endzustand fixiert.
 *
 * Stile "fabric", "theater", "atmosphere": gezeichnet mit WebGL
 * (js/ui/curtain-gl.js), Bewegung aus js/logic/curtain-motion.js. Bis zum
 * ersten WebGL-Bild steht der CSS-Vorhang geschlossen da (gleiche Farben);
 * dann wird weich übergeblendet. Im Ruhezustand liegen nur noch zwei schmale
 * Bilder in den Randstreifen - die WebGL-Fläche wird freigegeben.
 *
 * Sicherheitsnetze: Ohne WebGL (oder bei Fehlern) übernimmt die klassische
 * CSS-Animation; startet dieses Skript gar nicht, öffnet CSS den Vorhang nach
 * 1,5 s von selbst.
 *
 * Zustand für Tests und CSS: <html data-curtain-phase="playing|rest">,
 * während eine WebGL-Animation läuft zusätzlich data-curtain-playing (hält
 * die Ecken-Deko zurück, bis der Vorhang offen ist).
 */

const root = document.documentElement;
const CROSSFADE_MS = 200;       // CSS-Vorhang -> WebGL-Vorhang
const REPLAY_FADE_MS = 260;     // Vorschau: geschlossener Vorhang blendet ein
const CLASSIC_DECOR_MS = 1800;  // klassischer Ablauf: Deko nach dem Öffnen

let gl = null;         // laufende/ruhende WebGL-Vorhänge (siehe startGl)
let renderer = null;   // einmal angelegt, auch nach einem Wechsel auf "Klassisch" wiederverwendet
let decorTimer = 0;
let releaseTimer = 0;
let resizeQueued = false;
let containerMax = 0;  // Breite des Inhaltsbereichs (--container-max), einmal gelesen

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const curtainEls = () => [...document.querySelectorAll(".curtain")];

/** Fenstermaße in CSS-Pixeln (ohne Scrollleiste) und Ruhebreite des Vorhangs. */
function geometry() {
  const viewW = root.clientWidth;
  const viewH = root.clientHeight;
  const narrow = window.matchMedia("(max-width: 1535px)").matches;
  if (!containerMax) containerMax = parseFloat(getComputedStyle(root).getPropertyValue("--container-max")) || 1440;
  return { viewW, viewH, W: viewW / 2 + 2, H: viewH, R: restWidth(viewW, narrow, containerMax) };
}

/* ---------------------------------------------------------------------------
 * Ecken-Deko: erscheint, sobald der Vorhang (fast) offen ist
 * ------------------------------------------------------------------------ */

function holdDecor() {
  clearTimeout(decorTimer);
  $("#corner-decor")?.classList.remove("is-cued");
  root.dataset.curtainPlaying = "";
}

function cueDecor() {
  clearTimeout(decorTimer);
  $("#corner-decor")?.classList.add("is-cued");
}

/* ---------------------------------------------------------------------------
 * Klassisch (CSS)
 * ------------------------------------------------------------------------ */

function markRest() {
  root.dataset.curtainPhase = "rest";
  delete root.dataset.curtainPlaying;
}

function playClassic({ replay }) {
  if (!replay) {
    root.dataset.curtainPhase = root.dataset.intro === "skip" || reducedMotion() ? "rest" : "playing";
    return;
  }
  holdDecor();
  root.dataset.curtainPhase = "playing";
  for (const curtain of curtainEls()) {
    curtain.classList.remove("curtain--rest", "curtain--replay");
    void curtain.offsetWidth; // Reflow: Animation neu starten
    curtain.classList.add("curtain--replay");
  }
  decorTimer = setTimeout(cueDecor, CLASSIC_DECOR_MS);
}

/** Zurück zur reinen CSS-Darstellung (klassisch oder als Rückfallebene). */
function dropGl({ atRest }) {
  if (gl) {
    cancelAnimationFrame(gl.raf);
    gl.stage.hidden = true;
    gl.renderer.release();
  }
  gl = null;
  root.dataset.curtain = "classic";
  root.style.removeProperty("--curtain-lum");
  for (const curtain of curtainEls()) {
    curtain.classList.remove("curtain--gl", "curtain--baked");
    curtain.style.removeProperty("width");
    curtain.style.removeProperty("animation-play-state");
    curtain.getAnimations().forEach(animation => { if (!(animation instanceof CSSAnimation)) animation.cancel(); });
    curtain.querySelector(".curtain-fabric")?.getAnimations().forEach(animation => animation.cancel());
    if (atRest) curtain.classList.add("curtain--rest");
  }
  if (atRest) { markRest(); cueDecor(); }
}

/* ---------------------------------------------------------------------------
 * WebGL
 * ------------------------------------------------------------------------ */

function stageCanvas() {
  let stage = document.querySelector(".curtain-stage");
  if (!stage) {
    stage = document.createElement("canvas");
    stage.className = "curtain-stage";
    stage.setAttribute("aria-hidden", "true");
    document.body.append(stage);
  }
  return stage;
}

function bakeCanvas(curtain) {
  let canvas = curtain.querySelector(".curtain-bake");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "curtain-bake";
    curtain.append(canvas);
  }
  return canvas;
}

/**
 * Ruhezustand: Endbild in die beiden Randstreifen legen, WebGL-Fläche danach
 * freigeben. Beim Ziehen am Fensterrand wird mehrmals pro Sekunde neu
 * gezeichnet - dann erst freigeben, wenn sich eine Weile nichts mehr tut.
 */
function bakeRest({ releaseAfterMs = 0 } = {}) {
  const geom = geometry();
  const [left, right] = [$(".curtain--left"), $(".curtain--right")];
  if (!gl.renderer.render(restFrame(gl.timeline, geom), geom)) return false;
  gl.renderer.copyStrips(bakeCanvas(left), bakeCanvas(right), geom);
  clearTimeout(releaseTimer);
  if (releaseAfterMs) releaseTimer = setTimeout(() => gl?.renderer.release(), releaseAfterMs);
  else gl.renderer.release();
  return true;
}

function settle() {
  cancelAnimationFrame(gl.raf);
  gl.stage.hidden = true;
  if (!bakeRest()) { dropGl({ atRest: true }); return; }
  for (const curtain of curtainEls()) {
    curtain.style.removeProperty("width");
    curtain.classList.add("curtain--gl", "curtain--rest", "curtain--baked");
  }
  if (root.dataset.curtainPlaying !== undefined) cueDecor();
  markRest();
}

function tick(now) {
  if (!gl) return;
  if (gl.renderer.lost) { dropGl({ atRest: true }); return; }
  const t = now - gl.t0;
  const geom = geometry();
  const frame = gl.timeline.frame(t, geom);
  gl.renderer.render(frame, geom, t);
  // Schabracke oben wandert mit der Oberkante des Stoffs
  for (const curtain of curtainEls()) curtain.style.width = `${Math.max(0, frame.rod)}px`;
  root.style.setProperty("--curtain-lum", frame.ambient.toFixed(3));
  if (t >= gl.timeline.decorCue) cueDecor();
  if (frame.done) { root.style.removeProperty("--curtain-lum"); settle(); return; }
  gl.raf = requestAnimationFrame(tick);
}

/** Startet einen WebGL-Stil. Liefert false, wenn WebGL nicht verfügbar ist. */
function startGl(style, { replay }) {
  // Verlorener WebGL-Kontext: frische Fläche statt der alten
  if (renderer?.lost) { document.querySelector(".curtain-stage")?.remove(); renderer = null; }
  const stage = stageCanvas();
  if (!renderer) renderer = createCurtainRenderer(stage);
  if (!renderer || renderer.lost) {
    stage.remove(); // ohne WebGL bleibt keine leere Fläche zurück
    renderer = null;
    return false;
  }
  if (gl) cancelAnimationFrame(gl.raf);
  gl = { renderer, stage, timeline: createCurtainTimeline(style), raf: 0, t0: 0 };

  const skip = !replay && (root.dataset.intro === "skip" || reducedMotion());
  if (skip) {
    settle();
    return true;
  }

  holdDecor();
  root.dataset.curtainPhase = "playing";
  const now = performance.now();
  const curtains = curtainEls();
  if (replay) {
    // Vorschau aus dem Ruhezustand: geschlossener Vorhang blendet über den Inhalt
    gl.t0 = now;
    for (const curtain of curtains) {
      curtain.classList.remove("curtain--rest", "curtain--baked", "curtain--replay");
      curtain.classList.add("curtain--gl");
      curtain.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REPLAY_FADE_MS, easing: "ease-out" });
    }
    stage.hidden = false;
    stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REPLAY_FADE_MS, easing: "ease-out" });
  } else {
    // Seitenstart: Die Uhr läuft ab Seitenaufruf. Kommt das Skript spät, beginnt
    // die Bewegung erst nach der Überblendung (kein Sprung, kein Doppelbild).
    gl.t0 = now - Math.min(now, Math.max(0, gl.timeline.holdEnd - CROSSFADE_MS - 20));
    stage.hidden = false;
    for (const curtain of curtains) {
      // CSS-Sicherheitsnetz anhalten: ab jetzt bestimmt WebGL die Bewegung
      curtain.style.animationPlayState = "paused";
      const cssFabric = curtain.querySelector(".curtain-fabric");
      const fade = cssFabric?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CROSSFADE_MS, easing: "ease-in-out", fill: "forwards" });
      const done = () => {
        if (gl?.renderer === renderer) curtain.classList.add("curtain--gl");
        curtain.style.removeProperty("animation-play-state");
        fade?.cancel();
      };
      if (fade) fade.finished.then(done, done); else done();
    }
  }
  // Erstes Bild sofort, damit die Fläche beim nächsten Zeichnen schon gefüllt ist
  tick(now);
  return true;
}

function onResize() {
  root.style.setProperty("--viewport-w", `${root.clientWidth}px`);
  // In Ruhe: Randstreifen passend zur neuen Größe neu zeichnen (einmal pro Frame)
  if (!gl || root.dataset.curtainPhase !== "rest" || resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (gl && root.dataset.curtainPhase === "rest" && !bakeRest({ releaseAfterMs: 500 })) dropGl({ atRest: true });
  });
}

/**
 * Begleitet das Kino-Intro der Startseite. Einmal beim Start aufrufen -
 * möglichst früh (vor dem Laden der Daten), damit der Vorhang sofort läuft.
 */
export function initCurtain() {
  const curtains = curtainEls();
  if (!curtains.length) return;

  onResize();
  window.addEventListener("resize", onResize);
  curtains.forEach(curtain => {
    curtain.addEventListener("animationend", event => {
      if (event.animationName !== "curtain-open") return;
      curtain.classList.add("curtain--rest");
      curtain.classList.remove("curtain--replay");
      if (!gl) markRest();
    });
  });

  // Ohne data-curtain (boot.js konnte nicht lesen) gilt, was CSS zeigt: klassisch
  const style = root.dataset.curtain ? normalizeCurtainStyle(root.dataset.curtain) : "classic";
  if (style === "classic" || !startGl(style, { replay: false })) {
    if (style !== "classic") dropGl({ atRest: false });
    playClassic({ replay: false });
  }
}

/**
 * Spielt den Vorhang erneut ab (Einstellungen → "Vorschau abspielen"), auf
 * Wunsch in einem anderen Stil. Nur auf der Startseite wirksam.
 * @param {string} style - "fabric" | "theater" | "atmosphere" | "classic".
 * @returns {boolean} false, wenn es auf dieser Seite keinen Vorhang gibt.
 */
export function replayCurtain(style) {
  if (!curtainEls().length) return false;
  const next = normalizeCurtainStyle(style);
  if (next !== "classic") {
    root.dataset.curtain = next;
    if (startGl(next, { replay: true })) return true;
  }
  dropGl({ atRest: false });
  playClassic({ replay: true });
  return true;
}
