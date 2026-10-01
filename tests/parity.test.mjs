/*
 * 1:1-Abgleich Dashboard ↔ Website: Dieselbe Sicherung wird einmal so
 * aufbereitet wie im Dashboard (normalizeMovies aus js/collection.js -
 * identisch mit dem Dashboard) und einmal über Werkzeug + Website
 * (buildPublicData → JSON → parseCollection). Danach müssen Felder, Karten,
 * Sortierungen, Filter-Zahlen, Suche und Statistik übereinstimmen.
 *
 * Die Sicherung enthält absichtlich Sonderfälle: fehlendes und leeres Medium,
 * Gesehen als Text, Zahlen statt Text, Einträge ohne Titel, leere
 * Listennamen, kaputte Cover-Links.
 */
import { normalizeMovies } from "../js/collection.js";
import { buildPublicData, OPTIONAL_GROUPS } from "../js/tools/publish-logic.js";
import { parseCollection } from "../js/data-source.js";
import { searchMovies, sortMovies, facetCounts, emptyFilters, SORT_OPTIONS, listFilterOptions } from "../js/logic/movies-logic.js";
import { collectionStats } from "../js/logic/stats-logic.js";

// movie-card.js braucht ein document (Listener für Cover-Ladezustand)
globalThis.document = { addEventListener() {} };
const { movieCardHtml } = await import("../js/ui/movie-card.js");

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

const m = (id, extra) => ({
  id, createdAt: `2026-0${(id.length % 9) + 1}-01T10:00:00.000Z`, title: `Titel ${id}`, originalTitle: "", imdbUrl: `https://www.imdb.com/title/tt${id}/`,
  titleType: "Movie", imdbRating: "7.1", runtimeMinutes: "101", year: "2001", genre: "Drama", numVotes: "1234",
  releaseDate: "2001-01-01", directors: "Jemand", yourRating: "", dateRated: "", imdbCreated: "2020-01-01", imdbModified: "2021-01-01",
  imdbDescription: "", position: "", medium: "Blu-ray", seen: false, seenAt: "", cover: `https://m.media-amazon.com/${id}.jpg`,
  notes: "", imdbId: `tt${id}`, imdbLists: [], lockedFields: [], ...extra,
});
const raw = [
  m("a1", { medium: "", seen: true, seenAt: "2026-01-02", yourRating: "9", dateRated: "2026-01-03", imdbLists: ["Watchlist"], notes: "privat" }),
  m("a2", { medium: undefined }),                                   // Medium fehlt ganz → Dashboard zeigt „DVD"
  m("a3", { medium: "UHD Blu-ray", seen: "true", yourRating: 8 }),   // Gesehen als Text, Bewertung als Zahl
  m("a4", { title: "", year: "" }),                                  // ohne Titel
  m("a5", { imdbLists: ["", "Sci-Fi", 42], titleType: "TV Series", imdbRating: "" }),
  m("a6", { cover: "kein-link", imdbUrl: "javascript:alert(1)" }),   // kaputte Links
  m("a7", { cover: "", medium: "Digital", seen: 1, position: "3", originalTitle: "Original", createdAt: "2026-01-01T10:00:00.000Z" }),
  m("a8", { medium: "Irgendwas", titleType: "tvMiniSeries", createdAt: "2026-01-01T10:00:00.000Z", genre: "Komödie, Drama" }),
];
// Sicherung so, wie sie aus dem Dashboard kommt (JSON: undefined-Felder fehlen)
const backup = JSON.parse(JSON.stringify({ version: 1, exportedAt: "2026-10-01T08:00:00.000Z", data: { movies: raw, omdbApiKey: "x" } }));

const FIELDS = ["title", "originalTitle", "year", "titleType", "genre", "directors", "runtimeMinutes", "releaseDate", "imdbRating", "numVotes",
  "imdbId", "imdbDescription", "imdbCreated", "imdbModified", "position", "medium", "seen", "seenAt", "yourRating", "dateRated", "imdbLists", "notes", "createdAt", "id"];
const UNSAFE = new Set(["a6"]); // Links absichtlich entfernt - dort nur Platzhalter-Gleichheit prüfen

function compare(label, options, skip = []) {
  console.log(label);
  const dashboard = normalizeMovies(backup.data.movies);
  const site = parseCollection(JSON.parse(JSON.stringify(buildPublicData(backup, options)))).movies;
  check("Gleich viele Titel, gleiche Reihenfolge", dashboard.map(x => x.id).join() === site.map(x => x.id).join(), [dashboard.length, site.length]);

  const diffs = [];
  dashboard.forEach((d, i) => {
    const s = site[i];
    for (const f of FIELDS) if (!skip.includes(f) && JSON.stringify(d[f]) !== JSON.stringify(s[f])) diffs.push([d.id, f, d[f], s[f]]);
    if (!UNSAFE.has(d.id) && d.cover !== s.cover) diffs.push([d.id, "cover", d.cover, s.cover]);
    if (!UNSAFE.has(d.id) && d.imdbUrl !== s.imdbUrl) diffs.push([d.id, "imdbUrl", d.imdbUrl, s.imdbUrl]);
  });
  check("Alle angezeigten Felder identisch", diffs.length === 0, diffs.slice(0, 4));

  const cards = dashboard.filter(d => !UNSAFE.has(d.id)).filter((d, i) => movieCardHtml(d, "x") !== movieCardHtml(site.find(s => s.id === d.id), "x")).map(d => d.id);
  check("Karten (Cover, Medium-Abzeichen, Jahr, Gesehen) identisch", cards.length === 0, cards);
  const a6 = site.find(s => s.id === "a6");
  check("Kaputter Cover-Link: Platzhalter wie im Dashboard (dort nach Ladefehler)", a6.cover === "" && a6.imdbUrl === "");

  const sorts = SORT_OPTIONS.filter(o => sortMovies(dashboard, o.value).map(x => x.id).join() !== sortMovies(site, o.value).map(x => x.id).join()).map(o => o.value);
  check("Alle Sortierungen identisch", sorts.length === 0, sorts);
  const fc = (list) => JSON.stringify(Object.fromEntries(Object.entries(facetCounts(list, emptyFilters())).map(([k, v]) => [k, [...v].sort()])));
  check("Filter-Zahlen identisch (Art, Genre, Medium, Status, Liste)", fc(dashboard) === fc(site), fc(dashboard) === fc(site) ? "" : [fc(dashboard), fc(site)]);
  check("Listen-Chips identisch", listFilterOptions(dashboard).join() === listFilterOptions(site).join());
  const queries = ["drama", "titel a", "blu", "dvd", "2001", "jemand", "original"];
  const search = queries.filter(q => searchMovies(dashboard, q).map(x => x.id).join() !== searchMovies(site, q).map(x => x.id).join());
  check("Suche identisch", search.length === 0, search);
  check("Statistik identisch", JSON.stringify(collectionStats(dashboard)) === JSON.stringify(collectionStats(site)));
  return { dashboard, site };
}

const everything = Object.fromEntries(OPTIONAL_GROUPS.map(g => [g.key, true]));
const { dashboard, site } = compare("Alles veröffentlicht", everything);
check("Sonderfall: fehlendes Medium erscheint wie im Dashboard als DVD", dashboard[1].medium === "DVD" && site[1].medium === "DVD");
check("Sonderfall: leeres Medium bleibt leer", site[0].medium === "");
check("Sonderfall: Gesehen als Text/Zahl wie im Dashboard", site[2].seen === true && site[6].seen === true);
compare("Ohne Notizen (Standard)", { ...everything, notes: false }, ["notes"]);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
