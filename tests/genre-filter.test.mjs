/*
 * Tests zur Filtergruppe „Genre" (js/logic/movies-logic.js): Genres kommen
 * aus dem IMDb-Import als Text mit Komma ("Drama, Sci-Fi").
 */
import { newMovie } from "../js/collection.js";
import { genresOf, genreFilterOptions, filterMovies, facetCounts, emptyFilters, toggleFilterValue } from "../js/logic/movies-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

const movies = [
  newMovie({ id: "a", title: "Arrival", genre: "Drama, Sci-Fi", seen: true }),
  newMovie({ id: "b", title: "Heat", genre: "Action, Crime, Drama" }),
  newMovie({ id: "c", title: "Amélie", genre: "Comedy,Romance" }),
  newMovie({ id: "d", title: "Ohne Genre", genre: "" }),
  newMovie({ id: "e", title: "Doppelt", genre: " Drama ,  Drama, " }),
];

console.log("Genres lesen");
check("Mit und ohne Leerzeichen nach dem Komma", JSON.stringify(genresOf(movies[0])) === '["Drama","Sci-Fi"]' && JSON.stringify(genresOf(movies[2])) === '["Comedy","Romance"]');
check("Leer → keine Genres; doppelte und leere fallen weg", genresOf(movies[3]).length === 0 && JSON.stringify(genresOf(movies[4])) === '["Drama"]');
check("Optionen: alle vorkommenden Genres, alphabetisch", genreFilterOptions(movies).join() === "Action,Comedy,Crime,Drama,Romance,Sci-Fi");

console.log("Filtern und Zählen");
check("Leerer Filterzustand enthält die Gruppe", Array.isArray(emptyFilters().genres) && emptyFilters().genres.length === 0);
check("Genre Drama → alle mit Drama", filterMovies(movies, { ...emptyFilters(), genres: ["Drama"] }).map(m => m.id).join() === "a,b,e");
check("Drama ODER Comedy (innerhalb der Gruppe)", filterMovies(movies, { ...emptyFilters(), genres: ["Drama", "Comedy"] }).map(m => m.id).join() === "a,b,c,e");
check("Genre UND Status (zwischen Gruppen)", filterMovies(movies, { ...emptyFilters(), genres: ["Drama"], seen: ["seen"] }).map(m => m.id).join() === "a");
const counts = facetCounts(movies, emptyFilters()).genres;
check("Zahlen je Genre (ein Titel zählt bei jedem seiner Genres)", counts.get("Drama") === 3 && counts.get("Sci-Fi") === 1 && counts.get("Action") === 1, [...counts]);
check("Umschalten per toggleFilterValue", JSON.stringify(toggleFilterValue(emptyFilters(), "genres", "Drama").genres) === '["Drama"]');
check("Filterobjekt ohne Genre-Gruppe (ältere Stände) schränkt nicht ein", filterMovies(movies, { media: [], seen: [], lists: [] }).length === 5);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
