import { $, escapeHtml } from "../utils/dom.js";
import {
  activeOccasion, birthdayHints, occasionProgramme, readOccasions, daysText, adventCount, occasionLabel,
} from "../logic/occasions-logic.js";
import { occasionArt, garland, valance, carpet, batsLayer, streamersLayer } from "./occasion-art.js";

/*
 * Anlässe im Foyer (2.50) - die Oberfläche. Auf der Übersicht im Foyer:
 *   - <html data-occasion="…"> (Farben, Licht, Rahmen: css/occasions.css),
 *   - Vitrine neben der Tafel statt des Zitats (Bild und Zeile zum Anlass),
 *   - Girlande über der Tafel, bei der Oscar-Nacht Teppich und Kordeln,
 *   - Effekt-Ebene über der Seite (Schnee, Konfetti, Feuerwerk, Blitze,
 *     Fledermäuse, Luftschlangen) - nie bei „Bewegung reduzieren“,
 *   - Messingschild für anstehende Geburtstage anderer (wegklickbar).
 * Tafel und Kinothek-Reihe holen sich das Programm über currentProgramme()
 * (js/ui/foyer.js, js/ui/home.js). Die Vorschau aus den Einstellungen setzt
 * einen Anlass vorübergehend und zeigt unten eine Leiste „Zurück zu den
 * Einstellungen“. Rechnung: js/logic/occasions-logic.js.
 */

let state = null;
let preview = null;          // Vorschau-Anlass (oder { hint: true })
let onBack = null;
let fx = null;               // { stop() }

const motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const dayKey = (date = new Date()) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Der Anlass, der gerade gilt (Vorschau geht vor). */
export function currentOccasion(appState = state) {
  if (preview) return preview.hint ? null : preview;
  if (!appState) return null;
  return activeOccasion(new Date(), appState.occasions);
}

/** Programm zum Anlass für Tafel und Reihe, oder null (dann das normale). */
export function currentProgramme(appState, { round = 0, count = 12 } = {}) {
  const occasion = currentOccasion(appState);
  if (!occasion) return null;
  const programme = occasionProgramme(occasion.id, appState?.movies || [], { day: preview ? "vorschau" : dayKey(), round, count });
  return { occasion, programme };
}

/* ---- Hinweise auf Geburtstage ---- */
const HINT_KEY = "dashboard:birthday-hints-dismissed";
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(HINT_KEY) || "{}") || {}; } catch { return {}; } };
const saveDismissed = value => { try { localStorage.setItem(HINT_KEY, JSON.stringify(value)); } catch { /* egal */ } };
const hintKey = hint => `${hint.id}@${ymd(hint.on)}`;

function currentHints(appState) {
  if (preview?.hint) {
    const config = readOccasions(appState?.occasions);
    const first = config.birthdays[0];
    const on = new Date(Date.now() + 3 * 86400000);
    return [{ id: "vorschau", name: first?.name || "Sarah", days: 3, on }];
  }
  if (preview) return [];
  const dismissed = readDismissed();
  return birthdayHints(new Date(), appState?.occasions).filter(hint => !dismissed[hintKey(hint)]);
}

function renderHints(appState) {
  $("#occasion-hints")?.remove();
  const hints = currentHints(appState);
  if (!hints.length) return;
  const when = hint => `${daysText(hint.days)} · ${hint.on.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}`;
  document.body.insertAdjacentHTML("beforeend", `<div class="occasion-hints" id="occasion-hints" data-foyer role="status">
    ${hints.slice(0, 3).map(hint => `<div class="occasion-hint" data-hint="${escapeHtml(hintKey(hint))}">
      <span class="occasion-hint-text"><span class="occasion-hint-when">${escapeHtml(when(hint))}</span><span class="occasion-hint-name">${escapeHtml(hint.name || "Jemand")} hat Geburtstag</span></span>
      <button type="button" aria-label="Hinweis auf ${escapeHtml(hint.name || "den Geburtstag")} bis zum Tag ausblenden">×</button></div>`).join("")}
  </div>`);
  $("#occasion-hints").addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const box = button.closest("[data-hint]");
    if (!preview) { const dismissed = readDismissed(); dismissed[box.dataset.hint] = true; saveDismissed(dismissed); }
    box.remove();
    if (!$("#occasion-hints .occasion-hint")) $("#occasion-hints")?.remove();
  });
}

/* ---- Vitrine, Girlande, Teppich ---- */
function caption(occasion, appState) {
  const now = new Date();
  const config = readOccasions(appState?.occasions);
  switch (occasion.id) {
    case "advent": return [`${occasion.advent || 1}. Advent`, `Heute öffnet Türchen ${now.getDate()}.`];
    case "xmas": return ["Weihnachten", "Frohe Weihnachten – die Geschenke liegen bereit."];
    case "nye": return occasion.newYear ? ["Neujahr", `Willkommen in ${now.getFullYear()}!`] : ["Silvester", `Gleich beginnt ${now.getFullYear() + 1}.`];
    case "oscar": return ["Oscar-Nacht", "Der rote Teppich ist ausgerollt."];
    case "halloween": return ["Halloween", "Heute flackert das Licht."];
    case "summer": return ["Sommerkino", "Heute Abend unter freiem Himmel."];
    case "ramadan": return [`Ramadan · Tag ${occasion.ramadanDay || 1}`, "Ramadan Kareem – gesegnete Abende."];
    case "fitr": return ["Eid al-Fitr", "Eid Mubarak – ein gesegnetes Zuckerfest."];
    case "adha": return ["Eid al-Adha", "Eid Mubarak – ein gesegnetes Opferfest."];
    case "bday": return ["Dein Geburtstag", `Alles Gute${occasion.name || config.me.name ? `, ${occasion.name || config.me.name}` : ""}!`];
    case "other": { const names = occasion.names || [occasion.name || "Jemand"]; return ["Geburtstag", `${names.join(" und ")} ${names.length > 1 ? "haben" : "hat"} heute Geburtstag.`]; }
    default: return [occasionLabel(occasion.id), ""];
  }
}

function renderDecor(occasion, appState) {
  const root = document.documentElement;
  ["#occasion-card", "#occasion-garland", "#occasion-carpet", "#occasion-valance", "#occasion-fx"].forEach(sel => $(sel)?.remove());
  fx?.stop(); fx = null;
  if (!occasion) { delete root.dataset.occasion; return; }
  root.dataset.occasion = occasion.id;
  const moving = motion();
  const [eyebrow, line] = caption(occasion, appState);

  const quote = $("#foyer-quote");
  quote?.insertAdjacentHTML("beforebegin", `<div class="occasion-card" id="occasion-card" data-foyer role="img" aria-label="${escapeHtml(`${eyebrow}: ${line}`)}">
      <div class="occasion-art">${occasionArt(occasion, { motion: moving })}</div>
      <span class="foyer-eyebrow">${escapeHtml(eyebrow)}</span>
      <p class="occasion-caption">${escapeHtml(line)}</p></div>`);

  const board = $("#foyer-stage .foyer-board");
  if (board) {
    const art = garland(occasion, board.offsetWidth + 24, { motion: moving });
    if (art) board.insertAdjacentHTML("afterbegin", `<div class="occasion-garland" id="occasion-garland" data-foyer aria-hidden="true">${art}</div>`);
    if (occasion.id === "oscar") { // Premiere: roter Teppich in Perspektive unter der Tafel, Samt-Volant darüber
      board.insertAdjacentHTML("beforeend", `<div class="occasion-carpet" id="occasion-carpet" data-foyer aria-hidden="true">${carpet(board.offsetWidth, 58)}</div>`);
      const stage = $("#foyer-stage");
      stage.insertAdjacentHTML("afterbegin", `<div class="occasion-valance" id="occasion-valance" data-foyer aria-hidden="true">${valance(stage.offsetWidth + 40)}</div>`);
    }
  }
  document.body.insertAdjacentHTML("beforeend", `<div class="occasion-fx" id="occasion-fx" data-foyer aria-hidden="true"><canvas></canvas></div>`);
  const layer = $("#occasion-fx");
  if (occasion.id === "halloween") layer.insertAdjacentHTML("beforeend", batsLayer(innerWidth, innerHeight, { motion: moving }));
  if (occasion.id === "bday") layer.insertAdjacentHTML("beforeend", `<div class="occasion-streamers">${streamersLayer(innerWidth, { motion: moving })}</div>`);
  if (moving) fx = startEffects(occasion, layer.querySelector("canvas"));
}

/* ---- Bewegtes: Schnee, Konfetti, Feuerwerk, Blitze ---- */
const GOLD = ["#e3c27a", "#fff1c4", "#c9a45c", "#f6d58a"];
const PARTY = ["#e0333a", "#e3c27a", "#4aa3c7", "#7cc06b", "#c05ab8", "#fff1c4"];
const ONCE_KEY = "dashboard:occasion-burst";

function startEffects(occasion, canvas) {
  const ctx = canvas.getContext("2d");
  let parts = [];
  let raf = 0;
  let lastFirework = 0;
  let width = 0, height = 0;
  const resize = () => {
    width = innerWidth; height = innerHeight;
    canvas.width = width * devicePixelRatio; canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  };
  resize();
  const flake = (y, colors) => ({ kind: "flake", x: Math.random() * width, y, vx: (Math.random() - 0.5) * 0.8, vy: 1.2 + Math.random() * 1.8, r: 2.2 + Math.random() * 3, a: Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)] });
  const id = occasion.id;
  const snow = occasion.snow;
  const party = id === "bday";
  const fireworks = id === "nye";
  const flashes = id === "oscar";
  // Konfetti-Schwall beim Öffnen (je Tag und Anlass einmal je Stunde, sonst nervt es bei jedem Tab)
  const burstFor = { nye: GOLD, bday: PARTY, other: PARTY, fitr: GOLD, adha: GOLD }[id];
  if (burstFor) {
    let last = {};
    try { last = JSON.parse(localStorage.getItem(ONCE_KEY) || "{}") || {}; } catch { /* egal */ }
    const stamp = `${id}@${dayKey()}@${new Date().getHours()}`;
    if (preview || last.stamp !== stamp) {
      for (let k = 0; k < 170; k++) parts.push(flake(-20 - Math.random() * 260, burstFor));
      if (!preview) try { localStorage.setItem(ONCE_KEY, JSON.stringify({ stamp })); } catch { /* egal */ }
    }
  }
  if (snow) for (let k = 0; k < 80; k++) parts.push({ kind: "snow", x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.3, vy: 0.35 + Math.random() * 0.5, r: 1 + Math.random() * 2 });
  if (party) for (let k = 0; k < 36; k++) parts.push({ ...flake(Math.random() * height, PARTY), vy: 0.45 + Math.random() * 0.5, slow: true });

  const step = time => {
    ctx.clearRect(0, 0, width, height);
    if (fireworks && time - lastFirework > 1500) {
      lastFirework = time;
      const x = width * (0.12 + Math.random() * 0.76), y = 70 + Math.random() * height * 0.22, color = ["#e3c27a", "#fff1c4", "#ffd0a0", "#ffffff"][Math.floor(Math.random() * 4)];
      for (let k = 0; k < 54; k++) { const angle = (k / 54) * Math.PI * 2, speed = 1.3 + Math.random() * 1.8; parts.push({ kind: "spark", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, c: color }); }
    }
    if (flashes) { // Premiere: zwei Suchscheinwerfer hinter der Tafel, Blitzlicht an den Rändern
      const box = $("#foyer-stage .foyer-board")?.getBoundingClientRect();
      if (box) {
        const baseY = box.bottom;
        ctx.save(); // Scheinwerfer laufen hinter der Tafel entlang, nicht über die Schrift
        ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.rect(box.left, box.top, box.width, box.height); ctx.clip("evenodd");
        [[box.left + box.width * 0.18, 1], [box.left + box.width * 0.82, -1]].forEach(([bx, dir], k) => {
          const angle = Math.sin(time / 2600 + k * 1.7) * 0.32 * dir, len = height * 1.3, spread = 0.07;
          const g = ctx.createLinearGradient(bx, baseY, bx + Math.sin(angle) * len, baseY - Math.cos(angle) * len);
          g.addColorStop(0, "rgba(255,244,214,.16)"); g.addColorStop(1, "rgba(255,244,214,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, baseY);
          ctx.lineTo(bx + Math.sin(angle - spread) * len, baseY - Math.cos(angle - spread) * len);
          ctx.lineTo(bx + Math.sin(angle + spread) * len, baseY - Math.cos(angle + spread) * len); ctx.closePath();
          ctx.globalCompositeOperation = "screen"; ctx.fill(); ctx.globalCompositeOperation = "source-over";
        });
        ctx.restore();
        if (Math.random() < 0.028) { const left = Math.random() < 0.5; parts.push({ kind: "flash", x: left ? box.left - 20 + Math.random() * 120 : box.right + 120 + Math.random() * 200, y: box.top + Math.random() * (height - box.top) * 0.8, life: 1 }); }
      }
    }
    if (party && Math.random() < 0.2) parts.push({ ...flake(-10, PARTY), vy: 0.45 + Math.random() * 0.5, slow: true });
    parts = parts.filter(p => (p.kind === "snow" || p.y < height + 20) && (p.life === undefined || p.life > 0));
    for (const p of parts) {
      if (p.kind === "snow") {
        p.x += p.vx; p.y += p.vy; if (p.y > height) { p.y = -4; p.x = Math.random() * width; }
        ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      } else if (p.kind === "spark") {
        p.x += p.vx; p.y += p.vy; p.vy += 0.025; p.vx *= 0.985; p.life -= 0.013;
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 1.9, 0, 7); ctx.fill();
      } else if (p.kind === "flash") {
        p.life -= 0.07;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 54);
        g.addColorStop(0, `rgba(255,255,255,${Math.max(0, p.life) * 0.9})`); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(p.x - 54, p.y - 54, 108, 108);
        ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, p.life) * 0.55})`; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(p.x - 60 * p.life, p.y); ctx.lineTo(p.x + 60 * p.life, p.y); ctx.moveTo(p.x, p.y - 22 * p.life); ctx.lineTo(p.x, p.y + 22 * p.life); ctx.stroke();
      } else {
        p.x += p.vx + (p.slow ? Math.sin(p.a) * 0.4 : 0); p.y += p.vy; p.a += 0.08;
        ctx.globalAlpha = 0.9; ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r, -p.r / 3, p.r * 2, p.r / 1.5); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length || fireworks || flashes || party) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  const onResize = () => resize();
  const onVisible = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(step); };
  addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisible);
  return { stop() { cancelAnimationFrame(raf); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVisible); } };
}

/* ---- Ein- und Ausbauen ---- */
let resizeTimer = 0;
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderDecor(currentOccasion(), state), 200); };

/** Auf der Übersicht im Foyer (aus js/ui/foyer.js, mountHome). */
export function mountOccasion(appState) {
  state = appState;
  renderDecor(currentOccasion(appState), appState);
  renderHints(appState);
  removeEventListener("resize", onResize);
  addEventListener("resize", onResize);
}

/** Beim Wechsel zu Kino-Noir alles abräumen. */
export function unmountOccasion() {
  renderDecor(null);
  $("#occasion-hints")?.remove();
  $("#occasion-preview-bar")?.remove();
  preview = null;
  removeEventListener("resize", onResize);
}

/** Neue Daten (z. B. geänderte Einstellungen): neu aufbauen und Tafel/Reihe benachrichtigen. */
export function refreshOccasion(appState = state) {
  state = appState;
  if (document.documentElement.dataset.skin !== "foyer" || !$("#foyer-stage")) return;
  mountOccasion(appState);
  window.dispatchEvent(new CustomEvent("dashboard:occasion"));
}

/** Beispiel-Anlass für die Vorschau (mit den eigenen Namen, wo vorhanden). */
function sampleOccasion(id, appState) {
  const config = readOccasions(appState?.occasions);
  const now = new Date();
  switch (id) {
    case "advent": return { id, advent: Math.max(1, adventCount(now)) || 2, snow: false };
    case "xmas": return { id, advent: 4, snow: true };
    case "ramadan": return { id, ramadanDay: 12 };
    case "bday": return { id, name: config.me.name };
    case "other": { const name = config.birthdays[0]?.name || "Sarah"; return { id, name, names: [name] }; }
    case "hint": return { hint: true };
    default: return { id };
  }
}

/**
 * Vorschau aus den Einstellungen: Anlass vorübergehend zeigen, unten eine
 * Leiste mit „Zurück zu den Einstellungen“ (ruft `back`).
 * @param {string} id - Anlass oder "hint" (Geburtstags-Hinweis)
 */
export function previewOccasion(id, appState, back) {
  state = appState;
  preview = sampleOccasion(id, appState);
  onBack = back;
  mountOccasion(appState);
  window.dispatchEvent(new CustomEvent("dashboard:occasion"));
  $("#occasion-preview-bar")?.remove();
  const label = id === "hint" ? "Geburtstags-Hinweis" : occasionLabel(id);
  document.body.insertAdjacentHTML("beforeend", `<div class="occasion-preview-bar" id="occasion-preview-bar" data-foyer role="status">
      <span>Vorschau</span><b>${escapeHtml(label)}</b>
      <button type="button" class="foyer-button" id="occasion-preview-back">Zurück zu den Einstellungen</button></div>`);
  const end = () => { document.removeEventListener("keydown", onKey); endPreview(); };
  const onKey = event => { if (event.key === "Escape") end(); };
  $("#occasion-preview-back").addEventListener("click", end);
  document.addEventListener("keydown", onKey);
  $("#occasion-preview-back").focus({ preventScroll: true });
}

/** Vorschau beenden: zurück zum echten Anlass (oder keinem) und zu den Einstellungen. */
export function endPreview() {
  if (!preview) return;
  preview = null;
  $("#occasion-preview-bar")?.remove();
  mountOccasion(state);
  window.dispatchEvent(new CustomEvent("dashboard:occasion"));
  const back = onBack; onBack = null;
  back?.();
}

export const isPreviewing = () => Boolean(preview);
