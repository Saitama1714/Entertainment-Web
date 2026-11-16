import { titleKind, genresOf } from "./movies-logic.js";
import { seededRandom, boardText } from "./foyer-logic.js";

/*
 * Anlässe im Foyer (2.50, Nutzerwahl nach Entwurf „Foyer zu Anlässen“):
 * Advent, Weihnachten, Silvester, Oscar-Nacht, Halloween, Sommerkino,
 * Ramadan, Eid al-Fitr, Eid al-Adha, der eigene Geburtstag und Geburtstage
 * anderer (mit Hinweis-Vorlauf je Person). Zu jedem Anlass verwandelt sich
 * das Foyer (js/ui/occasions.js, css/occasions.css) und Tafel und
 * Kinothek-Reihe zeigen passende Titel aus der eigenen Kinothek.
 *
 * Die muslimischen Feiertage rechnet der Browser selbst nach dem
 * Umm-al-Qura-Kalender (Intl, kein Netz); weicht die Mondsichtung ab, lässt
 * sich alles um ±1 Tag verschieben (hijriOffset).
 *
 * Reine Rechnung, getestet in tests/occasions.test.mjs.
 */

export const OCCASIONS = [
  { id: "advent", label: "Advent", when: "1.–23. Dezember" },
  { id: "xmas", label: "Weihnachten", when: "24.–26. Dezember" },
  { id: "nye", label: "Silvester", when: "31. Dezember und 1. Januar" },
  { id: "oscar", label: "Oscar-Nacht", when: "am eingetragenen Tag" },
  { id: "halloween", label: "Halloween", when: "30. und 31. Oktober" },
  { id: "summer", label: "Sommerkino", when: "21. Juni – 31. August" },
  { id: "ramadan", label: "Ramadan", when: "der ganze Monat" },
  { id: "fitr", label: "Eid al-Fitr", when: "1.–3. Schawwal" },
  { id: "adha", label: "Eid al-Adha", when: "10.–13. Dhu l-Hiddscha" },
  { id: "bday", label: "Dein Geburtstag", when: "dein Tag" },
  { id: "other", label: "Geburtstage anderer", when: "Hinweis vorher, kleine Feier am Tag" },
];
export const OCCASION_IDS = OCCASIONS.map(item => item.id);
export const occasionLabel = id => OCCASIONS.find(item => item.id === id)?.label || "";

/** Hinweis-Vorlauf für Geburtstage anderer (Tage). */
export const BIRTHDAY_LEADS = [
  { value: 0, label: "Kein Hinweis vorher" },
  { value: 1, label: "1 Tag vorher" },
  { value: 3, label: "3 Tage vorher" },
  { value: 7, label: "1 Woche vorher" },
  { value: 14, label: "2 Wochen vorher" },
  { value: 30, label: "1 Monat vorher" },
];
export const HIJRI_OFFSETS = [
  { value: -1, label: "1 Tag früher" },
  { value: 0, label: "Wie berechnet" },
  { value: 1, label: "1 Tag später" },
];

const DAY = 86400000;
const isMonthDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const clean = text => String(text || "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Gespeicherte Einstellung in Ordnung bringen (Unbekanntes fällt weg). */
export function readOccasions(value) {
  const raw = value && typeof value === "object" ? value : {};
  const lead = n => (BIRTHDAY_LEADS.some(item => item.value === Number(n)) ? Number(n) : 3);
  return {
    off: Array.isArray(raw.off) ? raw.off.filter(id => OCCASION_IDS.includes(id)) : [],
    hijriOffset: [-1, 0, 1].includes(Number(raw.hijriOffset)) ? Number(raw.hijriOffset) : 0,
    oscarDate: isMonthDay(raw.oscarDate) ? raw.oscarDate : "",
    me: { name: clean(raw.me?.name), date: isMonthDay(raw.me?.date) ? raw.me.date : "" },
    birthdays: (Array.isArray(raw.birthdays) ? raw.birthdays : [])
      .filter(item => item && isMonthDay(item.date))
      .map((item, index) => ({ id: String(item.id || `b${index}`), name: clean(item.name), date: item.date, lead: lead(item.lead) }))
      .slice(0, 100),
  };
}

const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

let hijriFormat = null;
/** Tag und Monat im Umm-al-Qura-Kalender, verschoben um `offset` Tage (Mondsichtung). */
export function hijriDate(date, offset = 0) {
  hijriFormat ||= new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric" });
  const parts = Object.fromEntries(hijriFormat.formatToParts(addDays(date, -offset)).filter(part => part.type !== "literal").map(part => [part.type, Number.parseInt(part.value, 10)]));
  return { day: parts.day, month: parts.month, year: parts.year };
}

/** Nächster Tag (ab heute), an dem der Hijri-Kalender Monat/Tag zeigt. */
export function nextHijri(month, day, { from = new Date(), offset = 0 } = {}) {
  const start = startOfDay(from);
  for (let i = 0; i < 400; i++) {
    const candidate = addDays(start, i);
    const hijri = hijriDate(candidate, offset);
    if (hijri.month === month && hijri.day === day) return candidate;
  }
  return null;
}

/** Erster Advent eines Jahres (vierter Sonntag vor dem 25. Dezember). */
export function firstAdvent(year) {
  const eve = new Date(year, 11, 24);
  const fourth = addDays(eve, -eve.getDay()); // Sonntag am oder vor Heiligabend = 4. Advent
  return addDays(fourth, -21);
}

/** Wie viele Adventssonntage sind (einschließlich heute) vergangen? 0–4. */
export function adventCount(date) {
  const first = firstAdvent(date.getFullYear());
  if (startOfDay(date) < first) return 0;
  return Math.min(4, Math.floor((startOfDay(date) - first) / (7 * DAY)) + 1);
}

/** Nächstes Vorkommen eines Geburtstags (Jahr egal), ab heute. 29.2. → 28.2. in Nicht-Schaltjahren. */
export function nextBirthday(isoDate, from = new Date()) {
  const [, month, day] = isoDate.split("-").map(Number);
  const today = startOfDay(from);
  const make = year => {
    const leap = new Date(year, 1, 29).getMonth() === 1;
    return new Date(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day);
  };
  const thisYear = make(today.getFullYear());
  return thisYear < today ? make(today.getFullYear() + 1) : thisYear;
}
export const daysUntil = (isoDate, from = new Date()) => Math.round((nextBirthday(isoDate, from) - startOfDay(from)) / DAY);

/**
 * Welcher Anlass ist heute? Reihenfolge, wenn mehrere zusammenfallen:
 * eigener Geburtstag, Geburtstag anderer, Eid al-Fitr, Eid al-Adha,
 * Weihnachten, Silvester, Halloween, Oscar-Nacht, Ramadan, Advent, Sommer.
 * @returns {null | {id: string, advent?: number, snow?: boolean, ramadanDay?: number, name?: string, names?: string[]}}
 */
export function activeOccasion(date, settings) {
  const config = readOccasions(settings);
  const on = id => !config.off.includes(id);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const sameDay = iso => nextBirthday(iso, date).getTime() === startOfDay(date).getTime();

  if (on("bday") && config.me.date && sameDay(config.me.date)) return { id: "bday", name: config.me.name };
  if (on("other")) {
    const today = config.birthdays.filter(item => sameDay(item.date));
    if (today.length) return { id: "other", names: today.map(item => item.name || "Jemand"), name: today[0].name || "Jemand" };
  }
  const hijri = hijriDate(date, config.hijriOffset);
  if (on("fitr") && hijri.month === 10 && hijri.day <= 3) return { id: "fitr" };
  if (on("adha") && hijri.month === 12 && hijri.day >= 10 && hijri.day <= 13) return { id: "adha" };
  if (on("xmas") && month === 12 && day >= 24 && day <= 26) return { id: "xmas", advent: 4, snow: true };
  if (on("nye") && (md === "12-31" || md === "01-01")) return { id: "nye", newYear: md === "01-01" };
  if (on("halloween") && month === 10 && day >= 30) return { id: "halloween" };
  if (on("oscar") && config.oscarDate && config.oscarDate.slice(5) === md && Number(config.oscarDate.slice(0, 4)) === date.getFullYear()) return { id: "oscar" };
  if (on("ramadan") && hijri.month === 9) return { id: "ramadan", ramadanDay: hijri.day };
  if (on("advent") && month === 12 && day <= 23) return { id: "advent", advent: Math.max(1, adventCount(date)), snow: day >= 20 };
  if (on("summer") && ((month === 6 && day >= 21) || month === 7 || month === 8)) return { id: "summer" };
  return null;
}

/**
 * Geburtstage anderer, auf die gerade hingewiesen wird (Vorlauf je Person),
 * ohne den heutigen (der ist ein Anlass), nach Nähe sortiert.
 * @returns {Array<{id: string, name: string, date: string, days: number, on: Date}>}
 */
export function birthdayHints(date, settings) {
  const config = readOccasions(settings);
  if (config.off.includes("other")) return [];
  return config.birthdays
    .map(item => ({ ...item, days: daysUntil(item.date, date), on: nextBirthday(item.date, date) }))
    .filter(item => item.lead > 0 && item.days > 0 && item.days <= item.lead)
    .sort((a, b) => a.days - b.days);
}

/** „Morgen“ / „In 3 Tagen“ */
export const daysText = days => (days === 1 ? "Morgen" : `In ${days} Tagen`);

/* ---- Programm aus der eigenen Kinothek -------------------------------- */

const XMAS = /weihnacht|christmas|xmas|grinch|polarexpress|allein zu haus|home alone|santa|nikolaus|klaus\b|wichtel|rentier|schneemann|elf\b/i;
const has = (movie, ...genres) => genresOf(movie).some(genre => genres.includes(genre));
const rating = movie => Number(movie.yourRating) || 0;
const imdb = movie => Number(movie.imdbRating) || 0;
const votes = movie => Number(String(movie.numVotes || "").replace(/\D/g, "")) || 0;
const ratedIn = (movie, year) => String(movie.dateRated || "").startsWith(String(year));

/** Programm je Anlass: Thema der Reihe und die Titel dazu (beste zuerst). */
const PROGRAMMES = {
  advent: { label: "Adventsprogramm", pick: m => XMAS.test(`${m.title} ${m.originalTitle || ""}`) || has(m, "Familienfilm", "Animation"), rank: m => (XMAS.test(m.title) ? 100 : 0) + rating(m) * 2 + imdb(m) },
  xmas: { label: "Weihnachtsprogramm", pick: m => XMAS.test(`${m.title} ${m.originalTitle || ""}`) || has(m, "Familienfilm"), rank: m => (XMAS.test(m.title) ? 100 : 0) + rating(m) * 2 + imdb(m) },
  nye: { label: "Dein Jahr in Höchstnoten", pick: m => rating(m) >= 8, rank: (m, ctx) => (ratedIn(m, ctx.year) ? 50 : 0) + rating(m) * 3 + imdb(m) },
  oscar: { label: "Ausgezeichnet · deine Preisträger", pick: m => imdb(m) >= 7.8 && titleKind(m) === "film", rank: m => imdb(m) * 10 + Math.log10(votes(m) + 1) * 4 + rating(m) },
  halloween: { label: "Halloween · Horror und Thriller", pick: m => has(m, "Horror", "Thriller", "Mystery"), rank: m => (has(m, "Horror") ? 40 : 0) + rating(m) * 2 + imdb(m) },
  summer: { label: "Sommerkino · leichte Abende", pick: m => has(m, "Komödie", "Abenteuer", "Musical", "Musikfilm", "Liebesfilm"), rank: m => rating(m) * 2 + imdb(m) },
  ramadan: { label: "Ramadan · für lange Abende", pick: m => has(m, "Drama", "Familienfilm", "Geschichte", "Biografie"), rank: m => rating(m) * 2 + imdb(m) + (Number(m.runtimeMinutes) > 130 ? 3 : 0) },
  fitr: { label: "Zum Fest · Lieblingsfilme", pick: m => rating(m) >= 9 || has(m, "Familienfilm", "Animation"), rank: m => rating(m) * 3 + imdb(m) },
  adha: { label: "Zum Fest · große Erzählungen", pick: m => rating(m) >= 9 || has(m, "Abenteuer", "Geschichte", "Familienfilm"), rank: m => rating(m) * 3 + imdb(m) },
  bday: { label: "Zum Geburtstag · deine Zehner", pick: m => rating(m) >= 9, rank: m => rating(m) * 10 + imdb(m) },
};

/**
 * Titel zum Anlass: die stärksten 24 als Vorrat, für den Tag gemischt
 * (Seed `day` + `round`), damit „Neu stecken“ und jeder Tag etwas anderes zeigen.
 * @returns {null | {label: string, ids: string[], picks: object[]}} picks: „Jetzt“ und „Danach“ (Ungesehenes zuerst).
 */
export function occasionProgramme(id, movies, { day = "", round = 0, year = new Date().getFullYear(), count = 12 } = {}) {
  const programme = PROGRAMMES[id];
  if (!programme) return null;
  const pool = (movies || []).filter(movie => titleKind(movie) !== "game" && programme.pick(movie));
  if (pool.length < 3) return null; // zu wenig - dann das normale Programm
  const ranked = [...pool].sort((a, b) => programme.rank(b, { year }) - programme.rank(a, { year }) || String(a.id).localeCompare(String(b.id))).slice(0, 24);
  const rng = seededRandom(`${id}#${day}#${round}`);
  const mixed = [...ranked];
  for (let i = mixed.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [mixed[i], mixed[j]] = [mixed[j], mixed[i]]; }
  const picks = [...mixed.filter(movie => !movie.seen), ...mixed.filter(movie => movie.seen)].slice(0, 2);
  return { label: programme.label, ids: mixed.slice(0, count).map(movie => movie.id), picks };
}

/**
 * Zeilen der Programmtafel zum Anlass (Steckbuchstaben).
 * @param {{id: string}} occasion - aus activeOccasion (bzw. Vorschau)
 * @returns {null | Array<{tag?: string, text: string}>}
 */
export function occasionBoard(occasion, picks = [], date = new Date()) {
  if (!occasion) return null;
  const [first, second] = picks;
  const line = (tag, movie) => (movie ? [{ tag, text: boardText(movie.title) }] : []);
  const untilMidnight = () => { const left = Math.max(0, (addDays(date, 1) - date) / 60000); return `${Math.floor(left / 60)} STD. ${Math.round(left % 60)} MIN.`; };
  const daysToEve = Math.max(0, Math.round((new Date(date.getFullYear(), 11, 24) - startOfDay(date)) / DAY));
  switch (occasion.id) {
    case "advent": return [{ text: `ADVENT · TÜRCHEN ${date.getDate()}` }, ...line("JETZT", first), ...line("DANACH", second), { text: daysToEve === 1 ? "MORGEN IST HEILIGABEND" : `NOCH ${daysToEve} TAGE BIS HEILIGABEND` }];
    case "xmas": return [{ text: "FROHE WEIHNACHTEN" }, ...line("FESTVORSTELLUNG", first), ...line("DANACH", second), { text: "SCHÖNE FEIERTAGE" }];
    case "nye": return occasion.newYear
      ? [{ text: `PROSIT ${date.getFullYear()}` }, { tag: "JETZT", text: `DEIN FILMJAHR ${date.getFullYear() - 1}` }, ...line("DANACH", first), { text: "EIN GUTES NEUES JAHR" }]
      : [{ text: "SILVESTER" }, { tag: "NOCH", text: untilMidnight() }, ...line("BIS DAHIN", first), { text: "PROSIT NEUJAHR" }];
    case "oscar": return [{ text: "HEUTE: DIE OSCAR-NACHT" }, ...line("JETZT", first), ...line("DANACH", second), { text: "UND DER GEWINNER IST …" }];
    case "halloween": return [{ text: "HALLOWEEN" }, ...line("JETZT", first), ...line("DANACH", second), { text: "NICHT ALLEIN SCHAUEN" }];
    case "summer": return [{ text: "SOMMERKINO" }, ...line("JETZT", first), ...line("DANACH", second), { text: "HEUTE UNTER FREIEM HIMMEL" }];
    case "ramadan": return [{ text: "RAMADAN KAREEM" }, { tag: "HEUTE", text: `TAG ${occasion.ramadanDay || 1} VON 30` }, ...line("NACH DEM IFTAR", first), { text: "GESEGNETE ABENDE" }];
    case "fitr": return [{ text: "EID MUBARAK" }, ...line("FESTVORSTELLUNG", first), ...line("DANACH", second), { text: "EIN GESEGNETES ZUCKERFEST" }];
    case "adha": return [{ text: "EID MUBARAK" }, ...line("FESTVORSTELLUNG", first), ...line("DANACH", second), { text: "EIN GESEGNETES OPFERFEST" }];
    case "bday": return [{ text: boardText(occasion.name ? `ALLES GUTE, ${occasion.name}!` : "ALLES GUTE ZUM GEBURTSTAG!") }, ...line("FESTVORSTELLUNG", first), ...line("DANACH", second), { text: "HEUTE IST DEIN TAG" }];
    case "other": {
      const names = occasion.names?.length ? occasion.names : [occasion.name || "Jemand"];
      const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} UND ${names.at(-1)}` : names[0];
      return [{ text: boardText(`HEUTE: ${who} ${names.length > 1 ? "HABEN" : "HAT"} GEBURTSTAG`) }, ...line("JETZT", first), ...line("DANACH", second), { text: "NICHT VERGESSEN ZU GRATULIEREN" }];
    }
    default: return null;
  }
}

/** Nächste Termine (für die Einstellungen). */
export function nextDates(settings, from = new Date()) {
  const config = readOccasions(settings);
  return {
    ramadan: nextHijri(9, 1, { from, offset: config.hijriOffset }),
    fitr: nextHijri(10, 1, { from, offset: config.hijriOffset }),
    adha: nextHijri(12, 10, { from, offset: config.hijriOffset }),
  };
}
