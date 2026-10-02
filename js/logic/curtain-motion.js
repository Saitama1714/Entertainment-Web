/*
 * Bewegungsabläufe des Kinovorhangs - reine Rechnung, ohne DOM und WebGL,
 * damit sie sich ohne Browser prüfen lassen (tests/curtain-motion.test.mjs).
 *
 * Ein Ablauf ("Timeline") liefert für jeden Zeitpunkt die Form beider
 * Vorhanghälften in Pixeln. Gezeichnet wird das in js/ui/curtain-gl.js,
 * gesteuert von js/ui/curtain.js. Koordinaten gelten für die LINKE Hälfte:
 * x = 0 ist der äußere Bildschirmrand, x = W die Bildschirmmitte; die rechte
 * Hälfte ist gespiegelt.
 *
 * Geometrie je Aufruf (geom): W = halbe Fensterbreite (+1 px Überlappung),
 * H = Fensterhöhe, R = sichtbare Breite im Ruhezustand (freier Rand neben dem
 * Inhalt, 0 bei schmalen Fenstern).
 */

export const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a, b, t) => a + (b - a) * t;

/** Wie GLSL smoothstep: 0 unterhalb e0, 1 oberhalb e1, weich dazwischen. */
export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Weiches Ein- und Ausblenden über ein Zeitfenster [start, end] (in ms). */
export const window01 = (t, start, end) => smoothstep(start, end, t);

/**
 * CSS-cubic-bezier als Funktion (gleiche Kurven wie in den Stylesheets).
 * Löst x(s) = t per Newton-Verfahren, bei flacher Steigung per Bisektion.
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = s => ((ax * s + bx) * s + cx) * s;
  const sampleY = s => ((ay * s + by) * s + cy) * s;
  const slopeX = s => (3 * ax * s + 2 * bx) * s + cx;
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-6) return sampleY(s);
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0, hi = 1;
    s = t;
    for (let i = 0; i < 40; i++) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

/**
 * Sichtbare Vorhangbreite im Ruhezustand - dieselbe Regel wie --curtain-rest
 * in css/curtain.css: der freie Rand neben dem Inhaltsbereich, bei schmalen
 * Fenstern (Media-Query greift) 0.
 * @param {number} viewportWidth - nutzbare Breite ohne Scrollleiste (px).
 * @param {boolean} narrow - true, wenn die Media-Query "(max-width: 1535px)" greift.
 * @param {number} containerMax - Breite des Inhaltsbereichs (px).
 */
export function restWidth(viewportWidth, narrow, containerMax = 1440) {
  if (narrow) return 0;
  return Math.max(0, (viewportWidth - containerMax) / 2);
}

/**
 * Gedämpfte Feder, die einem (bewegten) Ziel folgt - z. B. der untere Saum,
 * der dem oben gezogenen Stoff mit etwas Trägheit hinterherschwingt.
 * Wird einmal mit festem Zeitschritt vorab simuliert und dann nur noch
 * nachgeschlagen: so ist jeder Zeitpunkt reproduzierbar (Tests, Vorschau).
 *
 * @param {(tMs: number) => number} target - Zielwert über der Zeit.
 * @param {{omega: number, zeta: number, delayMs?: number, durationMs: number, stepMs?: number}} options
 *   omega = Eigenfrequenz (rad/s), zeta = Dämpfung (1 = ohne Überschwingen).
 * @returns {{position: Float32Array, velocity: Float32Array, stepMs: number}}
 */
export function simulateFollower(target, { omega, zeta, delayMs = 0, durationMs, stepMs = 1000 / 240 }) {
  const steps = Math.ceil(durationMs / stepMs) + 1;
  const position = new Float32Array(steps);
  const velocity = new Float32Array(steps);
  const dt = stepMs / 1000;
  let x = target(-delayMs);
  let v = 0;
  for (let i = 0; i < steps; i++) {
    position[i] = x;
    velocity[i] = v;
    const goal = target(i * stepMs - delayMs);
    // Semi-implizites Euler-Verfahren: stabil auch bei kleiner Dämpfung
    const accel = omega * omega * (goal - x) - 2 * zeta * omega * v;
    v += accel * dt;
    x += v * dt;
  }
  return { position, velocity, stepMs };
}

/** Wert einer vorab simulierten Spur zum Zeitpunkt tMs (linear interpoliert). */
export function sampleTrack(track, tMs, key = "position") {
  const values = track[key];
  const f = Math.max(0, tMs) / track.stepMs;
  const i = Math.floor(f);
  if (i >= values.length - 1) return values[values.length - 1];
  return mix(values[i], values[i + 1], f - i);
}

/* -------------------------------------------------------------------------
 * Ablauf „Lebendiger Stoff": seitlich öffnend, aber mit Trägheit. Der Stoff zittert
 * kurz, wenn an der Schnur gezogen wird; oben führt die Kante, der Saum
 * schwingt hinterher und pendelt am Ende sanft aus. Beim Raffen staut sich
 * der Stoff zuerst am äußeren Rand (dichtere Falten), in Ruhe liegen die
 * Falten wieder gleichmäßig.
 * ---------------------------------------------------------------------- */
function fabricTimeline() {
  const HOLD = 380, MOVE = 1650, DURATION = 2700;
  const ease = cubicBezier(0.62, 0, 0.24, 1);
  const top = t => ease(clamp01((t - HOLD) / MOVE));
  const bottom = simulateFollower(top, { omega: 7.2, zeta: 0.5, delayMs: 90, durationMs: DURATION });
  // Höchstgeschwindigkeit der Oberkante (für die Normierung der Nebenbewegung)
  let maxVel = 0;
  for (let t = HOLD; t <= HOLD + MOVE; t += 5) maxVel = Math.max(maxVel, (top(t + 2) - top(t - 2)) / 4);

  return {
    duration: DURATION, holdEnd: HOLD, decorCue: 2150,
    frame(t, { W, R }) {
      const pTop = top(t);
      const pBottom = sampleTrack(bottom, t);
      const vel = (top(t + 2) - top(t - 2)) / 4 / maxVel;          // 0..1
      const swing = Math.min(1, Math.abs(sampleTrack(bottom, t, "velocity")) * 1.4);
      // Kurzes Zittern, wenn die Schnur anzieht (vor der eigentlichen Bewegung)
      const tug = Math.sin(Math.PI * clamp01((t - 110) / (HOLD + 160))) ** 2;
      const settle = window01(t, DURATION - 260, DURATION);           // letzte Millisekunden: exakt in Ruhe
      const travel = W - R;
      return {
        leadTop: W - travel * pTop,
        leadBottom: Math.max(0, mix(W - travel * pBottom, R, settle)),
        gather: 1 + 1.15 * vel * (1 - settle),
        waveX: (4 * vel + 3 * swing) * (1 - settle),
        wave: (0.28 * tug + 0.55 * vel + 0.35 * swing) * (1 - settle),
        wavePhase: t * 0.0062,
        rod: W - travel * pTop,
        shadow: 0.3 * (1 - window01(t, 1700, DURATION - 150)),
        done: t >= DURATION,
      };
    },
  };
}

/** Der Ablauf des Vorhangs (gezeichnet in js/ui/curtain-gl.js). */
export function createCurtainTimeline() {
  return fabricTimeline();
}

/** Zustand in Ruhe (Endbild) - identisch mit dem letzten Frame. */
export function restFrame(timeline, geom) {
  return timeline.frame(timeline.duration + 1, geom);
}
