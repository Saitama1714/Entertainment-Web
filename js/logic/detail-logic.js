/*
 * Detailseite eines Titels: Angaben lesbar aufbereiten - Datum, Stimmen,
 * Länder und Sprachen auf Deutsch, Bewertung für die Leuchtreklame.
 * Reine Funktionen, getestet in tests/detail.test.mjs.
 */

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * „Erschienen": volles Datum auf Deutsch („23. September 2004"), sonst das Jahr.
 * @param {{releaseDate?: string, year?: string}} movie
 */
export function releaseLabel(movie) {
  const match = String(movie.releaseDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match.map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${d}. ${MONTHS[m - 1]} ${y}`;
  }
  return String(movie.year || "").trim();
}

/** Zahl mit Komma („7,5"); leer, wenn keine Zahl. */
const decimal = value => {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "";
};

/**
 * Stimmen kurz: „2,7 Mio.", „475.023", „1 Stimme".
 * @param {string|number} votes
 */
export function votesLabel(votes) {
  const n = Number(String(votes ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio. Stimmen`;
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Stimme" : "Stimmen"}`;
}

/**
 * IMDb-Wertung in einer Zeile: {score: "7,5", votes: "475.023 Stimmen"} oder null.
 * @param {{imdbRating?: string, numVotes?: string}} movie
 */
export function imdbScore(movie) {
  const score = decimal(movie.imdbRating);
  return score ? { score, votes: votesLabel(movie.numVotes) } : null;
}

/**
 * Eigene Bewertung für die Leuchtreklame: 1–10 oder null (noch nicht bewertet).
 * @param {{yourRating?: string}} movie
 */
export function ownScore(movie) {
  const n = Math.round(Number.parseFloat(String(movie.yourRating ?? "").replace(",", ".")));
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
}

/** Länder (OMDb, englisch) → Deutsch. Unbekannte bleiben, wie sie sind. */
const COUNTRIES = {
  "United States": "USA", USA: "USA", "United Kingdom": "Großbritannien", UK: "Großbritannien", Germany: "Deutschland",
  "West Germany": "Westdeutschland", "East Germany": "DDR", France: "Frankreich", Italy: "Italien", Spain: "Spanien",
  Canada: "Kanada", Australia: "Australien", "New Zealand": "Neuseeland", Ireland: "Irland", Austria: "Österreich",
  Switzerland: "Schweiz", Belgium: "Belgien", Netherlands: "Niederlande", Luxembourg: "Luxemburg", Denmark: "Dänemark",
  Sweden: "Schweden", Norway: "Norwegen", Finland: "Finnland", Iceland: "Island", Poland: "Polen", "Czech Republic": "Tschechien",
  Czechia: "Tschechien", Hungary: "Ungarn", Romania: "Rumänien", Bulgaria: "Bulgarien", Greece: "Griechenland", Turkey: "Türkei",
  Russia: "Russland", "Soviet Union": "Sowjetunion", Ukraine: "Ukraine", Portugal: "Portugal", Japan: "Japan", China: "China",
  "Hong Kong": "Hongkong", Taiwan: "Taiwan", "South Korea": "Südkorea", India: "Indien", Thailand: "Thailand",
  Mexico: "Mexiko", Brazil: "Brasilien", Argentina: "Argentinien", Chile: "Chile", Colombia: "Kolumbien",
  "South Africa": "Südafrika", Morocco: "Marokko", Egypt: "Ägypten", Israel: "Israel", Iran: "Iran",
  "United Arab Emirates": "Vereinigte Arabische Emirate", Jordan: "Jordanien", Malta: "Malta", Croatia: "Kroatien",
  Serbia: "Serbien", Slovakia: "Slowakei", Slovenia: "Slowenien", Estonia: "Estland", Latvia: "Lettland", Lithuania: "Litauen",
};

/** Sprachen (OMDb, englisch) → Deutsch. */
const LANGUAGES = {
  English: "Englisch", German: "Deutsch", French: "Französisch", Spanish: "Spanisch", Italian: "Italienisch",
  Portuguese: "Portugiesisch", Dutch: "Niederländisch", Danish: "Dänisch", Swedish: "Schwedisch", Norwegian: "Norwegisch",
  Finnish: "Finnisch", Icelandic: "Isländisch", Polish: "Polnisch", Czech: "Tschechisch", Hungarian: "Ungarisch",
  Romanian: "Rumänisch", Greek: "Griechisch", Turkish: "Türkisch", Russian: "Russisch", Ukrainian: "Ukrainisch",
  Japanese: "Japanisch", Mandarin: "Mandarin", Cantonese: "Kantonesisch", Chinese: "Chinesisch", Korean: "Koreanisch",
  Hindi: "Hindi", Thai: "Thai", Vietnamese: "Vietnamesisch", Arabic: "Arabisch", Hebrew: "Hebräisch", Persian: "Persisch",
  Latin: "Latein", Irish: "Irisch", "Irish Gaelic": "Irisch", Welsh: "Walisisch", Yiddish: "Jiddisch", "Sign Languages": "Gebärdensprache",
  "American Sign Language": "Amerikanische Gebärdensprache", "Swiss German": "Schweizerdeutsch", Afrikaans: "Afrikaans",
  Indonesian: "Indonesisch", Tagalog: "Tagalog", Swahili: "Suaheli", Klingon: "Klingonisch", Esperanto: "Esperanto",
};

/** Liste auf Deutsch, Doppelte (z. B. „USA" aus zwei Schreibweisen) einmal. */
const translate = (list, table) => [...new Set((list || []).map(name => table[name] || name))];
export const countriesDe = list => translate(list, COUNTRIES);
export const languagesDe = list => translate(list, LANGUAGES);

/** Kurzer Text „ohne Angabe" vermeiden: leere Teile fallen weg. */
export const joinParts = (parts, separator = " · ") => parts.filter(Boolean).join(separator);
