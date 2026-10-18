import { DAY_MS } from "../utils/format.js";

/*
 * Gemeinsame Logik für Erinnerungen der Art "X ist älter als N Tage"
 * (IMDb-Datenstand, letzte Sicherung). Reine Funktionen, mit Node testbar.
 */

/**
 * Ist eine Erinnerung fällig?
 * @param {{lastAt?: string, intervalDays?: number|string, snoozedUntil?: string}} input
 *   lastAt: letzter Zeitpunkt (ISO), intervalDays: Tage bis zur Erinnerung
 *   (0/ungültig = nie erinnern), snoozedUntil: "Später erinnern" gilt bis (ISO).
 * @param {number} now - aktuelle Zeit in ms.
 * @returns {{due: boolean, off: boolean, never: boolean, ageDays: number|null, intervalDays: number}}
 */
export function ageReminder({ lastAt, intervalDays, snoozedUntil }, now) {
  const interval = Number(intervalDays);
  const last = Date.parse(lastAt || "");
  const never = !Number.isFinite(last);
  const ageDays = never ? null : Math.max(0, Math.floor((now - last) / DAY_MS));
  if (!Number.isFinite(interval) || interval <= 0) {
    return { due: false, off: true, never, ageDays, intervalDays: 0 };
  }
  const snooze = Date.parse(snoozedUntil || "");
  const snoozed = Number.isFinite(snooze) && snooze > now;
  const stale = never || ageDays >= interval;
  return { due: stale && !snoozed, off: false, never, ageDays, intervalDays: interval };
}

/** Zeitpunkt, bis zu dem "Später erinnern" die Erinnerung ausblendet (ISO). */
export function snoozeUntil(now, days = 3) {
  return new Date(now + days * DAY_MS).toISOString();
}
