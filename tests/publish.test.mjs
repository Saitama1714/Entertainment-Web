/*
 * Tests zum Umwandlungs-Werkzeug (js/tools/publish-logic.js): Was aus einer
 * Dashboard-Sicherung auf die Website kommt - und vor allem, was nicht.
 */
import { buildPublicData, readBackup, summarize, defaultOptions, OPTIONAL_GROUPS, BASE_FIELDS } from "../js/tools/publish-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };
const throws = fn => { try { fn(); return ""; } catch (error) { return error.message; } };

const SECRET = "geheim123";
const backup = {
  version: 1,
  exportedAt: "2026-09-30T18:00:00.000Z",
  data: {
    theme: "dark", omdbApiKey: SECRET, pinnedBookmarkIds: ["1", "2"], curtainIcon: "popcorn",
    movies: [
      { id: "m1", createdAt: "2026-01-01T00:00:00Z", title: "Arrival", year: "2016", titleType: "Movie", genre: "Drama, Sci-Fi",
        directors: "Denis Villeneuve", imdbRating: "7.9", imdbId: "tt2543164", imdbUrl: "https://www.imdb.com/title/tt2543164/",
        cover: "https://m.media-amazon.com/images/arrival.jpg", medium: "UHD Blu-ray", seen: true, seenAt: "2026-02-03",
        yourRating: "9", dateRated: "2026-02-04", notes: "Mit Papa geschaut", imdbLists: ["Watchlist", "Sci-Fi"],
        lockedFields: ["title"], imdbCreated: "2020-01-01", position: "3", geheimesNeuesFeld: "x" },
      { id: "m2", createdAt: "2026-01-02T00:00:00Z", title: "Böse", cover: "javascript:alert(1)", imdbUrl: "data:text/html,x", seen: false, medium: "" },
      { id: "m3", title: "   " },
      null,
    ],
  },
};

console.log("Sicherung lesen");
check("Gültige Sicherung: alle Einträge wie im Dashboard (auch ohne Titel), nur kaputte fallen weg", readBackup(backup).map(m => m.id).join() === "m1,m2,m3");
check("Falsche Datei → verständliche Meldung", throws(() => readBackup({ foo: 1 })).includes("keine Dashboard-Sicherung") && throws(() => readBackup(null)).includes("keine Dashboard-Sicherung"));
check("Sicherung ohne Titel-Liste → Meldung", throws(() => readBackup({ version: 1, data: {} })).includes("keine Titel"));

console.log("Was nie mitkommt");
const std = buildPublicData(backup);
const all = buildPublicData(backup, Object.fromEntries(OPTIONAL_GROUPS.map(g => [g.key, true])), { now: new Date("2026-10-01T10:00:00Z") });
const text = JSON.stringify(all);
check("OMDb-Schlüssel steht nirgends in der Datei", !text.includes(SECRET));
check("Keine Einstellungen, Favoriten, internen Felder", !/omdbApiKey|pinnedBookmarkIds|theme|curtainIcon|lockedFields|geheimesNeuesFeld/.test(text), text.slice(0, 200));
check("Gefährliche Links fallen weg (javascript:, data:text)", all.movies[1].cover === undefined && all.movies[1].imdbUrl === undefined);
check("Links bleiben Zeichen für Zeichen gleich", all.movies[0].cover === backup.data.movies[0].cover && all.movies[0].imdbUrl === backup.data.movies[0].imdbUrl);

console.log("Aufbau der Datei");
check("Kopf: Version, Zeitpunkte, gewählte Angaben", all.version === 1 && all.generatedAt === "2026-10-01T10:00:00.000Z" && all.exportedAt === backup.exportedAt && all.include.join() === "medium,seen,rating,lists,notes");
check("Grundangaben immer dabei", ["id", "title", "year", "genre", "directors", "imdbRating", "cover", "imdbUrl"].every(f => f in all.movies[0]));
check("Leere Felder werden weggelassen (kleinere Datei)", !("originalTitle" in all.movies[0]) && !("seenAt" in all.movies[1]));
check("Kein Medium bleibt „kein Medium“ (leer ausgeschrieben, nicht weggelassen)", all.movies[1].medium === "" && std.movies[1].medium === "", all.movies[1]);
check("Gesehen ist immer ein echter Wahrheitswert", all.movies[0].seen === true && all.movies[1].seen === false);

console.log("Häkchen");
check("Vorauswahl: alles außer Notizen", JSON.stringify(defaultOptions()) === JSON.stringify({ medium: true, seen: true, rating: true, lists: true, notes: false }) && std.include.join() === "medium,seen,rating,lists");
check("… Notizen sind dann nicht in der Datei", !JSON.stringify(std).includes("Mit Papa") && !("notes" in std.movies[0]));
const none = buildPublicData(backup, { medium: false, seen: false, rating: false, lists: false, notes: false });
const m = none.movies[0];
check("Alles abgewählt: nur noch Grundangaben", Object.keys(m).every(key => BASE_FIELDS.includes(key)) && none.include.length === 0, Object.keys(m));
check("Notizen angehakt: kommen mit", all.movies[0].notes === "Mit Papa geschaut");
check("Listen angehakt: als Liste von Namen", JSON.stringify(all.movies[0].imdbLists) === '["Watchlist","Sci-Fi"]');

console.log("Zusammenfassung");
const info = summarize(std);
check("Zählt Titel und Cover, nennt die Auswahl", info.total === 3 && info.withCover === 1 && info.labels.length === 4, info);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
