/**
 * Formatierung von Zahlen und Datumsangaben für die Anzeige (deutsch).
 */

/** Eine Tageslänge in Millisekunden. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Zahl mit passendem Wort in Einzahl/Mehrzahl, z. B. „1 Liste" / „3 Listen".
 * @param {number} count
 * @param {string} one - Wort für genau 1.
 * @param {string} many - Wort für alles andere (auch 0).
 */
export const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Formatiert einen Zeitpunkt als TT.MM.JJJJ.
 * @param {number|string} value - Zeitstempel in ms oder ISO-Text.
 * @returns {string} Leer bei ungültigem Wert.
 */
export function formatDay(value) {
  const time = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(time)
    ? new Date(time).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
}

/**
 * Relatives Alter in Tagen als Text: „von heute", „vor 1 Tag", „vor 5 Tagen".
 * @param {number} days
 */
export const ageLabel = days => (days === 0 ? "von heute" : `vor ${plural(days, "Tag", "Tagen")}`);

/**
 * Uhrzeit für die kleine Anzeige auf der Startseite, z. B. "14:32".
 * @param {Date} date
 */
export const formatClockTime = date => date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Datum für die kleine Anzeige auf der Startseite, z. B. "So., 27. September".
 * @param {Date} date
 */
export const formatClockDate = date =>
  date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });
