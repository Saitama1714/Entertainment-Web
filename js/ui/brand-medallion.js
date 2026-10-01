import { isCompact } from "../logic/brand-logic.js";

/*
 * Logo-Medaillon oben links in der Kopfleiste (alle Seiten).
 *
 * Oben auf der Seite hängt es groß über die Leiste hinaus; sobald man nach
 * unten scrollt, schrumpft es auf die kleine Größe in der Leiste und die
 * Navigation rückt nach (Klasse .appbar--compact, Übergang in CSS). Wieder
 * ganz oben wird es groß. Größen und Abstände stehen in css/app.css
 * („Logo-Medaillon").
 *
 * Fehlt die Logo-Datei, zeigt die Leiste stattdessen den Namen in Schrift
 * (Klasse .is-broken).
 */

export function initBrandMedallion() {
  const appbar = document.querySelector(".appbar");
  const brand = appbar?.querySelector(".brand--medallion");
  if (!brand) return;

  const img = brand.querySelector("img");
  if (img) {
    const broken = () => brand.classList.add("is-broken");
    if (img.complete && img.naturalWidth === 0) broken();
    else img.addEventListener("error", broken, { once: true });
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
