/*
 * Logo-Animation (Medaillon oben links): Einstellungen und welche Klassen das
 * Logo bekommt. Reine Funktionen, getestet in tests/logo-motion.test.mjs.
 *
 * Dashboard: gespeichert als `logoMotion` (js/storage.js), eingestellt unter
 * Einstellungen → Bewegung. Website: im Browser des Besuchers
 * (localStorage „site:logo-motion"), eingestellt unter „Ansicht".
 * Gezeichnet und bewegt wird in js/ui/brand-medallion.js, die Bewegungen
 * selbst stehen in css/logo.css.
 */

/** Wann sich das Logo bewegt. */
export const LOGO_MODES = [
  { value: "off", label: "Aus" },
  { value: "open", label: "Beim Öffnen" },
  { value: "hover", label: "Beim Darüberfahren" },
  { value: "both", label: "Öffnen + Darüberfahren" },
  { value: "always", label: "Dauerhaft ruhig" },
];

/** Was sich bewegt - frei kombinierbar. */
export const LOGO_EFFECTS = [
  { value: "reels", label: "Filmrollen", note: "Rollen drehen sich, Filmband und Kurbel laufen mit" },
  { value: "light", label: "Projektorlicht", note: "Lichtkegel flackert, Objektiv glimmt, Strahlen drehen sich" },
  { value: "sheen", label: "Messing-Glanz", note: "Lichtschimmer über das Medaillon, die Raute funkelt" },
];

/** Tempo als Faktor auf alle Dauern (größer = langsamer). */
export const LOGO_TEMPOS = [
  { value: "slow", label: "Gemächlich", factor: 1.5 },
  { value: "normal", label: "Normal", factor: 1 },
  { value: "fast", label: "Lebhaft", factor: 0.7 },
];

/** Standard: alles an, beim Öffnen einmal und beim Darüberfahren. */
export const LOGO_DEFAULTS = Object.freeze({ mode: "both", effects: ["reels", "light", "sheen"], tempo: "normal" });

/** So lange dauert „Beim Öffnen" bei normalem Tempo (längste Bewegung samt Puffer). */
export const LOGO_ONCE_MS = 3600;

const MODE_VALUES = LOGO_MODES.map(option => option.value);
const EFFECT_VALUES = LOGO_EFFECTS.map(option => option.value);

/**
 * Liest einen gespeicherten Wert; Unbekanntes fällt auf den Standard zurück.
 * Eine leere Effekt-Liste bleibt leer (alles abgehakt = nichts bewegt sich).
 * @param {*} value
 * @returns {{mode: string, effects: string[], tempo: string}}
 */
export function readLogoMotion(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    mode: MODE_VALUES.includes(raw.mode) ? raw.mode : LOGO_DEFAULTS.mode,
    effects: Array.isArray(raw.effects) ? EFFECT_VALUES.filter(effect => raw.effects.includes(effect)) : [...LOGO_DEFAULTS.effects],
    tempo: LOGO_TEMPOS.some(option => option.value === raw.tempo) ? raw.tempo : LOGO_DEFAULTS.tempo,
  };
}

/** Tempo-Faktor (1 = normal). */
export const logoTempoFactor = motion => LOGO_TEMPOS.find(option => option.value === motion.tempo)?.factor ?? 1;

/** Spielt das Logo beim Öffnen der Seite einmal? */
export const playsOnOpen = motion => motion.effects.length > 0 && (motion.mode === "open" || motion.mode === "both");

/** Dauer von „Beim Öffnen" in ms (mit Tempo). */
export const logoOnceMs = motion => Math.round(LOGO_ONCE_MS * logoTempoFactor(motion));

/**
 * Klassen am Logo (css/logo.css): je Effekt fx-…, dazu once (läuft gerade
 * einmal), hoverable (beim Darüberfahren) oder loop (dauerhaft).
 * @param {{mode: string, effects: string[], tempo: string}} motion
 * @param {{playing?: boolean}} [options] - playing: „einmal" läuft gerade (Öffnen oder Vorschau).
 * @returns {string[]}
 */
export function logoClasses(motion, { playing = false } = {}) {
  if (!motion.effects.length) return [];
  const classes = motion.effects.map(effect => `fx-${effect}`);
  if (playing) classes.push("once");
  if (motion.mode === "hover" || motion.mode === "both") classes.push("hoverable");
  if (motion.mode === "always") classes.push("loop");
  return classes;
}
