/*
 * Programmtafel im Foyer: Buchstaben zünden (2.45, Nutzerwahl aus dem
 * Entwurf „Programmtafel und Aufbau"). Jeder Buchstabe glimmt schwach auf,
 * manche flackern kurz, dann leuchten sie voll - Zeile für Zeile, innerhalb
 * der Zeile in lockerer Reihenfolge. Beim Aufbau der Übersicht
 * (js/ui/page-build.js) und bei „Neu stecken" (js/ui/foyer.js): dort
 * erlischt die alte Tafel erst, dann zündet die neue.
 *
 * Die Buchstaben werden als einfache Inline-Spans gesetzt (kein
 * inline-block), damit Zeilen weiter nur zwischen ganzen Wörtern umbrechen.
 */

const GLOW = "0 0 .35em rgb(255 214 150 / .9), 0 0 1em rgb(255 180 90 / .5)";

/** Kleiner, fester Zufall: gleiche Tafel, gleiches Bild. */
function seeded(seed) {
  let value = seed % 2147483647 || 1;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

/** Zerlegt die Zeilen in Buchstaben; liefert je Zeile die sichtbaren Zeichen. */
function splitLines(box) {
  return [...box.querySelectorAll(".foyer-board-line")].map(line => {
    const chars = [];
    for (const node of [...line.childNodes]) {
      const textNode = node.nodeType === Node.TEXT_NODE ? node : node.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE || textNode.parentElement?.classList.contains("board-ch")) continue;
      const fragment = document.createDocumentFragment();
      for (const char of textNode.textContent) {
        if (!char.trim()) { fragment.append(char); continue; }
        const span = document.createElement("span");
        span.className = "board-ch";
        span.textContent = char;
        fragment.append(span);
        chars.push(span);
      }
      textNode.replaceWith(fragment);
    }
    if (!chars.length) chars.push(...line.querySelectorAll(".board-ch"));
    return chars;
  });
}

/**
 * Lässt die Buchstaben der Tafel zünden.
 * @param {HTMLElement} box - #foyer-board-lines
 * @param {{delay?: number}} [options]
 * @returns {Animation[]} die Animationen (zum Beenden oder Abbrechen)
 */
export function igniteBoard(box, { delay = 0 } = {}) {
  if (!box) return [];
  const random = seeded(box.textContent.length * 31 + 7);
  const animations = [];
  splitLines(box).forEach((chars, row) => {
    chars
      .map((char, index) => ({ char, order: index + random() * 5 }))
      .sort((a, b) => a.order - b.order)
      .forEach(({ char }, index) => {
        const flicker = random() < 0.35;
        const keyframes = flicker
          ? [{ opacity: .06, textShadow: "none" }, { opacity: .5, offset: .15 }, { opacity: .1, offset: .25 },
             { opacity: 1, textShadow: GLOW, offset: .45 }, { opacity: .35, offset: .55 }, { opacity: 1, textShadow: GLOW, offset: .7 },
             { opacity: 1, textShadow: "none" }]
          : [{ opacity: .06, textShadow: "none" }, { opacity: .45, offset: .3 }, { opacity: 1, textShadow: GLOW, offset: .6 }, { opacity: 1, textShadow: "none" }];
        animations.push(char.animate(keyframes, { duration: flicker ? 620 : 420, delay: delay + 120 + row * 160 + index * 24, fill: "backwards" }));
      });
  });
  return animations;
}

/**
 * Löscht die Tafel: Buchstaben erlöschen in lockerer Reihenfolge.
 * @returns {{animations: Animation[], duration: number}}
 */
export function extinguishBoard(box) {
  if (!box) return { animations: [], duration: 0 };
  const random = seeded(box.textContent.length * 17 + 3);
  let duration = 0;
  const animations = splitLines(box).flat().map(char => {
    const delay = random() * 220;
    duration = Math.max(duration, delay + 260);
    return char.animate([{ opacity: 1, textShadow: GLOW }, { opacity: .5, offset: .3 }, { opacity: 0, textShadow: "none" }], { duration: 260, delay, easing: "ease-in", fill: "forwards" });
  });
  return { animations, duration };
}
