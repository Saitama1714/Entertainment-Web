import { escapeHtml, reducedMotion } from "../utils/dom.js";

/*
 * Klapptafel-Zahlen (Statistik „Auf einen Blick"): Jede Ziffer ist eine
 * Klappe wie auf einer alten Anzeigetafel. Sobald die Zahlen sichtbar werden,
 * blättern die Klappen vom zuletzt gezeigten Stand (anfangs leer) Zeichen für
 * Zeichen bis zum neuen Wert. Ändert sich ein Wert später (z. B. nach einem
 * Import), blättert nur, was sich geändert hat.
 *
 * Aufbau einer Klappe (CSS: .flap in css/app.css): obere und untere Hälfte
 * stehen fest, darüber klappt die obere Hälfte des alten Zeichens nach unten
 * weg (.flap-fold), danach klappt die untere Hälfte des neuen Zeichens herunter
 * (.flap-unfold). Für Screenreader steht die Zahl unsichtbar daneben.
 *
 * „Bewegung reduzieren": Die Zahlen stehen sofort da.
 * Gemeinsam mit der Website (gemeinsam.txt).
 */

const CHARS = " 0123456789";
const HALF_MS = 42; // eine halbe Klappe
const CELL_DELAY_MS = 70; // Versatz zwischen den Klappen einer Zahl

/** Zuletzt gezeigter Text je Zahl (Schlüssel), damit nach Neuzeichnen nur Änderungen blättern. */
const shown = new Map();
const observed = new WeakSet();
let observer = null;

// Zeichen stehen als data-c in den Hälften und werden per CSS (::before)
// gezeichnet - so bleibt der Text der Zahl sauber (nur die unsichtbare Zahl)
const halves = char => {
  const c = escapeHtml(char);
  return `<span class="flap-half flap-top" data-c="${c}"></span>`
    + `<span class="flap-half flap-bottom" data-c="${c}"></span>`
    + `<span class="flap-half flap-top flap-fold" data-c="${c}"></span>`
    + `<span class="flap-half flap-bottom flap-unfold" data-c="${c}"></span>`;
};

/**
 * Markup einer Klapptafel-Zahl. Zeigt zunächst den zuletzt gezeigten Stand;
 * playFlaps() blättert dann zum Wert.
 * @param {string} key - stabiler Name der Zahl (z. B. "Gesamt").
 * @param {number|string} value
 * @returns {string}
 */
export function flapNumberHtml(key, value) {
  const target = String(value);
  const from = (shown.get(key) ?? "").slice(-target.length).padStart(target.length, " ");
  const cells = [...from].map(char => `<span class="flap" data-char="${escapeHtml(char)}">${halves(char)}</span>`).join("");
  return `<span class="flap-number" data-flap-key="${escapeHtml(key)}" data-flap-target="${escapeHtml(target)}">`
    + `<span class="visually-hidden">${escapeHtml(target)}</span>`
    + `<span class="flap-row" aria-hidden="true">${cells}</span></span>`;
}

const setChar = (part, char) => { part.dataset.c = char; };

/** Blättert eine Klappe Zeichen für Zeichen bis `to`. */
async function flipCell(cell, to, run) {
  const [top, bottom, fold, unfold] = cell.children;
  let from = cell.dataset.char;
  while (from !== to && run.alive) {
    const next = CHARS[(CHARS.indexOf(from) + 1) % CHARS.length] ?? to;
    setChar(top, next); setChar(unfold, next);
    setChar(fold, from); setChar(bottom, from);
    await fold.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }],
      { duration: HALF_MS, easing: "ease-in" }).finished.catch(() => {});
    await unfold.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }],
      { duration: HALF_MS, easing: "ease-out" }).finished.catch(() => {});
    setChar(bottom, next); setChar(fold, next);
    cell.dataset.char = from = next;
  }
}

/** Setzt eine Klappe ohne Bewegung auf ihr Zeichen. */
function placeCell(cell, char) {
  for (const part of cell.children) setChar(part, char);
  cell.dataset.char = char;
}

/**
 * Lässt alle Klapptafel-Zahlen in `root` zu ihrem Wert blättern.
 * @param {ParentNode} root
 */
export function playFlaps(root) {
  for (const number of root.querySelectorAll(".flap-number")) {
    const key = number.dataset.flapKey;
    const target = number.dataset.flapTarget;
    if (number.flapRun) number.flapRun.alive = false;
    const run = { alive: true };
    number.flapRun = run;
    const cells = [...number.querySelectorAll(".flap")];
    if (reducedMotion()) cells.forEach((cell, i) => placeCell(cell, target[i]));
    else cells.forEach((cell, i) => {
      setTimeout(() => { if (run.alive) flipCell(cell, target[i], run); }, i * CELL_DELAY_MS);
    });
    shown.set(key, target);
  }
}

/**
 * Blättert, sobald `root` zu sehen ist (z. B. wenn die Registerkarte geöffnet
 * wird) - und nach jedem Neuzeichnen erneut, falls er dann sichtbar ist.
 * @param {Element} root
 */
export function playFlapsWhenVisible(root) {
  if (!("IntersectionObserver" in window)) { playFlaps(root); return; }
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      observed.delete(entry.target);
      playFlaps(entry.target);
    }
  });
  if (observed.has(root)) observer.unobserve(root);
  observed.add(root);
  observer.observe(root);
}
