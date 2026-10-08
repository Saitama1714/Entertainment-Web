import { $ } from "../utils/dom.js";
import { MOVIE_QUOTES } from "../data/movie-quotes.js";
import { quoteOfDay } from "../logic/quote-logic.js";

/*
 * "Filmzitat des Tages" auf der Startseite: ein Zitat aus einer festen,
 * lokalen Sammlung (data/movie-quotes.js), einmal pro Kalendertag gewählt
 * (logic/quote-logic.js). Keine Verbindung zur eigenen Sammlung nötig.
 */

/** Zeigt das Zitat des Tages an (oder blendet die Kachel aus, falls leer). */
export function renderQuoteOfDay() {
  const el = $("#quote-of-day");
  if (!el) return;
  const entry = quoteOfDay(MOVIE_QUOTES);
  if (!entry) { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector(".quote-text").textContent = entry.quote;
  el.querySelector(".quote-source").textContent = `— ${entry.source}`;
}
