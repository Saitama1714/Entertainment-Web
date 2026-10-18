import { isCompact } from "../logic/brand-logic.js";
import { readLogoMotion, logoClasses, logoTempoFactor, playsOnOpen, logoOnceMs } from "../logic/logo-motion-logic.js";
import { LOGO_SVG } from "./logo-svg.js";

/*
 * Logo-Medaillon oben links in der Kopfleiste (alle Seiten).
 *
 * Oben auf der Seite hängt es groß über die Leiste hinaus; sobald man nach
 * unten scrollt, schrumpft es auf die kleine Größe in der Leiste und die
 * Navigation rückt nach (Klasse .appbar--compact, Übergang in CSS). Wieder
 * ganz oben wird es groß. Größen und Abstände stehen in css/base.css
 * („Logo-Medaillon").
 *
 * Fehlt die Logo-Datei, zeigt die Leiste stattdessen den Namen in Schrift
 * (Klasse .is-broken).
 *
 * Logo-Animation: Sobald das Bild geladen ist, tritt an seine Stelle dieselbe
 * Zeichnung als SVG (js/ui/logo-svg.js), deren Teile sich bewegen können
 * (css/logo.css). Was sich wann bewegt, steht in den Einstellungen
 * (js/logic/logo-motion-logic.js); setLogoMotion() übernimmt Änderungen sofort.
 * „Beim Öffnen" spielt auf jeder Seite einmal - wartet aber, bis ein
 * Kinovorhang offen bzw. der Einlass der Website frei ist.
 */

let logo = null;          // das eingebettete SVG
let motion = readLogoMotion(null);
let playing = false;
let playTimer = 0;

/** Klassen und Tempo ans Logo. */
function applyMotion() {
  if (!logo) return;
  logo.setAttribute("class", ["brand-logo", ...logoClasses(motion, { playing })].join(" "));
  logo.style.setProperty("--logo-t", String(logoTempoFactor(motion)));
}

/** Einmal anlaufen und ausrollen (beim Öffnen und als Vorschau). */
export function playLogo() {
  if (!logo || !motion.effects.length) return;
  clearTimeout(playTimer);
  playing = false;
  applyMotion();
  void logo.getBoundingClientRect(); // Animation neu starten
  playing = true;
  applyMotion();
  playTimer = setTimeout(() => { playing = false; applyMotion(); }, logoOnceMs(motion));
}

/**
 * Neue Einstellungen übernehmen (Einstellungen-Dialog bzw. „Ansicht").
 * @param {*} value - {mode, effects, tempo}
 * @param {{preview?: boolean}} [options] - preview: gleich einmal abspielen.
 */
export function setLogoMotion(value, { preview = false } = {}) {
  motion = readLogoMotion(value);
  if (preview && motion.mode !== "off") playLogo();
  else applyMotion();
}

/** Wartet, bis die Seite zu sehen ist (Vorhang offen, Einlass frei), dann `run`. */
function whenVisible(run) {
  const root = document.documentElement;
  const ready = () => root.dataset.gate === undefined
    && (root.dataset.curtainPhase === undefined || root.dataset.curtainPhase === "rest");
  if (ready()) { requestAnimationFrame(run); return; }
  const observer = new MutationObserver(() => {
    if (!ready()) return;
    observer.disconnect();
    clearTimeout(fallback);
    run();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-gate", "data-curtain-phase"] });
  const fallback = setTimeout(() => { observer.disconnect(); if (root.dataset.gate === undefined) run(); }, 12000);
}

/** Bild durch das bewegliche SVG ersetzen (das <img> bleibt als Rückfall, versteckt). */
function embedLogo(brand) {
  if (logo || brand.classList.contains("is-broken")) return;
  brand.insertAdjacentHTML("beforeend", LOGO_SVG);
  logo = brand.querySelector("svg.brand-logo");
  brand.classList.add("has-svg");
  applyMotion();
  if (playsOnOpen(motion)) whenVisible(playLogo);
}

/**
 * @param {{motion?: *}} [options] - Einstellungen der Logo-Animation.
 */
export function initBrandMedallion({ motion: settings = null } = {}) {
  const appbar = document.querySelector(".appbar");
  const brand = appbar?.querySelector(".brand--medallion");
  if (!brand) return;

  motion = readLogoMotion(settings);
  const img = brand.querySelector("img");
  if (img) {
    const broken = () => brand.classList.add("is-broken");
    if (img.complete && img.naturalWidth === 0) broken();
    else if (img.complete) embedLogo(brand);
    else {
      img.addEventListener("error", broken, { once: true });
      img.addEventListener("load", () => embedLogo(brand), { once: true });
    }
  }

  let compact = false;
  let queued = false;
  const update = () => {
    queued = false;
    const next = isCompact(window.scrollY, compact);
    if (next === compact) return;
    compact = next;
    appbar.classList.toggle("appbar--compact", compact);
  };

  // Seite wurde mit Scroll-Position geöffnet (z. B. Zurück): gleich ohne
  // Übergang in den richtigen Zustand, damit nichts sichtbar schrumpft.
  appbar.classList.add("appbar--instant");
  update();
  requestAnimationFrame(() => requestAnimationFrame(() => appbar.classList.remove("appbar--instant")));

  window.addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });
}
