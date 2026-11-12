import { UNIVERSE_INTRO_OPTIONS } from "./universe-logic.js";

/*
 * Aufbau der Übersicht beim Öffnen (2.44): Die Seite baut sich Stück für
 * Stück auf - wahlweise „Saallicht und Neon", „Lichtkegel des Projektors",
 * „Filmstreifen" oder (seit 2.45) die Kombinationen „Lichtkegel und
 * Saallicht" und „Filmstreifen und Neon". Wann er spielt, regelt dieselbe Auswahl wie beim
 * Urknall (Standard jede Stunde); kommt der Kinovorhang dazu, beginnt der
 * Aufbau, wenn der Vorhang offen ist.
 *
 * Hier die reine Rechnung (Stile, Zeitplan der Stücke), getestet in
 * tests/page-build.test.mjs. Ob er spielt, entscheidet js/boot.js vor dem
 * ersten Zeichnen (gleiche Regeln wie introDue); das Abspielen macht
 * js/ui/page-build.js, das Aussehen css/page-build.css.
 */

export const BUILD_STYLES = [
  { value: "light", label: "Saallicht und Neon" },
  { value: "beam", label: "Lichtkegel des Projektors" },
  { value: "film", label: "Filmstreifen" },
  { value: "beam-light", label: "Lichtkegel und Saallicht" },  // 2.45: Kombinationen (Nutzerwahl)
  { value: "film-neon", label: "Filmstreifen und Neon" },
];
export const DEFAULT_BUILD_STYLE = "light";
export const BUILD_INTRO_OPTIONS = UNIVERSE_INTRO_OPTIONS;
export const DEFAULT_BUILD_INTRO = "hourly";

/** Gültiger Stil (Unbekanntes → Standard). */
export const readBuildStyle = value => (BUILD_STYLES.some(style => style.value === value) ? value : DEFAULT_BUILD_STYLE);

/** Gesamtdauer je Stil in ms (danach ist alles sicher fertig). */
export const BUILD_DURATION = { light: 1500, beam: 1600, film: 1500, "beam-light": 1700, "film-neon": 1800 };

const TILE_STAGGER = 55;   // ms zwischen Kacheln/Covern einer Reihe
const BAR_STAGGER = 50;    // ms zwischen den Teilen der Kopfleiste
const FIRST_CONTENT = 260; // ms: hier beginnt der Inhalt unter der Kopfleiste

/**
 * Zeitplan „Saallicht und Neon": wann welches Stück angeht.
 * Logo zuerst, dann die Kopfleiste, dann der Inhalt von oben nach unten;
 * Kacheln einer Gruppe nacheinander. Alles wird so gestaucht, dass das
 * letzte Stück spätestens bei maxDelay beginnt - der Aufbau bleibt kurz,
 * egal wie voll die Seite ist.
 * @param {{role: string, top: number, group?: string}[]} pieces
 *   role: logo | bar | title | panel | neon | head | tile
 * @param {{viewport?: number, maxDelay?: number}} [options]
 * @returns {number[]} Verzögerung je Stück (ms), Reihenfolge wie pieces.
 */
export function buildTimeline(pieces, { viewport = 900, maxDelay = 950 } = {}) {
  if (!pieces.length) return [];
  const delays = new Array(pieces.length).fill(0);
  let bar = 0;
  const content = [];
  pieces.forEach((piece, index) => {
    if (piece.role === "logo") delays[index] = 0;
    else if (piece.role === "bar") delays[index] = 120 + BAR_STAGGER * bar++;
    else content.push(index);
  });
  if (!content.length) return delays;
  const firstTop = Math.min(...content.map(index => pieces[index].top));
  const inGroup = new Map();
  for (const index of content) {
    const { top, group } = pieces[index];
    const step = group ? inGroup.get(group) ?? 0 : 0;
    if (group) inGroup.set(group, step + 1);
    const depth = Math.max(0, top - firstTop) / Math.max(1, viewport);
    delays[index] = FIRST_CONTENT + depth * 640 + step * TILE_STAGGER;
  }
  // Stauchen, wenn es zu lang würde (nur der Inhalt, Logo und Leiste bleiben)
  const last = Math.max(...content.map(index => delays[index]));
  if (last > maxDelay) {
    const factor = (maxDelay - FIRST_CONTENT) / (last - FIRST_CONTENT);
    for (const index of content) delays[index] = FIRST_CONTENT + (delays[index] - FIRST_CONTENT) * factor;
  }
  return delays.map(Math.round);
}
