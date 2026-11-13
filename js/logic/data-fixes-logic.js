/*
 * Ausnahmen für bekannte Fehler in den IMDb-Daten (2.49.1).
 *
 * The Bear: IMDb meldet als Laufzeit 1.611 Minuten (offenbar alle Folgen
 * zusammen) statt der Länge einer Folge. Der Import setzt dann 48 Minuten.
 *
 * Die Ausnahme greift nur, solange IMDb noch einen unplausiblen Wert liefert
 * (mehr als MAX_EPISODE_MINUTES). Korrigiert IMDb die Angabe, übernimmt der
 * nächste Import den IMDb-Wert - die Ausnahme erlischt von selbst. Ob sie
 * gerade greift, zeigt die Detailseite („korrigiert – IMDb meldet …“);
 * gespeichert in runtimeFixedFrom (leer = keine Korrektur).
 * Getestet in tests/data-fixes.test.mjs.
 */

/** Längere „Folgen“ gelten als Fehler (Gesamtlaufzeit statt Folge). */
export const MAX_EPISODE_MINUTES = 300;

/** IMDb-Kennung → Laufzeit, die stattdessen gilt (Minuten). */
export const RUNTIME_FIXES = {
  tt14452776: { title: "The Bear", minutes: 48 },
};

/**
 * Laufzeit nach den Ausnahmen.
 * @param {string} imdbId
 * @param {string} value - Laufzeit aus dem IMDb-Export (Minuten).
 * @returns {{minutes: string, fixedFrom: string}} fixedFrom: ursprünglicher IMDb-Wert, wenn korrigiert, sonst "".
 */
export function fixRuntime(imdbId, value) {
  const fix = RUNTIME_FIXES[String(imdbId || "").trim()];
  const minutes = Number.parseFloat(value);
  if (!fix || !Number.isFinite(minutes) || minutes <= MAX_EPISODE_MINUTES) return { minutes: value, fixedFrom: "" };
  return { minutes: String(fix.minutes), fixedFrom: String(value).trim() };
}
