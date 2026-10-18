import { $, escapeHtml, reducedMotion } from "../utils/dom.js";
import { MOVIE_QUOTES } from "../data/movie-quotes.js";
import { quoteOfDay } from "../logic/quote-logic.js";

/*
 * "Filmzitat des Tages" auf der Startseite: ein Zitat aus einer festen,
 * lokalen Sammlung (data/movie-quotes.js), einmal pro Kalendertag gewählt
 * (logic/quote-logic.js). Keine Verbindung zur eigenen Sammlung nötig.
 *
 * Aufgemacht als Leuchtreklame wie am Kino-Vordach: ein Lauflicht aus
 * Glühbirnen rahmt das Zitat (Birnen per Skript passend zur Größe verteilt),
 * und sobald der Kinovorhang offen ist, schreibt sich der Text Buchstabe für
 * Buchstabe auf. „Bewegung reduzieren": Birnen stehen still, Text ist gleich da.
 */

const BULB_GAP = 24;          // Abstand der Birnen in px
const LETTER_MS = 30;         // Versatz je Buchstabe …
const WRITE_MAX_MS = 1600;    // … höchstens so lange für das ganze Zitat
const root = document.documentElement;

/** Wartet, bis der Kinovorhang offen ist (oder es keinen gibt). */
function whenCurtainOpen() {
  const open = () => !document.querySelector(".curtain") || !root.dataset.curtainPhase || root.dataset.curtainPhase === "rest";
  if (open()) return Promise.resolve();
  return new Promise(resolve => {
    const watch = new MutationObserver(() => { if (open()) { watch.disconnect(); resolve(); } });
    watch.observe(root, { attributes: true, attributeFilter: ["data-curtain-phase"] });
  });
}

/** Verteilt die Birnen gleichmäßig auf dem Rand des Schilds. */
function placeBulbs(figure) {
  const layer = figure.querySelector(".quote-bulbs");
  const { width, height } = figure.getBoundingClientRect();
  if (!layer || width < 40 || height < 20) return;
  const across = Math.max(2, Math.round(width / BULB_GAP));
  const down = Math.max(1, Math.round(height / BULB_GAP));
  const points = [];
  for (let i = 0; i <= across; i++) points.push([i / across, 0]);
  for (let i = 1; i < down; i++) points.push([1, i / down]);
  for (let i = across; i >= 0; i--) points.push([i / across, 1]);
  for (let i = down - 1; i >= 1; i--) points.push([0, i / down]);
  layer.innerHTML = points.map(([x, y], i) =>
    `<span class="quote-bulb" style="left:${(x * 100).toFixed(3)}%;top:${(y * 100).toFixed(3)}%;--bulb:${i % 3}"></span>`).join("");
}

let resizeWatch = null;

/** Zeigt das Zitat des Tages an (oder blendet die Kachel aus, falls leer). */
export function renderQuoteOfDay() {
  const el = $("#quote-of-day");
  if (!el) return;
  const entry = quoteOfDay(MOVIE_QUOTES);
  if (!entry) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.add("is-marquee");

  if (!el.querySelector(".quote-bulbs")) el.insertAdjacentHTML("afterbegin", `<span class="quote-bulbs" aria-hidden="true"></span>`);
  const text = el.querySelector(".quote-text");
  const source = el.querySelector(".quote-source");
  source.textContent = `— ${entry.source}`;

  const quiet = reducedMotion();
  // Für Screenreader steht das Zitat am Stück da, sichtbar sind die Buchstaben
  const step = Math.min(LETTER_MS, WRITE_MAX_MS / Math.max(1, entry.quote.length));
  let index = 0;
  const letters = entry.quote.split(/(\s+)/).map(part => (/^\s+$/.test(part)
    ? `<span class="quote-letter" style="--i:${index++}"> </span>`
    : `<span class="quote-word">${[...part].map(char => `<span class="quote-letter" style="--i:${index++}">${escapeHtml(char)}</span>`).join("")}</span>`)).join("");
  text.innerHTML = `<span class="visually-hidden">${escapeHtml(entry.quote)}</span><span aria-hidden="true">${letters}</span>`;
  el.style.setProperty("--letter-step", `${step}ms`);
  el.style.setProperty("--write-ms", `${Math.round(index * step)}ms`);

  placeBulbs(el);
  if ("ResizeObserver" in window && !resizeWatch) {
    let last = "";
    resizeWatch = new ResizeObserver(() => {
      const size = `${Math.round(el.offsetWidth / BULB_GAP)}x${Math.round(el.offsetHeight / BULB_GAP)}`;
      if (size !== last) { last = size; placeBulbs(el); }
    });
    resizeWatch.observe(el);
  }

  if (quiet) { el.classList.add("is-written"); return; }
  el.classList.add("is-waiting");
  whenCurtainOpen().then(() => {
    el.classList.remove("is-waiting");
    el.classList.add("is-writing");
  });
}
