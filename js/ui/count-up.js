/*
 * Zahlen zählen kurz hoch (2.43): beim ersten Anzeigen großer Zahlen (Anzahl
 * Titel, Eintrittskarte im Foyer). Kleine Zahlen (unter 40) und „Bewegung
 * reduzieren" zeigen sofort den Endwert. Der Text steht für Screenreader
 * sofort richtig da (aria-label), nur die Anzeige läuft.
 */

const MIN_TARGET = 40;

/**
 * @param {HTMLElement} element
 * @param {number} target - Endwert
 * @param {(n: number) => string} [format] - Text je Zwischenwert
 * @param {number} [duration] - ms
 */
export function countUp(element, target, format = n => n.toLocaleString("de-DE"), duration = 750) {
  if (!element) return;
  const final = format(target);
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (quiet || !(target >= MIN_TARGET)) { element.textContent = final; return; }
  const start = performance.now();
  element.setAttribute("aria-label", final);
  const step = now => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // schnell los, sanft ankommen
    element.textContent = t < 1 ? format(Math.round(target * eased)) : final;
    if (t < 1) requestAnimationFrame(step);
    else element.removeAttribute("aria-label");
  };
  requestAnimationFrame(step);
}
