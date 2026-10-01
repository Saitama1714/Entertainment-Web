/*
 * Tests zur Filtergruppe "Art" (titleKind) und zum Zufallspicker nach Art.
 */
import { newMovie } from "../js/collection.js";
import { titleKind, KIND_FILTER_OPTIONS, filterMovies, facetCounts, emptyFilters } from "../js/logic/movies-logic.js";
import { pickRandomUnseen } from "../js/logic/stats-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };
const kindOf = titleType => titleKind({ titleType });

console.log("Zuordnung der 13 IMDb-Arten (wie abgestimmt)");
const expected = {
  "Movie": "film", "TV Movie": "film", "Video": "film", "Short": "film",
  "TV Series": "series", "TV Mini Series": "series",
  "Video Game": "game",
  "TV Short": "other", "TV Special": "other", "TV Episode": "other",
  "Music Video": "other", "Podcast Series": "other", "Podcast Episode": "other",
};
const wrong = Object.entries(expected).filter(([type, kind]) => kindOf(type) !== kind);
check("Alle 13 IMDb-Arten landen im richtigen Chip", wrong.length === 0, wrong);

console.log("Andere Schreibweisen");
check("Ältere IMDb-Exporte (camelCase): tvSeries, tvMiniSeries, tvMovie, videoGame", kindOf("tvSeries") === "series" && kindOf("tvMiniSeries") === "series" && kindOf("tvMovie") === "film" && kindOf("videoGame") === "game");
check("OMDb: movie, series, game, episode", kindOf("movie") === "film" && kindOf("series") === "series" && kindOf("game") === "game" && kindOf("episode") === "other");
check("Mit Bindestrich/Unterstrich (TV Mini-Series, tv_movie)", kindOf("TV Mini-Series") === "series" && kindOf("tv_movie") === "film");
check("Leer, fehlend, unbekannt → Sonstiges", kindOf("") === "other" && titleKind({}) === "other" && kindOf("Hologramm") === "other");
check("Vier Chips in der Reihenfolge Film, Serie, Videospiel, Sonstiges", KIND_FILTER_OPTIONS.map(o => o.label).join() === "Film,Serie,Videospiel,Sonstiges");

console.log("Filtern und Zählen");
const movies = [
  newMovie({ id: "f1", title: "Film 1", titleType: "Movie", seen: false }),
  newMovie({ id: "f2", title: "Kurzfilm", titleType: "Short", seen: true }),
  newMovie({ id: "s1", title: "Serie", titleType: "TV Series", seen: false }),
  newMovie({ id: "s2", title: "Mini", titleType: "tvMiniSeries", seen: false }),
  newMovie({ id: "g1", title: "Spiel", titleType: "Video Game", seen: false }),
  newMovie({ id: "o1", title: "Alt, ohne Art", seen: false }),
];
const filters = { ...emptyFilters(), kind: ["series"] };
check("Art=Serie → beide Serien", filterMovies(movies, filters).map(m => m.id).join() === "s1,s2");
check("Art=Film ODER Videospiel", filterMovies(movies, { ...emptyFilters(), kind: ["film", "game"] }).map(m => m.id).join() === "f1,f2,g1");
check("Art UND Status: Film + Offen → nur f1", filterMovies(movies, { ...emptyFilters(), kind: ["film"], seen: ["unseen"] }).map(m => m.id).join() === "f1");
const counts = facetCounts(movies, emptyFilters());
check("Zahlen je Art: Film 2, Serie 2, Videospiel 1, Sonstiges 1", ["film", "series", "game", "other"].map(k => counts.kind.get(k)).join() === "2,2,1,1");
check("Filter ohne 'kind'-Gruppe (älterer Aufrufer) stürzt nicht ab", filterMovies(movies, { media: [], seen: [], lists: [] }).length === 6);

console.log("Zufallspicker nach Art");
const picks = kind => { const seen = new Set(); for (let i = 0; i < 60; i++) pickRandomUnseen(movies, 2, { kind }).forEach(m => seen.add(m.id)); return [...seen].sort().join(); };
check("Film: nur ungesehene Filme (f1; f2 ist gesehen)", picks("film") === "f1", picks("film"));
check("Serie: nur s1, s2", picks("series") === "s1,s2");
check("Alles (leer): alle ungesehenen, auch Spiel und Sonstiges", picks("") === "f1,g1,o1,s1,s2");
check("Keine offenen Titel dieser Art → leer, kein Absturz", pickRandomUnseen(movies.filter(m => m.id !== "f1"), 2, { kind: "film" }).length === 0);

console.log("Deutsche IMDb-Arten (Export mit deutscher Spracheinstellung)");
{
  const kinds = ["Film", "Fernsehfilm", "Kurzfilm", "Video", "Fernsehserie", "Miniserie", "Mini-Fernsehserie", "Videospiel", "Fernsehspecial", "Fernsehepisode"]
    .map(type => titleKind({ titleType: type }));
  check("Film/Fernsehfilm/Kurzfilm/Video → Film, Fernsehserie/Miniserie → Serie, Videospiel → Videospiel, Special/Episode → Sonstiges",
    kinds.join() === "film,film,film,film,series,series,series,game,other,other", kinds);
}

console.log(`\n${ok} bestanden, ${bad} fehlgeschlagen`);
process.exit(bad ? 1 : 0);
