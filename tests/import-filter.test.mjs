/*
 * Tests zur Filtergruppe „Import" (js/logic/movies-logic.js,
 * js/ui/movie-filters.js): Einträge, die der IMDb-Import in den letzten
 * 4 Wochen angelegt („Neu") oder verändert („Geändert") hat.
 * Die Zeitstempel selbst setzt der Import (tests/imdb-import.test.mjs).
 */
import { newMovie } from "../js/collection.js";
import {
  importStatus, importFilterOptions, IMPORT_WINDOW_DAYS, IMPORT_FILTER_OPTIONS,
  filterMovies, facetCounts, emptyFilters, toggleFilterValue, hasActiveFilters,
} from "../js/logic/movies-logic.js";
import { filterChipsHtml } from "../js/ui/movie-filters.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

const DAY = 86400000;
const NOW = Date.now();
const ago = days => new Date(NOW - days * DAY).toISOString();

const movies = [
  newMovie({ id: "neu", title: "Neu", importAddedAt: ago(3) }),
  newMovie({ id: "geaendert", title: "Geändert", importChangedAt: ago(10) }),
  newMovie({ id: "beides", title: "Beides", importAddedAt: ago(20), importChangedAt: ago(1) }),
  newMovie({ id: "alt", title: "Alt", importAddedAt: ago(40), importChangedAt: ago(30) }),
  newMovie({ id: "nie", title: "Nie" }),
];
const ids = list => list.map(m => m.id).join();

console.log("importStatus");
check("Fenster ist 4 Wochen (28 Tage)", IMPORT_WINDOW_DAYS === 28);
check("Vor 3 Tagen angelegt → neu", importStatus(movies[0], NOW).join() === "new");
check("Vor 10 Tagen geändert → geändert", importStatus(movies[1], NOW).join() === "changed");
check("Neu und danach geändert → beides", importStatus(movies[2], NOW).join() === "new,changed");
check("Älter als 4 Wochen → nichts", importStatus(movies[3], NOW).length === 0);
check("Ohne Zeitstempel (alter Datenstand) → nichts", importStatus(movies[4], NOW).length === 0);
check("Grenze: genau 28 Tage → noch drin, 28 Tage + 1 min → raus",
  importStatus({ importAddedAt: ago(28) }, NOW).join() === "new" && importStatus({ importAddedAt: new Date(NOW - 28 * DAY - 60000).toISOString() }, NOW).length === 0);
check("Kaputter Datumswert → nichts, kein Absturz", importStatus({ importAddedAt: "Quatsch", importChangedAt: null }, NOW).length === 0);
check("Ohne Zeitangabe wird ab jetzt gerechnet", importStatus(movies[0]).join() === "new");

console.log("Filtern");
const pick = (...values) => values.reduce((f, v) => toggleFilterValue(f, "import", v), emptyFilters());
check("emptyFilters() hat die Gruppe „import“, leer", Array.isArray(emptyFilters().import) && emptyFilters().import.length === 0);
check("„Neu“ → neu + beides", ids(filterMovies(movies, pick("new"))) === "neu,beides");
check("„Geändert“ → geändert + beides", ids(filterMovies(movies, pick("changed"))) === "geaendert,beides");
check("„Neu“ ODER „Geändert“ → alles aus den letzten 4 Wochen", ids(filterMovies(movies, pick("new", "changed"))) === "neu,geaendert,beides");
check("Mit anderer Gruppe UND-verknüpft", ids(filterMovies(movies.map(m => ({ ...m, seen: m.id === "beides" })), { ...pick("new"), seen: ["seen"] })) === "beides");
check("hasActiveFilters erkennt die Gruppe", hasActiveFilters(pick("new")));
check("Alter Filterzustand ohne „import“ (z. B. gemerkt auf der Website) schränkt nicht ein",
  filterMovies(movies, { kind: [], genres: [], media: [], seen: [], lists: [] }).length === movies.length);
const counts = facetCounts(movies, emptyFilters()).import;
check("Zahlen: Neu 2, Geändert 2", counts.get("new") === 2 && counts.get("changed") === 2, [...counts]);

console.log("Chips");
check("Optionen „Neu“ und „Geändert“", IMPORT_FILTER_OPTIONS.map(o => o.label).join() === "Neu,Geändert");
check("Gruppe erscheint, wenn etwas neu/geändert ist", importFilterOptions(movies, NOW).length === 2);
check("Keine Gruppe, solange nichts neu/geändert ist (sauberer Neustart)", importFilterOptions([movies[3], movies[4]], NOW).length === 0);
const html = filterChipsHtml(movies, movies, emptyFilters());
check("Chip-Leiste zeigt „Import“ mit beiden Chips", html.includes(">Import<") && html.includes('data-category="import" data-value="new"') && html.includes('data-category="import" data-value="changed"'));
const quiet = [movies[3], movies[4]];
check("Ohne neue/geänderte Titel: keine „Import“-Gruppe", !filterChipsHtml(quiet, quiet, emptyFilters()).includes('data-category="import"'));
check("… außer ein Chip ist noch gedrückt (lässt sich lösen)", filterChipsHtml(quiet, quiet, pick("new")).includes('data-category="import" data-value="new"'));
check("Lässt sich ausblenden (hide)", !filterChipsHtml(movies, movies, emptyFilters(), { hide: ["import"] }).includes('data-category="import"'));

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
process.exit(bad ? 1 : 0);
