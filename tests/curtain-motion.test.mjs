/*
 * Tests zu den Bewegungsabläufen des Kinovorhangs (js/logic/curtain-motion.js):
 * Kurven, Feder, Ruhebreite und die drei Abläufe (Start geschlossen, Ende
 * exakt in Ruhe, keine Sprünge, keine ungültigen Werte).
 */
import {
  CURTAIN_STYLE_VALUES, DEFAULT_CURTAIN_STYLE, normalizeCurtainStyle, cubicBezier, simulateFollower,
  sampleTrack, restWidth, createCurtainTimeline, restFrame, smoothstep,
} from "../js/logic/curtain-motion.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

console.log("Stile");
check("Vier Stile, Standard „fabric“", CURTAIN_STYLE_VALUES.join() === "fabric,theater,atmosphere,classic" && DEFAULT_CURTAIN_STYLE === "fabric");
check("Unbekannt/leer → Standard, gültig bleibt", normalizeCurtainStyle("disco") === "fabric" && normalizeCurtainStyle(undefined) === "fabric" && normalizeCurtainStyle("theater") === "theater");

console.log("Kurven und Feder");
const ease = cubicBezier(0.66, 0, 0.22, 1);
let monotonic = true, prev = -1;
for (let t = 0; t <= 1.0001; t += 0.01) { const y = ease(t); if (y < prev - 1e-9) monotonic = false; prev = y; }
check("cubic-bezier: 0 → 0, 1 → 1, dazwischen monoton", ease(0) === 0 && ease(1) === 1 && monotonic);
check("cubic-bezier(.25,.1,.25,1) = CSS „ease“ bei t=0.5 (≈ 0.8024)", near(cubicBezier(0.25, 0.1, 0.25, 1)(0.5), 0.8024, 0.001), cubicBezier(0.25, 0.1, 0.25, 1)(0.5));
check("smoothstep wie GLSL", smoothstep(0, 1, -1) === 0 && smoothstep(0, 1, 2) === 1 && smoothstep(0, 1, 0.5) === 0.5);
const step = simulateFollower(t => (t >= 10 ? 1 : 0), { omega: 8, zeta: 0.5, durationMs: 3000 });
let peak = 0;
for (const x of step.position) peak = Math.max(peak, x);
check("Feder schwingt über (ζ < 1) und kommt zur Ruhe", peak > 1.05 && near(sampleTrack(step, 3000), 1, 0.005), [peak, sampleTrack(step, 3000)]);
const damped = simulateFollower(t => (t >= 10 ? 1 : 0), { omega: 8, zeta: 1, durationMs: 3000 });
check("Kritisch gedämpft: kein Überschwingen", Math.max(...damped.position) <= 1.0005);
const delayed = simulateFollower(t => (t >= 10 ? 1 : 0), { omega: 8, zeta: 1, delayMs: 200, durationMs: 1000 });
check("Verzögerung: bewegt sich erst nach delayMs", sampleTrack(delayed, 200) === 0 && sampleTrack(delayed, 450) > 0.1);
check("sampleTrack: außerhalb → Randwerte", sampleTrack(step, -50) === step.position[0] && sampleTrack(step, 99999) === step.position[step.position.length - 1]);

console.log("Ruhebreite (wie --curtain-rest in css/curtain.css)");
check("1600 px → 80 px, 1920 px → 240 px", restWidth(1600, false) === 80 && restWidth(1920, false) === 240);
check("Schmales Fenster (Media-Query greift) → 0", restWidth(1400, true) === 0);
check("Nie negativ", restWidth(1200, false) === 0);

console.log("Abläufe");
const geoms = [
  { name: "1920×1080", W: 962, H: 1080, R: 240 },
  { name: "1600×900", W: 802, H: 900, R: 80 },
  { name: "schmal (R = 0)", W: 602, H: 800, R: 0 },
];
for (const style of ["fabric", "theater", "atmosphere"]) {
  const tl = createCurtainTimeline(style);
  check(`${style}: Kennwerte plausibel (Dauer, Beginn, Deko-Zeitpunkt)`, tl.style === style && tl.duration > 2000 && tl.duration < 3600 && tl.holdEnd < tl.duration && tl.decorCue < tl.duration, [tl.duration, tl.holdEnd, tl.decorCue]);
  for (const g of geoms) {
    const f0 = tl.frame(0, g);
    const end = restFrame(tl, g);
    const closed = f0.kind === "side" ? near(f0.leadTop, g.W) && near(f0.leadBottom, g.W) : near(f0.top, g.W) && near(f0.corner[0], g.W) && near(f0.corner[1], g.H);
    check(`${style} ${g.name}: startet geschlossen`, closed && near(f0.rod, g.W), f0);
    const rested = end.kind === "side" ? near(end.leadTop, g.R) && near(end.leadBottom, g.R) && near(end.gather, 1, 1e-6) : near(end.top, g.R) && near(end.corner[0], g.R * 0.34) && near(end.corner[1], g.H * 0.62);
    check(`${style} ${g.name}: endet exakt in Ruhe (Breite R, ohne Nebenbewegung, Licht normal)`, end.done && rested && near(end.rod, g.R) && end.wave === 0 && end.shadow === 0 && end.dim === 0 && end.ambient === 1 && end.spot === 0, end);
    // Keine ungültigen Werte, keine Sprünge der Kante zwischen zwei Bildern (60 fps)
    let finite = true, maxJump = 0, last = null, inside = true;
    for (let t = 0; t <= tl.duration + 50; t += 1000 / 60) {
      const f = tl.frame(t, g);
      for (const v of Object.values(f)) {
        if (typeof v === "number" && !Number.isFinite(v)) finite = false;
        if (Array.isArray(v) && v.some(n => !Number.isFinite(n))) finite = false;
      }
      const edge = f.kind === "side" ? f.leadBottom : f.corner[0];
      if (edge < -1 || edge > g.W + 1) inside = false;
      if (last !== null) maxJump = Math.max(maxJump, Math.abs(edge - last));
      last = edge;
    }
    check(`${style} ${g.name}: nur gültige Zahlen, Kante bleibt im Bild, kein Sprung > 5 % der Breite`, finite && inside && maxJump < g.W * 0.05, [finite, inside, Math.round(maxJump)]);
  }
}
const atm = createCurtainTimeline("atmosphere");
const g = geoms[0];
check("atmosphere: Saal anfangs dunkel, Scheinwerfer vor dem Öffnen an", atm.frame(0, g).dim === 1 && atm.frame(0, g).ambient < 0.5 && atm.frame(950, g).spot > 0.9 && near(atm.frame(950, g).leadTop, g.W));
check("atmosphere: beim Öffnen fällt Schatten, am Ende nicht mehr", atm.frame(1800, g).shadow > 0.3 && restFrame(atm, g).shadow === 0);
const theater = createCurtainTimeline("theater");
const mid = theater.frame(900, g);
check("theater: Bogen öffnet sich zuerst unten (oben noch zusammen)", near(mid.top, g.W, 1) && mid.corner[0] < g.W - 50 && mid.corner[1] < g.H - 30, mid);
let sagOk = true;
for (let t = 0; t <= theater.duration; t += 10) if (theater.frame(t, g).sag < 0) sagOk = false;
check("theater: Saum hängt nie nach oben durch", sagOk);
const fabric = createCurtainTimeline("fabric");
const f1 = fabric.frame(1000, g);
check("fabric: Saum hängt der Oberkante hinterher (Trägheit)", f1.leadBottom > f1.leadTop + 20, [Math.round(f1.leadTop), Math.round(f1.leadBottom)]);
let overshoot = false;
for (let t = 1900; t < 2600; t += 10) if (fabric.frame(t, g).leadBottom < g.R - 3) overshoot = true;
check("fabric: Saum pendelt am Ende kurz über die Ruhelage hinaus", overshoot);
check("fabric: vor dem Öffnen kurzes Zittern im Stoff", fabric.frame(300, g).wave > 0.1 && near(fabric.frame(300, g).leadTop, g.W));

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
