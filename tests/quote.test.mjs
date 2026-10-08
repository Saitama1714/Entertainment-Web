/*
 * Tests zum Filmzitat des Tages (quoteOfDay) und zur Zitat-Sammlung selbst.
 */
import { quoteOfDay } from "../js/logic/quote-logic.js";
import { MOVIE_QUOTES } from "../js/data/movie-quotes.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

console.log("Zitat-Sammlung");
check(`Mindestens 120 Zitate hinterlegt (${MOVIE_QUOTES.length})`, MOVIE_QUOTES.length >= 120);
check("Jedes Zitat hat Text und Quelle", MOVIE_QUOTES.every(entry => entry.quote && entry.source));
const texts = MOVIE_QUOTES.map(entry => entry.quote);
check("Keine doppelten Zitate", new Set(texts).size === texts.length);

console.log("quoteOfDay()");
check("Leere Liste → null", quoteOfDay([], new Date("2026-01-01")) === null);
const a = quoteOfDay(MOVIE_QUOTES, new Date("2026-03-15T08:00:00"));
const b = quoteOfDay(MOVIE_QUOTES, new Date("2026-03-15T23:00:00"));
check("Gleicher Kalendertag → gleiches Zitat, egal zu welcher Uhrzeit", a === b, [a, b]);
const c = quoteOfDay(MOVIE_QUOTES, new Date("2026-03-16T08:00:00"));
check("Nächster Tag → (in aller Regel) ein anderes Zitat", a !== c || MOVIE_QUOTES.length === 1, [a, c]);
const wrap = quoteOfDay(MOVIE_QUOTES, new Date("1970-01-01T00:00:00Z"));
check("Auch vor/weit vor der Unix-Epoche liefert ein gültiges Zitat (kein Absturz)", MOVIE_QUOTES.includes(wrap));
const single = quoteOfDay([{ quote: "x", source: "y" }], new Date());
check("Liste mit genau einem Zitat funktioniert", single.quote === "x");

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
