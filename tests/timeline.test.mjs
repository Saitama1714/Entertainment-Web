/*
 * Tests zur Zeitleiste unter Entertainment (js/logic/timeline-logic.js):
 * Datumswerte, Reihenfolge, Ausschnitt der Achse, Stapeln der Striche und
 * der Abstand zwischen Erscheinen und Bewertung als Text.
 */
import { newMovie } from "../js/collection.js";
import {
  parseDay, releaseInfo, ratedTime, timelineEntries, timelineDomain, axisTicks,
  stackMarks, formatGap, movieSpan, nearestIndex,
} from "../js/logic/timeline-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };
const day = text => Date.parse(`${text}T00:00:00Z`);

const movies = [
  newMovie({ id: "a", title: "Arrival", year: "2016", releaseDate: "2016-11-11", dateRated: "2019-03-02" }),
  newMovie({ id: "b", title: "Heat", year: "1995", releaseDate: "", dateRated: "2021-07-15" }),
  newMovie({ id: "c", title: "Dune", year: "2024", releaseDate: "2024-02-29", dateRated: "" }),
  newMovie({ id: "d", title: "Ohne alles", year: "", releaseDate: "", dateRated: "" }),
  newMovie({ id: "e", title: "Amélie", year: "2001", releaseDate: "2001-04-25", dateRated: "2019-03-02" }),
];

console.log("Datumswerte");
check("IMDb-Tag „2016-11-11\" → UTC-Mitternacht", parseDay("2016-11-11") === day("2016-11-11"));
check("ISO mit Uhrzeit → nur der Tag zählt", parseDay("2021-07-15T18:30:00.000Z") === day("2021-07-15"));
check("Leer, Unsinn, Monat 13 → null", parseDay("") === null && parseDay("bald") === null && parseDay("2020-13-01") === null);
check("Erscheinen mit Datum: genau", JSON.stringify(releaseInfo(movies[0])) === JSON.stringify({ time: day("2016-11-11"), approx: false }));
check("Erscheinen nur mit Jahr: Jahresmitte, ungefähr", releaseInfo(movies[1]).time === day("1995-07-01") && releaseInfo(movies[1]).approx === true);
check("Ohne Jahr und Datum: kein Erscheinen", releaseInfo(movies[3]) === null);
check("Bewertungsdatum aus dateRated", ratedTime(movies[1]) === day("2021-07-15") && ratedTime(movies[2]) === null);

console.log("Einträge je Ansicht");
const rated = timelineEntries(movies, "rated");
check("Bewertet: nur bewertete, nach Datum, Gleichstand nach Titel", rated.entries.map(e => e.movie.id).join() === "e,a,b", rated.entries.map(e => e.movie.id));
check("Bewertet: 2 ohne Bewertung gezählt", rated.missing === 2);
const release = timelineEntries(movies, "release");
check("Erschienen: auch nur-Jahr, ohne Unbekannte", release.entries.map(e => e.movie.id).join() === "b,e,a,c" && release.missing === 1, release.entries.map(e => e.movie.id));
check("Leere Liste → keine Einträge", timelineEntries([], "rated").entries.length === 0);

console.log("Ausschnitt der Achse");
const [start, end] = timelineDomain(rated.entries);
check("Bewertet: Ausschnitt nur um die Bewertungen (2019–2021), mit Rand", start < day("2019-03-02") && start > day("2018-09-01") && end > day("2021-07-15") && end < day("2022-01-01"), [new Date(start).toISOString(), new Date(end).toISOString()]);
const span = movieSpan(movies[1]);
const [wideStart] = timelineDomain(rated.entries, span);
check("Mit gewähltem Titel: reicht bis zu seinem Erscheinen (1995)", wideStart < day("1995-07-01") && wideStart > day("1994-01-01"), new Date(wideStart).toISOString());
const [oneStart, oneEnd] = timelineDomain([{ time: day("2020-05-01") }]);
check("Ein einziger Eintrag: mindestens ein halbes Jahr breit", oneEnd - oneStart >= 182 * 86400000);

console.log("Beschriftung");
const yearTicks = axisTicks([day("1990-03-01"), day("2026-06-01")], 800);
check("36 Jahre auf 800 px: Schritt 5 Jahre, ganze Jahre", yearTicks.map(t => t.label).join() === "1995,2000,2005,2010,2015,2020,2025", yearTicks.map(t => t.label));
const narrow = axisTicks([day("2019-03-01"), day("2021-08-01")], 1200);
check("Gut 2 Jahre auf 1200 px: jedes Jahr", narrow.map(t => t.label).join() === "2020,2021");
const months = axisTicks([day("2024-01-10"), day("2024-12-20")], 1000);
check("Unter 2 Jahren: Monate, Januar als Jahreszahl", months.length >= 6 && months.every(t => t.time >= day("2024-01-10")) && !months.some(t => t.label === "2024"), months.map(t => t.label));
check("Jahreswechsel im Monatsraster heißt wie das Jahr", axisTicks([day("2024-10-01"), day("2025-05-01")], 900).some(t => t.label === "2025" && t.major));

console.log("Stapeln");
const stack = stackMarks([100, 100.5, 101, 200, 99.8]);
check("Erster oben, zweiter unten, dritter oben eine Stufe weiter", JSON.stringify(stack.slice(0, 3)) === JSON.stringify([{ side: -1, level: 0 }, { side: 1, level: 0 }, { side: -1, level: 1 }]));
check("Weit entfernt: wieder ganz innen", JSON.stringify(stack[3]) === JSON.stringify({ side: -1, level: 0 }));
check("Vierter am selben Platz: unten, Stufe 1", JSON.stringify(stack[4]) === JSON.stringify({ side: 1, level: 1 }));

console.log("Abstand als Text");
check("Arrival: 2 Jahre, 3 Monate", formatGap(day("2016-11-11"), day("2019-03-02")).text === "2 Jahre, 3 Monate", formatGap(day("2016-11-11"), day("2019-03-02")));
check("Genau ein Jahr", formatGap(day("2020-05-01"), day("2021-05-01")).text === "1 Jahr");
check("Unter einem Monat: Tage", formatGap(day("2024-03-01"), day("2024-03-13")).text === "12 Tage");
check("Ein Tag / selber Tag", formatGap(day("2024-03-01"), day("2024-03-02")).text === "1 Tag" && formatGap(day("2024-03-01"), day("2024-03-01")).text === "am selben Tag");
check("Angefangener Monat zählt nicht (31.1. → 28.2.)", formatGap(day("2023-01-31"), day("2023-02-28")).text === "28 Tage");
check("Nur Jahr bekannt: gerundet", formatGap(day("1995-07-01"), day("2021-07-15"), { approx: true }).text === "rund 26 Jahre");
check("Nur Jahr, im selben Jahr bewertet", formatGap(day("2020-07-01"), day("2020-09-01"), { approx: true }).text === "im selben Jahr");
const early = formatGap(day("2024-03-01"), day("2024-01-15"));
check("Vor dem Erscheinen bewertet (Vorpremiere)", early.before === true && early.text === "1 Monat", early);
check("Spanne fehlt ohne Bewertung", movieSpan(movies[2]) === null && movieSpan(movies[0]).from === day("2016-11-11"));

console.log("Nächster Eintrag");
check("Nächster zum Zeitpunkt", nearestIndex(release.entries, day("2010-01-01")) === 2 && nearestIndex(release.entries, day("2002-01-01")) === 1 && nearestIndex([], 5) === -1);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
