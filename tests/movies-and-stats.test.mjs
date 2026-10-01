import { newMovie } from "../js/collection.js";
import {
  searchMovies, previewMovies, sortMovies, SORT_OPTIONS,
  filterMovies, facetCounts, listFilterOptions, emptyFilters, hasActiveFilters, toggleFilterValue,
  MEDIA_FILTER_OPTIONS, SEEN_FILTER_OPTIONS,
} from "../js/logic/movies-logic.js";
import { collectionStats, pickRandomUnseen } from "../js/logic/stats-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

const filterOptionCount = (movies, filters, category, value) => facetCounts(movies, filters)[category].get(value) || 0;
const M = (over) => newMovie({ id: over.id || Math.random().toString(36).slice(2), title: "T", ...over });

console.log("Filter-Optionen (statisch)");
check("6 Medium-Optionen inkl. 'Kein Medium'", MEDIA_FILTER_OPTIONS.length === 6 && MEDIA_FILTER_OPTIONS.some(o => o.value === "" && o.label === "Kein Medium"), MEDIA_FILTER_OPTIONS);
check("2 Gesehen-Optionen", SEEN_FILTER_OPTIONS.map(o => o.value).join() === "seen,unseen");
check("emptyFilters() hat keine aktiven Filter", !hasActiveFilters(emptyFilters()));
check("hasActiveFilters erkennt jede Kategorie einzeln", hasActiveFilters({ media: ["DVD"], seen: [], lists: [] }) && hasActiveFilters({ media: [], seen: ["seen"], lists: [] }) && hasActiveFilters({ media: [], seen: [], lists: ["Watchlist"] }));

console.log("listFilterOptions");
const movies = [
  M({ id: "1", medium: "UHD Blu-ray", seen: true, imdbLists: ["Bewertungen", "Filmsammlung"], year: "2024", yourRating: "9", imdbRating: "8.5", title: "Dune: Part Two", createdAt: "2026-01-03T00:00:00Z" }),
  M({ id: "2", medium: "Blu-ray", seen: true, imdbLists: ["Bewertungen"], year: "2017", yourRating: "8", imdbRating: "8.0", title: "Blade Runner 2049", createdAt: "2026-01-02T00:00:00Z" }),
  M({ id: "3", medium: "Digital", seen: false, imdbLists: ["Watchlist"], year: "2016", yourRating: "", imdbRating: "7.9", title: "Arrival", createdAt: "2026-01-05T00:00:00Z" }),
  M({ id: "4", medium: "", seen: false, imdbLists: ["Watchlist"], year: "1999", yourRating: "", imdbRating: "8.7", title: "Matrix, The", createdAt: "2026-01-01T00:00:00Z" }),
  M({ id: "5", medium: "DVD", seen: true, imdbLists: [], year: "", yourRating: "", imdbRating: "", title: "Ohne Jahr", createdAt: "2026-01-04T00:00:00Z" }),
];
check("Listennamen alphabetisch, ohne Duplikate", JSON.stringify(listFilterOptions(movies)) === JSON.stringify(["Bewertungen", "Filmsammlung", "Watchlist"]), listFilterOptions(movies));
check("Leere Sammlung → keine Listenoptionen", listFilterOptions([]).length === 0);

console.log("filterMovies");
check("Ohne Filter: alle 5", filterMovies(movies, emptyFilters()).length === 5);
check("Medium=UHD ODER Blu-ray → 2 Treffer", filterMovies(movies, { media: ["UHD Blu-ray", "Blu-ray"], seen: [], lists: [] }).map(m => m.id).sort().join() === "1,2");
check("Kein Medium (value='') filtert korrekt", filterMovies(movies, { media: [""], seen: [], lists: [] }).map(m => m.id).join() === "4");
check("seen=unseen → 3,4", filterMovies(movies, { media: [], seen: ["unseen"], lists: [] }).map(m => m.id).sort().join() === "3,4");
check("Liste=Watchlist → 3,4", filterMovies(movies, { media: [], seen: [], lists: ["Watchlist"] }).map(m => m.id).sort().join() === "3,4");
check("UND zwischen Kategorien: Watchlist UND unseen → 3,4 (beide erfüllen es)", filterMovies(movies, { media: [], seen: ["unseen"], lists: ["Watchlist"] }).map(m => m.id).sort().join() === "3,4");
check("UND zwischen Kategorien, enger: Bewertungen UND Gesehen → 1,2", filterMovies(movies, { media: [], seen: ["seen"], lists: ["Bewertungen"] }).map(m => m.id).sort().join() === "1,2");
check("Kombination ohne Treffer → leer", filterMovies(movies, { media: ["DVD"], seen: ["unseen"], lists: [] }).length === 0);
check("Film ohne imdbLists (leeres Array) matcht keinen Listenfilter", filterMovies(movies, { media: [], seen: [], lists: ["Bewertungen"] }).every(m => m.id !== "5"));

console.log("filterOptionCount (Facetten-Zählung)");
check("Ohne aktive Filter: Medium 'Blu-ray' zählt sich selbst korrekt (1)", filterOptionCount(movies, emptyFilters(), "media", "Blu-ray") === 1);
check("Eigene Kategorie zählt nicht gegen sich selbst: Medium-Zahl ändert sich nicht durch anderen Medium-Wert", filterOptionCount(movies, { media: ["DVD"], seen: [], lists: [] }, "media", "Blu-ray") === 1);
check("Andere Kategorie wirkt auf die Zahl: seen=unseen aktiv → Medium 'Digital' bleibt 1, 'DVD' wird 0", filterOptionCount(movies, { media: [], seen: ["unseen"], lists: [] }, "media", "Digital") === 1 && filterOptionCount(movies, { media: [], seen: ["unseen"], lists: [] }, "media", "DVD") === 0);
check("Zählung für 'lists' auf durchsuchter Teilmenge", filterOptionCount([movies[2], movies[3]], emptyFilters(), "lists", "Watchlist") === 2);

console.log("sortMovies");
check("title A–Z, deutsche Regeln", sortMovies(movies, "title").map(m => m.title).join("|") === "Arrival|Blade Runner 2049|Dune: Part Two|Matrix, The|Ohne Jahr");
check("yourRating hoch→niedrig, fehlende Werte ans Ende (stabil nach 'recent')", sortMovies(movies, "yourRating").map(m => m.id).join() === "1,2,3,4,5".split(",").filter(id => ["1","2"].includes(id)).concat(sortMovies(movies,"yourRating").map(m=>m.id).filter(id=>!["1","2"].includes(id))).join());
const yr = sortMovies(movies, "yourRating").map(m => m.id);
check("… konkret: 1 (9) vor 2 (8), Rest ohne Bewertung dahinter in 'recent'-Reihenfolge", yr.slice(0,2).join() === "1,2" && yr.slice(2).join() === sortMovies(movies.filter(m=>!["1","2"].includes(m.id)), "recent").map(m=>m.id).join());
check("imdbRating hoch→niedrig: 4 (8.7) vor 1 (8.5) vor 2 (8.0) vor 3 (7.9), 5 ohne Wert am Ende", sortMovies(movies, "imdbRating").map(m => m.id).join() === "4,1,2,3,5");
check("Jahr neu→alt: 1 (2024) vor 2 (2017) vor 3 (2016) vor 4 (1999), 5 ohne Jahr am Ende", sortMovies(movies, "yearDesc").map(m => m.id).join() === "1,2,3,4,5");
check("Jahr alt→neu: 4 (1999) zuerst, 5 ohne Jahr TROTZDEM am Ende (nicht am Anfang)", sortMovies(movies, "yearAsc").map(m => m.id).join() === "4,3,2,1,5");
check("Unbekannter sortKey fällt auf 'recent' zurück", sortMovies(movies, "quatsch").map(m => m.id).join() === sortMovies(movies, "recent").map(m => m.id).join());
check("Leere Liste sortieren wirft nicht", sortMovies([], "title").length === 0);
check("sortMovies verändert das Original-Array nicht", (() => { const copy = [...movies]; sortMovies(movies, "title"); return movies.every((m, i) => m === copy[i]); })());
check("Alle SORT_OPTIONS-Werte sind in sortMovies auch tatsächlich behandelt (kein Tippfehler)", SORT_OPTIONS.every(o => JSON.stringify(sortMovies(movies, o.value)) !== undefined));

console.log("previewMovies (Zufallsauswahl Startseite)");
check("Liefert genau `count` Einträge, alle aus der Sammlung, keine Duplikate", (() => {
  const picked = previewMovies(movies, 3);
  return picked.length === 3 && picked.every(m => movies.includes(m)) && new Set(picked.map(m => m.id)).size === 3;
})());
check("count > Sammlungsgröße: liefert nur so viele wie es gibt, kein Crash", previewMovies(movies, 20).length === 5);
check("Leere Sammlung → leeres Ergebnis, kein Crash", previewMovies([], 5).length === 0);
check("Mit fester rng-Folge deterministisch reproduzierbar", previewMovies(movies, 5, { rng: () => 0 }).map(m => m.id).join() === previewMovies(movies, 5, { rng: () => 0 }).map(m => m.id).join());
check("Ohne exclude/kind, viele Aufrufe: irgendwann kommen unterschiedliche Reihenfolgen vor (echte Durchmischung mit Math.random)", (() => {
  const first = previewMovies(movies, 5).map(m => m.id).join();
  return Array.from({ length: 30 }, () => previewMovies(movies, 5).map(m => m.id).join()).some(order => order !== first);
})());
check("previewMovies verändert das Original-Array nicht", (() => { const copy = [...movies]; previewMovies(movies, 3); return movies.every((m, i) => m === copy[i]); })());

console.log("collectionStats");
check("5 Filme, 3 gesehen, 2 offen", JSON.stringify(collectionStats(movies)) === JSON.stringify({ total: 5, seen: 3, unseen: 2 }));
check("Leere Sammlung → 0/0/0", JSON.stringify(collectionStats([])) === JSON.stringify({ total: 0, seen: 0, unseen: 0 }));

console.log("pickRandomUnseen");
const fixedRng = seq => { let i = 0; return () => seq[i++ % seq.length]; };
const two = pickRandomUnseen(movies, 2, { rng: fixedRng([0.1, 0.9, 0.3]) });
check("Liefert genau 2 aus den ungesehenen (3,4)", two.length === 2 && two.every(m => !m.seen));
check("Mit fester rng-Folge deterministisch reproduzierbar", JSON.stringify(pickRandomUnseen(movies, 2, { rng: fixedRng([0.1, 0.9, 0.3]) }).map(m=>m.id)) === JSON.stringify(two.map(m=>m.id)));
check("Ohne exclude, viele Aufrufe: irgendwann kommen beide Reihenfolgen vor (echte Durchmischung mit Math.random)", (() => {
  const orders = new Set();
  for (let i = 0; i < 200; i++) orders.add(pickRandomUnseen(movies, 2).map(m => m.id).join(","));
  return orders.size === 2; // bei genau 2 ungesehenen Filmen gibt es nur 2 mögliche Reihenfolgen
})());
check("count > verfügbare ungesehene Filme: liefert nur so viele wie es gibt, kein Crash", pickRandomUnseen(movies, 10).length === 2);
check("Alles gesehen → leeres Ergebnis, kein Crash", pickRandomUnseen(movies.map(m => ({ ...m, seen: true })), 2).length === 0);
check("exclude greift, wenn genug Alternativen da sind", (() => {
  const many = [...movies, M({ id: "6", seen: false }), M({ id: "7", seen: false })]; // 4 ungesehene: 3,4,6,7
  const r = pickRandomUnseen(many, 2, { exclude: ["3", "4"], rng: fixedRng([0.1, 0.9]) });
  return r.every(m => !["3", "4"].includes(m.id));
})());
check("exclude wird ignoriert, wenn sonst zu wenige übrig blieben (lieber Wiederholung als weniger Treffer)", (() => {
  const r = pickRandomUnseen(movies, 2, { exclude: ["3", "4"], rng: fixedRng([0.1, 0.9]) }); // nur 3,4 sind ungesehen
  return r.length === 2;
})());
check("Leere Sammlung crasht nicht", pickRandomUnseen([], 2).length === 0);

console.log("toggleFilterValue");
{
  const f0 = emptyFilters();
  const f1 = toggleFilterValue(f0, "media", "DVD");
  check("Erstes Umschalten fügt hinzu", JSON.stringify(f1.media) === '["DVD"]' && JSON.stringify(f0.media) === "[]", f1);
  const f2 = toggleFilterValue(f1, "media", "Blu-ray");
  check("Zweiter Wert in derselben Kategorie kommt dazu (ODER)", JSON.stringify(f2.media) === '["DVD","Blu-ray"]');
  const f3 = toggleFilterValue(f2, "media", "DVD");
  check("Erneutes Klicken entfernt genau diesen Wert wieder", JSON.stringify(f3.media) === '["Blu-ray"]');
  const f4 = toggleFilterValue(f3, "seen", "seen");
  check("Andere Kategorie bleibt unabhängig", JSON.stringify(f4) === JSON.stringify({ kind: [], genres: [], media: ["Blu-ray"], seen: ["seen"], lists: [] }));
  check("Original-Objekt wird nie mutiert", JSON.stringify(f0) === JSON.stringify(emptyFilters()) && JSON.stringify(f2.media) === '["DVD","Blu-ray"]');
}

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen (kumuliert)`);
process.exit(bad ? 1 : 0);
