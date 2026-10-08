import {
  classifyLinkClick, navigationDelay, normalizeClickEffect, normalizeClickDuration, zoomClip, monogramOf,
} from "../logic/link-transition-logic.js";
import { BRAND_LOGO } from "../utils/constants.js";

/*
 * Klick-Animation für Links (Einstellungen → Bewegung): "zoom" (die
 * angeklickte Kachel wächst in Granatrot auf Vollbild, in der Mitte das Logo
 * aus BRAND_LOGO bzw. ersatzweise ein Monogramm) oder "off" (keine
 * Animation). Navigiert wird erst, wenn die Animation vollständig abgelaufen
 * ist. Eigene Elemente und Stile (css/link-transition.css).
 *
 * Ein einziger Klick-Listener am Dokument (in der Bubble-Phase): Seiten, die
 * einen Klick selbst behandeln (z. B. Favoriten im Sortiermodus), rufen
 * preventDefault auf - dann passiert hier nichts. Welche Klicks überhaupt in
 * Frage kommen, regelt classifyLinkClick (js/logic/link-transition-logic.js).
 *
 * Eingebunden über initAppShell (js/ui/app-shell.js), also auf jeder Seite.
 */

const EASING = "cubic-bezier(.7, 0, .2, 1)";
const SAFETY_MS = 10000; // bleibt die Seite stehen (Download, Fehler): Effekt wieder entfernen

let settings = null;   // Dashboard-Zustand (clickEffect, clickDuration) - wird live gelesen
let logoReady = false; // Logo vorab geladen? Sonst zeigt der Zoom das Monogramm
let busy = false;
let timers = [];
let listening = false;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entfernt alle Effekt-Elemente und gibt Klicks wieder frei. */
function reset() {
  timers.forEach(clearTimeout);
  timers = [];
  document.querySelectorAll(".link-zoom").forEach(element => element.remove());
  busy = false;
}

/** Kachel-Zoom: Overlay startet auf dem Element und öffnet sich auf Vollbild. Liefert die Animationen. */
function playZoom(link, duration) {
  const root = document.documentElement;
  const viewport = { width: root.clientWidth, height: root.clientHeight };
  const rect = link.getBoundingClientRect();
  const radius = parseFloat(getComputedStyle(link).borderTopLeftRadius) || 0;

  const layer = document.createElement("div");
  layer.className = "link-zoom";
  layer.setAttribute("aria-hidden", "true");
  const mark = logoReady ? logoMark() : document.createElement("span");
  if (!logoReady) {
    mark.className = "link-zoom-mark";
    mark.textContent = monogramOf(link.getAttribute("aria-label") || link.textContent);
  }
  layer.append(mark);
  document.body.append(layer);

  const clip = zoomClip(rect, viewport, radius);
  const grow = layer.animate([{ clipPath: clip.from }, { clipPath: clip.to }], { duration, easing: EASING, fill: "forwards" });

  // Logo bzw. Monogramm: von der Mitte des Elements zur Fenstermitte, wächst mit
  const size = mark.getBoundingClientRect().height || parseFloat(getComputedStyle(mark).fontSize) || 120;
  const startScale = Math.min(1, Math.max(0.08, (rect.height * 0.62) / size));
  const dx = rect.left + rect.width / 2 - viewport.width / 2;
  const dy = rect.top + rect.height / 2 - viewport.height / 2;
  const travel = mark.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${startScale})`, opacity: 0 },
    { opacity: 1, offset: 0.3 },
    { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
  ], { duration, easing: EASING, fill: "forwards" });
  return [grow, travel];
}

/** Logo-Element für den Zoom: das Logo in seinen eigenen Farben. */
function logoMark() {
  const wrap = document.createElement("span");
  wrap.className = "link-zoom-logo";
  const img = document.createElement("img");
  img.src = BRAND_LOGO.src;
  img.alt = "";
  wrap.append(img);
  return wrap;
}

/** Lädt das Logo vorab, damit es beim ersten Klick sofort da ist. Fehlt es, bleibt das Monogramm. */
function preloadLogo() {
  if (!BRAND_LOGO?.src) return;
  const img = new Image();
  img.src = BRAND_LOGO.src;
  img.decode().then(() => { logoReady = true; }, () => { logoReady = false; });
}

function onClick(event) {
  const link = event.target.closest?.("a[href]");
  if (!link || !event.isTrusted) return;

  // Läuft schon ein Effekt: weitere Klicks auf Links ignorieren (Doppelklick)
  if (busy) {
    event.preventDefault();
    return;
  }
  // Knopf innerhalb eines Links (falls es das einmal gibt): nicht unsere Sache
  const control = event.target.closest("button, input, select, textarea, label");
  if (control && link.contains(control)) return;

  const decision = classifyLinkClick({
    button: event.button,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey,
    defaultPrevented: event.defaultPrevented,
    href: link.getAttribute("href"),
    target: link.getAttribute("target"),
    download: link.hasAttribute("download"),
    optOut: Boolean(link.closest("[data-no-transition]")),
  }, location.href);
  if (!decision) return;
  const effect = normalizeClickEffect(settings?.clickEffect);
  // Ausgeschaltet oder "Bewegung reduzieren": der Browser navigiert sofort selbst
  if (effect === "off" || reducedMotion()) return;

  event.preventDefault();
  busy = true;
  const duration = normalizeClickDuration(settings?.clickDuration);
  const animations = playZoom(link, duration);

  // Erst navigieren, wenn der Browser die Animation als fertig meldet und ihr
  // letztes Bild gezeichnet hat - nicht nach der Uhr: Die Animation beginnt
  // erst mit dem nächsten Bild und kann auf langsamen Rechnern nachhinken.
  // Das Endbild bleibt stehen, bis die neue Seite erscheint.
  let navigated = false;
  const go = () => {
    if (!busy || navigated) return;
    navigated = true;
    location.assign(decision.url);
  };
  Promise.all(animations.map(animation => animation.finished))
    .then(() => requestAnimationFrame(go), () => {});
  timers.push(setTimeout(go, navigationDelay(duration) + 1500)); // Sicherheitsnetz, falls nie "fertig" kommt
  timers.push(setTimeout(reset, duration + SAFETY_MS));
}

/**
 * Schaltet die Klick-Animationen auf der Seite ein. Mehrfacher Aufruf ist
 * harmlos (es bleibt ein Listener); der übergebene Zustand wird bei jedem
 * Klick neu gelesen, Änderungen in den Einstellungen gelten also sofort.
 * @param {{clickEffect?: string, clickDuration?: number}} state
 */
export function initLinkTransitions(state) {
  settings = state;
  if (listening) return;
  listening = true;
  preloadLogo();
  document.addEventListener("click", onClick);
  // Zurück aus dem Cache des Browsers: Seite so zeigen, wie sie vor dem Klick war
  window.addEventListener("pageshow", event => { if (event.persisted) reset(); });
}
