import {
  classifyLinkClick, navigationDelay, normalizeClickEffect, normalizeClickDuration, zoomClip, monogramOf,
} from "../logic/link-transition-logic.js";
import { BRAND_LOGO } from "../utils/constants.js";

/*
 * Klick-Animation für Links (Einstellungen → Bewegung): "zoom" (die
 * angeklickte Kachel wächst in Granatrot auf Vollbild, in der Mitte das Logo
 * aus BRAND_LOGO bzw. ersatzweise ein Monogramm) oder "off" (keine
 * Animation). Cover-Karten (a.movie-card) zoomen nicht, ihr Cover fliegt an
 * seinen Platz auf der Detailseite (playCoverFlight, Gegenstück auf der
 * Detailseite: js/cover-flight.js). Navigiert wird erst, wenn die Animation
 * vollständig abgelaufen ist. Eigene Elemente und Stile (css/link-transition.css).
 *
 * Ein einziger Klick-Listener am Dokument (in der Bubble-Phase): Seiten, die
 * einen Klick selbst behandeln (z. B. Favoriten im Sortiermodus), rufen
 * preventDefault auf - dann passiert hier nichts. Welche Klicks überhaupt in
 * Frage kommen, regelt classifyLinkClick (js/logic/link-transition-logic.js).
 *
 * Eingebunden über initAppShell (js/ui/app-shell.js), also auf jeder Seite.
 */

const EASING = "cubic-bezier(.7, 0, .2, 1)";
const FLIGHT_EASING = "cubic-bezier(.3, .7, .2, 1)";
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
  document.querySelectorAll(".link-zoom, .cover-flight-veil, .cover-flight-card").forEach(element => element.remove());
  document.querySelectorAll(".movie-card-cover").forEach(cover => { cover.style.visibility = ""; });
  ["detail-cover", "movie-title"].forEach(id => document.getElementById(id)?.style.removeProperty("view-transition-name"));
  delete document.documentElement.dataset.vtPlain;
  busy = false;
}

/** Merkzettel für die Detailseite (js/cover-flight.js): welches Bild, welcher Titel. */
const HANDOFF_KEY = "cover-flight";

/**
 * Die Bühne der Detailseite als Nachbau im Schleier (views/movie.html bzw.
 * titel.html): Kopf mit dem echten Titel, Cover-Spalte und - wie dort - das
 * Cover groß und unscharf mit dem Lichtschein in seinen Farben
 * (.detail-backdrop, css/detail.css). Aus denselben Klassen gebaut, darum
 * stimmen Ziel und Aussehen bei jeder Fensterbreite und in beiden Designs.
 * Der Schleier blendet beim Flug ein; was die Detailseite beim ersten
 * Zeichnen zeigt (js/cover-flight.js), sieht genauso aus.
 */
function buildStage(veil, title, src, amb) {
  const appbar = document.querySelector(".appbar");
  if (amb) {
    veil.style.setProperty("--amb-1", amb[0]);
    veil.style.setProperty("--amb-2", amb[1]);
  }
  veil.innerHTML = `${src ? `<div class="detail-backdrop is-ready${amb ? " has-ambient" : ""}"><img alt=""><span class="detail-backdrop-glow"></span></div>` : ""}
    <div class="cover-flight-stage"><main class="shell"><div class="page-head"><h1></h1></div>
    <div class="detail-layout"><div class="detail-cover"><div class="movie-card-cover"></div></div><div class="detail-main"></div></div></main></div>`;
  if (src) veil.querySelector(".detail-backdrop img").src = src;
  const stage = veil.querySelector(".cover-flight-stage");
  stage.style.top = `${appbar?.offsetHeight || 0}px`;
  stage.querySelector("h1").textContent = title || "";
  return stage;
}

/**
 * Cover-Flug: Das angeklickte Cover löst sich aus dem Raster und fliegt an
 * seinen Platz auf der Detailseite, während die Seite dahinter zu deren Bühne
 * wird (Lichtschein, Titel). Navigiert wird erst danach. Das Cover trägt
 * schon im Flug den Rahmen der Detailseite und heißt für den Seitenwechsel
 * „detail-cover" (css/page-transition.css): Der Browser reicht es an das
 * Cover der Detailseite weiter, ohne Lücke und ohne Bildwechsel.
 * @returns {Animation[]|null} null, wenn sich das Ziel nicht bestimmen lässt.
 */
function playCoverFlight(card, duration) {
  const cover = card.querySelector(".movie-card-cover");
  if (!cover) return null;
  const title = card.querySelector(".movie-card-title")?.textContent || "";
  const img = cover.querySelector("img.cover-image");
  const attr = img?.getAttribute("src") || "";
  // Adresse wie in den Daten (blob:-Ersatz aus dem Cover-Speicher gilt nur auf dieser Seite)
  const src = img?.complete && img.naturalWidth && !attr.startsWith("blob:") ? attr : "";
  const cardStyle = getComputedStyle(card);
  const amb = card.dataset.amb === "1" ? [cardStyle.getPropertyValue("--amb-1").trim(), cardStyle.getPropertyValue("--amb-2").trim()] : null;

  const veil = document.createElement("div");
  veil.className = "cover-flight-veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.append(veil);
  const stage = buildStage(veil, title, src, amb && amb[0] ? amb : null);
  const slot = stage.querySelector(".movie-card-cover");
  const target = slot.getBoundingClientRect();
  if (!(target.width > 0)) { veil.remove(); return null; }
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ id: card.dataset.movieId, src, title, amb: amb && amb[0] ? amb : null, at: Date.now() }));
  } catch { /* ohne Speicher landet das Cover eben erst mit den Daten */ }

  const flyer = document.createElement("div");
  flyer.className = "cover-flight-card";
  flyer.setAttribute("aria-hidden", "true");
  if (src) {
    const copy = new Image();
    copy.alt = "";
    copy.src = src;
    flyer.append(copy);
  } else if (img) {
    flyer.append(img.cloneNode());
  }
  const frame = getComputedStyle(slot);
  Object.assign(flyer.style, {
    left: `${target.left}px`, top: `${target.top}px`,
    width: `${target.width}px`, height: `${target.height}px`,
    borderRadius: frame.borderRadius,
  });
  document.body.append(flyer);
  cover.style.visibility = "hidden"; // das Original bleibt als Lücke im Raster zurück
  // Von einer Detailseite aus („Ähnlich …"): deren Cover und Titel geben die Namen ab, sonst gäbe es sie doppelt
  ["detail-cover", "movie-title"].forEach(id => { const own = document.getElementById(id); if (own) own.style.viewTransitionName = "none"; });

  const from = cover.getBoundingClientRect();
  const dx = from.left - target.left;
  const dy = from.top - target.top;
  const sx = from.width / target.width;
  const sy = from.height / target.height;
  const fly = flyer.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, boxShadow: getComputedStyle(cover).boxShadow === "none" ? "0 0 0 0 transparent" : getComputedStyle(cover).boxShadow },
    { transform: "none", boxShadow: frame.boxShadow },
  ], { duration, easing: FLIGHT_EASING, fill: "forwards" });
  const fade = veil.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: duration * 0.75, easing: "ease-out", fill: "forwards" });
  // Der Titel kommt in der zweiten Hälfte dazu - auf der Detailseite steht er dann schon
  const heading = stage.querySelector("h1").animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
    { duration: duration * 0.6, delay: duration * 0.4, easing: "cubic-bezier(.2, .7, .2, 1)", fill: "both" });
  return [fly, fade, heading];
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
  // Fließende Seitenwechsel (css/page-transition.css): Nach dem eigenen Effekt
  // blendet die neue Seite nur schlicht über, ohne stehende Kopfleiste
  document.documentElement.dataset.vtPlain = "";
  try { sessionStorage.setItem("vt-plain", "1"); } catch { /* dann mit stehender Kopfleiste */ }
  const duration = normalizeClickDuration(settings?.clickDuration);
  // Cover-Karten fliegen zur Detailseite, alles andere zoomt
  const animations = (link.matches("a.movie-card[data-movie-id]") && playCoverFlight(link, duration)) || playZoom(link, duration);

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
