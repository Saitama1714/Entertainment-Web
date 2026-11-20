import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { MOVIE_QUOTES } from "../data/movie-quotes.js";
import { MOVIE_TRIVIA } from "../data/movie-trivia.js";
import { quoteOfDay } from "../logic/quote-logic.js";
import { saveDashboardData } from "../storage.js";
import { localCoverUrl } from "../cover-store.js";
import { fetchPosterByTitle } from "../cover.js";
import { streamersLayer } from "./occasion-art.js";
import {
  matchMovie, pickDistractors, shuffle, nextFromDeck, quizHints, scoreAnswer, statsLine, parseSource, emptyQuizStats,
  QUIZ_CATEGORIES, readCategories, computedQuestion,
} from "../logic/quiz-logic.js";

/*
 * Quizabend (Filmquiz, Ziel 8) im Kino-Noir-Stil: Fragen aus Zitaten, Trivia,
 * Personen, Fakten & Zahlen und deiner Kinothek - geantwortet wird immer über
 * vier Cover. Kategorien als Checkboxen (Standard: alle an, gemerkt).
 * Zwei Eingänge: Klick aufs Zitat des Tages (Ebene über der Übersicht, erste
 * Frage = dieses Zitat) und der Reiter „Quizabend" unter Entertainment.
 * „Tipp" gibt der Reihe nach Hinweise und nimmt zuletzt eine falsche Antwort
 * weg; daneben die Trefferquote mit „Statistik zurücksetzen".
 * Unter jedem Cover stehen zwei kleine Scheinwerfer, abgesenkt. Auflösung:
 * Saal wird dunkler, die Scheinwerfer unter dem richtigen Cover schwenken
 * hoch. Richtig: Konfetti und Luftschlangen. Falsch: die Scheinwerfer
 * wechseln nach einem Moment fließend in gedämpftes Rot.
 * Filme außerhalb der Kinothek holen ihr Plakat über OMDb (gemerkt in
 * quizPosters); fehlt auch nur ein Bild, spielen alle vier als Titelkarten.
 */

const QUOTE_DECK = "dashboard:quote-quiz-deck";
const TRIVIA_DECK = "dashboard:quiz-trivia-deck";
const CONFETTI = ["#e3c27a", "#fff1c4", "#c62a32", "#f2e6d0", "#d9a441", "#9c0205"];
const WRONG_DELAY = 1700; // erst heben sich die Scheinwerfer und leuchten normal, dann werden sie rot
const KICKER = { quotes: "Aus welchem Film stammt dieses Zitat?", trivia: "Trivia", people: "Personen", facts: "Fakten & Zahlen", mine: "Deine Kinothek" };
const TIP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const readDeck = key => { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; } };
const writeDeck = (key, deck) => { try { localStorage.setItem(key, JSON.stringify(deck)); } catch { /* egal */ } };

/** Bild zu einer Antwort: Cover der Kinothek (lokal, wenn gespeichert) oder Plakat aus OMDb. */
async function imageFor(choice) {
  if (!choice.cover) return "";
  return (await localCoverUrl(choice.cover)) || choice.cover;
}

/** Lädt ein Bild vorab; false bei Fehler oder wenn es zu lange dauert. */
const preload = (src, ms = 4000) => new Promise(resolve => {
  if (!src) return resolve(false);
  const img = new Image();
  const timer = setTimeout(() => resolve(false), ms);
  img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
  img.onerror = () => { clearTimeout(timer); resolve(false); };
  img.src = src;
});

const RETRY_MS = 14 * 864e5; // „kein Plakat" nach zwei Wochen erneut versuchen

/**
 * Plakat für einen Film außerhalb der Kinothek (einmal holen, dann gemerkt).
 * Sucht unter dem Titel der Quelle und, falls hinterlegt, unter dem
 * internationalen Titel (`omdb`, z. B. „Run Lola Run“ für „Lola rennt“).
 * Gemerkt wird nur eine endgültige Antwort von OMDb - nie ein Tageslimit,
 * ein Netzfehler oder ein Bild, das gerade nicht lud. „Kein Plakat" gilt
 * zwei Wochen. Schlüssel "v3|…": ältere Einträge (auch Fehlschläge) zählen nicht.
 */
async function outsidePoster(appState, source, omdb) {
  const posters = appState.quizPosters || (appState.quizPosters = {});
  const key = `v3|${source}`;
  const known = posters[key];
  if (known && (known.u || Date.now() - known.t < RETRY_MS)) return known.u;
  if (!appState.omdbApiKey) return "";
  const { title, year } = parseSource(source);
  let found = { url: "", final: true };
  for (const name of [title, omdb].filter(Boolean)) {
    const answer = await fetchPosterByTitle(name, year, appState.omdbApiKey);
    if (answer.url) { found = answer; break; }
    if (!answer.final) found = answer;
  }
  if (found.url && !(await preload(found.url))) return ""; // Bild lud gerade nicht: nicht merken
  if (!found.final) return "";
  for (const old of Object.keys(posters)) if (!old.startsWith("v3|")) delete posters[old];
  posters[key] = { u: found.url, t: Date.now() };
  saveDashboardData({ quizPosters: posters }).catch(() => {});
  return found.url;
}

/** Frage aus einem Katalog (Zitat oder Trivia): Antwort aus der Kinothek oder per Plakat. */
async function catalogQuestion(appState, category, entry) {
  const movies = appState.movies || [];
  const source = category === "quotes" ? entry.source : entry.a;
  const { title, year } = parseSource(source);
  const own = matchMovie(movies, source);
  const answer = own
    ? { ...own, inKinothek: true }
    : { id: `quiz:${source}`, title, year, genre: "", cover: await outsidePoster(appState, source, entry.omdb) };
  const wrong = pickDistractors(movies, answer, { needCover: Boolean(answer.cover) });
  return {
    category, prompt: category === "quotes" ? entry.quote : entry.q, answer, wrong,
    hints: quizHints(own || answer, source), details: {},
  };
}

/** Nächster Eintrag eines Katalogs aus seinem Stapel (keine Wiederholung, bis alle dran waren). */
function fromDeck(list, key) {
  const picked = nextFromDeck(list.length, readDeck(key));
  writeDeck(key, picked.deck);
  return list[picked.index];
}

/** Baut die nächste Frage aus einer der gewählten Kategorien. */
async function makeQuestion(appState, { firstQuote = null } = {}) {
  const movies = appState.movies || [];
  const enabled = readCategories(appState.quizCategories);
  let raw = null;
  if (firstQuote) raw = await catalogQuestion(appState, "quotes", firstQuote);
  for (let attempt = 0; !raw && attempt < 8; attempt++) {
    const category = enabled[Math.floor(Math.random() * enabled.length)];
    if (category === "quotes") raw = await catalogQuestion(appState, category, fromDeck(MOVIE_QUOTES, QUOTE_DECK));
    else if (category === "trivia") raw = await catalogQuestion(appState, category, fromDeck(MOVIE_TRIVIA, TRIVIA_DECK));
    else {
      const q = computedQuestion(category, { movies, cast: appState.castData || {} });
      if (q) {
        const remove = { kind: "remove", text: "Eine falsche Antwort fällt weg" };
        raw = { ...q, wrong: q.choices.filter(m => m !== q.answer), hints: category === "people" ? quizHints(q.answer, "") : [remove, remove] };
      }
    }
    if (raw && raw.wrong.length < 3) raw = null;
  }
  if (!raw) return null;

  const { answer } = raw;
  let covers = Boolean(answer.cover);
  const order = raw.choices || shuffle([answer, ...raw.wrong]);
  let choices = order.map(movie => ({
    id: movie.id, title: movie.title || movie.originalTitle, year: movie.year, cover: covers ? movie.cover : "",
    right: movie === answer, detail: raw.details[movie.id] || "",
  }));
  // Alle vier Bilder vorab laden: fehlt auch nur eins, spielen alle als Titelkarten
  // (sonst verrät ein leerer Rahmen die Antwort oder es sieht kaputt aus)
  if (covers) {
    const sources = await Promise.all(choices.map(imageFor));
    const loaded = await Promise.all(sources.map(src => preload(src)));
    if (loaded.every(Boolean)) choices = choices.map((choice, i) => ({ ...choice, src: sources[i] }));
    else { covers = false; choices = choices.map(choice => ({ ...choice, cover: "" })); }
  }
  let note = "";
  if (!covers) note = answer.cover ? "Nicht alle Cover ließen sich laden – diesmal mit Titelkarten." : "Kein Plakat zu diesem Film gefunden – diesmal mit Titelkarten.";
  return { category: raw.category, prompt: raw.prompt, answer, choices, covers, note, hints: raw.hints, hintStep: 0, done: false };
}

/* Kleiner Bühnenscheinwerfer: Bügel steht, der Kopf schwenkt (0° = Linse nach oben). */
const LAMP = side => `<span class="qq-lamp qq-lamp-${side}"><span class="qq-lamp-head"><span class="qq-beam"></span>
  <svg viewBox="0 0 20 26" focusable="false"><rect x="4" y="4" width="12" height="17" rx="2.5" class="qq-lamp-body"/><rect x="5.5" y="21" width="9" height="3" rx="1" class="qq-lamp-body"/><ellipse cx="10" cy="4.2" rx="6" ry="2" class="qq-lamp-lens"/></svg></span>
  <svg class="qq-lamp-yoke" viewBox="0 0 26 14" focusable="false"><path d="M3 2 V9 H23 V2" fill="none"/><rect x="9" y="9" width="8" height="4" rx="1"/></svg></span>`;

function choiceHtml(choice, index) {
  const label = `${escapeHtml(choice.title)}${choice.year ? ` (${choice.year})` : ""}`;
  return `<button class="qq-choice" type="button" data-index="${index}" aria-label="${label}">
    <span class="qq-frame">${choice.cover
      ? `<img class="qq-cover" alt="" decoding="async">`
      : `<span class="qq-plate"><span class="qq-plate-rule"></span><span class="qq-plate-title">${escapeHtml(choice.title)}</span><span class="qq-plate-rule"></span></span>`}</span>
    <span class="qq-lamps" aria-hidden="true">${LAMP("l")}${LAMP("r")}</span>
    <span class="qq-caption">${escapeHtml(choice.title)}</span>
    ${choice.detail ? `<span class="qq-fact">${escapeHtml(choice.detail)}</span>` : ""}</button>`;
}

function statsHtml(stats) {
  const line = statsLine(stats);
  return `<span class="qq-stat"><b>${escapeHtml(line.hits)}</b></span><span class="qq-stat">${escapeHtml(line.rate)}</span><span class="qq-stat">${escapeHtml(line.streak)}</span><span class="qq-stat">${escapeHtml(line.best)}</span>`;
}

const categoriesHtml = enabled => QUIZ_CATEGORIES.map(c =>
  `<label class="qq-cat"><input type="checkbox" name="quiz-category" value="${c.id}"${enabled.includes(c.id) ? " checked" : ""}><span>${escapeHtml(c.label)}</span></label>`).join("");

/**
 * Baut ein Quiz in `root` (Ebene oder Reiter).
 * @param {HTMLElement} root
 * @param {{ getState: () => object, overlay?: boolean, detailBase?: string, onClose?: () => void, firstQuote?: object }} options
 */
function createQuiz(root, { getState, overlay = false, detailBase = "views/movie.html", onClose = () => {}, firstQuote = null }) {
  const appState = () => getState();
  let question = null;
  let raf = 0;
  let pendingFirst = firstQuote;
  let alive = true;
  root.classList.add("quiz-night");
  root.innerHTML = `
    <div class="qq-curtain qq-curtain-l" aria-hidden="true"></div><div class="qq-curtain qq-curtain-r" aria-hidden="true"></div>
    <div class="qq-stage">
      <header class="qq-head">
        <p class="qq-eyebrow" id="qq-title-${overlay ? "o" : "p"}">Quizabend</p>
        ${overlay ? `<button class="qq-close" type="button" aria-label="Quizabend schließen">×</button>` : ""}
      </header>
      <fieldset class="qq-cats"><legend class="visually-hidden">Kategorien</legend>${categoriesHtml(readCategories(appState().quizCategories))}</fieldset>
      <blockquote class="qq-marquee"><p class="qq-kicker"></p><p class="qq-quote"></p><p class="qq-note" hidden></p></blockquote>
      <div class="qq-choices" role="group" aria-label="Antworten"></div>
      <div class="qq-result" aria-live="polite"><p class="qq-verdict"></p><button class="qq-next" type="button" hidden>Nächste Frage ▸</button></div>
      <footer class="qq-rail">
        <button class="qq-tip" type="button">${TIP_ICON}<span>Tipp</span></button>
        <ul class="qq-hints"></ul>
        <div class="qq-score"><div class="qq-stats" aria-label="Trefferquote">${statsHtml(appState().quizStats || emptyQuizStats())}</div>
        <div class="qq-reset"><button class="qq-reset-start" type="button">Statistik zurücksetzen</button></div></div>
      </footer>
    </div>
    <div class="qq-fx" aria-hidden="true"></div>`;
  const $q = selector => root.querySelector(selector);

  function render() {
    const q = question;
    root.classList.remove("is-reveal", "is-right", "is-wrong", "is-red");
    root.dataset.category = q?.category || "";
    $q(".qq-hints").innerHTML = "";
    $q(".qq-verdict").innerHTML = "";
    $q(".qq-next").hidden = true;
    $q(".qq-fx").innerHTML = "";
    if (!q) {
      $q(".qq-kicker").textContent = "";
      $q(".qq-quote").textContent = "Für diese Auswahl gibt es gerade keine Frage – wähl weitere Kategorien.";
      $q(".qq-choices").innerHTML = "";
      $q(".qq-tip").disabled = true;
      return;
    }
    $q(".qq-kicker").textContent = KICKER[q.category] || "";
    $q(".qq-quote").textContent = q.prompt;
    $q(".qq-quote").classList.toggle("is-quote", q.category === "quotes");
    const tip = $q(".qq-tip");
    tip.disabled = false;
    tip.querySelector("span").textContent = `Tipp 1/${q.hints.length}`;
    const note = $q(".qq-note");
    note.textContent = q.note;
    note.hidden = !q.note;
    const grid = $q(".qq-choices");
    grid.innerHTML = q.choices.map(choiceHtml).join("");
    q.choices.forEach((choice, i) => { if (choice.cover) grid.querySelector(`[data-index="${i}"] img`).src = choice.src; });
    if (overlay || root.contains(document.activeElement)) grid.querySelector(".qq-choice")?.focus({ preventScroll: true });
  }

  async function next() {
    root.classList.add("is-loading");
    const first = pendingFirst;
    pendingFirst = null;
    const q = await makeQuestion(appState(), { firstQuote: first });
    if (!alive) return;
    question = q;
    root.classList.remove("is-loading");
    render();
  }

  function giveHint() {
    const q = question;
    if (!q || q.done || q.hintStep >= q.hints.length) return;
    const hint = q.hints[q.hintStep++];
    if (hint.kind === "remove") {
      const wrong = [...root.querySelectorAll(".qq-choice")].filter(el => !q.choices[el.dataset.index].right && !el.disabled);
      const gone = wrong[Math.floor(Math.random() * wrong.length)];
      if (gone) { gone.disabled = true; gone.classList.add("is-out"); }
    }
    $q(".qq-hints").insertAdjacentHTML("beforeend", `<li>${escapeHtml(hint.text)}</li>`);
    const tip = $q(".qq-tip");
    tip.querySelector("span").textContent = q.hintStep < q.hints.length ? `Tipp ${q.hintStep + 1}/${q.hints.length}` : "Keine Tipps mehr";
    tip.disabled = q.hintStep >= q.hints.length;
  }

  /* Die beiden Scheinwerfer unter dem richtigen Cover schwenken nach oben und leuchten es an */
  function raiseLamps(button) {
    const frame = button.querySelector(".qq-frame").getBoundingClientRect();
    button.querySelectorAll(".qq-lamp").forEach(lamp => {
      const head = lamp.querySelector(".qq-lamp-head").getBoundingClientRect();
      const fromX = head.left + head.width / 2, fromY = head.top + head.height / 2;
      const toX = frame.left + frame.width / 2, toY = frame.top + frame.height * 0.45;
      const tilt = Math.atan2(toX - fromX, fromY - toY) * 180 / Math.PI;
      lamp.style.setProperty("--qq-tilt", `${tilt.toFixed(1)}deg`);
      lamp.style.setProperty("--qq-beam-len", `${Math.round(Math.hypot(toX - fromX, fromY - toY) + frame.height * 0.5)}px`);
      lamp.style.setProperty("--qq-beam-w", `${Math.round(frame.width * 1.05)}px`);
    });
    requestAnimationFrame(() => button.classList.add("is-lit"));
  }

  /* Konfetti aus beiden unteren Ecken und von oben, dazu Luftschlangen */
  function celebrate() {
    const fx = $q(".qq-fx");
    fx.innerHTML = `<canvas></canvas><div class="qq-streamers">${streamersLayer(Math.max(320, root.clientWidth), { motion: true })}</div>`;
    if (reducedMotion()) return;
    const canvas = fx.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const w = root.clientWidth, h = root.clientHeight, dpr = devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const parts = [];
    const add = (x, y, vx, vy) => parts.push({ x, y, vx, vy, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, s: 5 + Math.random() * 6, c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)] });
    for (let i = 0; i < 90; i++) add(0, h, 4 + Math.random() * 7, -(9 + Math.random() * 9));
    for (let i = 0; i < 90; i++) add(w, h, -(4 + Math.random() * 7), -(9 + Math.random() * 9));
    for (let i = 0; i < 70; i++) add(Math.random() * w, -20 - Math.random() * 200, (Math.random() - 0.5) * 2, 1 + Math.random() * 2);
    const start = performance.now();
    const step = now => {
      if (!alive || !canvas.isConnected) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.22; p.vx *= 0.99; p.vy = Math.min(p.vy, 4.2);
        p.x += p.vx + Math.sin(p.a) * 0.6; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (now - start < 4200) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(step);
  }

  function answer(button) {
    const q = question;
    if (!q || q.done || button.disabled) return;
    q.done = true;
    const chosen = q.choices[button.dataset.index];
    const rightButton = root.querySelector(`.qq-choice[data-index="${q.choices.findIndex(c => c.right)}"]`);
    root.querySelectorAll(".qq-choice").forEach(el => { el.disabled = true; });
    button.classList.add("is-chosen");
    rightButton.classList.add("is-answer");
    root.classList.add("is-reveal");
    raiseLamps(rightButton);

    const state = appState();
    const stats = scoreAnswer(state.quizStats, chosen.right);
    state.quizStats = stats;
    saveDashboardData({ quizStats: stats }).catch(() => {});
    $q(".qq-stats").innerHTML = statsHtml(stats);

    const name = `${escapeHtml(q.answer.title || q.answer.originalTitle)}${q.answer.year ? ` <span>(${q.answer.year})</span>` : ""}`;
    const link = q.answer.imdbId || q.answer.inKinothek || !String(q.answer.id).startsWith("quiz:")
      ? ` <a class="qq-detail" href="${detailBase}?id=${encodeURIComponent(q.answer.id)}">Zur Detailseite</a>` : "";
    const verdict = $q(".qq-verdict");
    if (chosen.right) {
      root.classList.add("is-right");
      verdict.innerHTML = `<b>Richtig!</b> ${name}${link}`;
      celebrate();
    } else {
      root.classList.add("is-wrong");
      verdict.innerHTML = `<b>Leider nein.</b> Es war ${name}${link}`;
      setTimeout(() => { if (question === q) root.classList.add("is-red"); }, reducedMotion() ? 0 : WRONG_DELAY);
    }
    const nextButton = $q(".qq-next");
    nextButton.hidden = false;
    nextButton.focus({ preventScroll: true });
  }

  /* Statistik zurücksetzen: Rückfrage direkt in der Leiste (kein Browser-Dialog) */
  function askReset(ask) {
    const box = $q(".qq-reset");
    box.innerHTML = ask
      ? `<span class="qq-reset-ask">Statistik wirklich löschen?</span><button class="qq-reset-yes" type="button">Ja, zurücksetzen</button><button class="qq-reset-no" type="button">Abbrechen</button>`
      : `<button class="qq-reset-start" type="button">Statistik zurücksetzen</button>`;
    box.querySelector(ask ? ".qq-reset-no" : ".qq-reset-start").focus({ preventScroll: true });
  }

  function resetStats() {
    const stats = emptyQuizStats();
    appState().quizStats = stats;
    saveDashboardData({ quizStats: stats }).catch(() => {});
    $q(".qq-stats").innerHTML = statsHtml(stats);
    askReset(false);
  }

  /* Kategorien: mindestens eine bleibt an; gilt ab der nächsten Frage (oder sofort, wenn keine da ist) */
  root.addEventListener("change", event => {
    if (event.target.name !== "quiz-category") return;
    const boxes = [...root.querySelectorAll('input[name="quiz-category"]')];
    if (!boxes.some(b => b.checked)) { event.target.checked = true; event.target.closest(".qq-cat").animate?.([{ transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], 240); return; }
    const list = boxes.filter(b => b.checked).map(b => b.value);
    appState().quizCategories = list;
    saveDashboardData({ quizCategories: list }).catch(() => {});
    if (!question) next();
  });

  root.addEventListener("click", event => {
    const choice = event.target.closest(".qq-choice");
    if (choice) return answer(choice);
    if (event.target.closest(".qq-tip")) return giveHint();
    if (event.target.closest(".qq-next")) return next();
    if (event.target.closest(".qq-close")) return onClose();
    if (event.target.closest(".qq-reset-start")) return askReset(true);
    if (event.target.closest(".qq-reset-no")) return askReset(false);
    if (event.target.closest(".qq-reset-yes")) return resetStats();
  });

  const keyHandler = event => {
    if (overlay && event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (!question || question.done || !root.offsetParent && !overlay) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable], a") || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[1-4]$/.test(event.key)) {
      const el = root.querySelector(`.qq-choice[data-index="${Number(event.key) - 1}"]`);
      if (el) answer(el);
    } else if (event.key === "t" || event.key === "T") giveHint();
  };
  document.addEventListener("keydown", keyHandler);

  return {
    start: () => (question ? Promise.resolve() : next()),
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", keyHandler);
    },
  };
}

/* ---- Eingang 1: das Zitat des Tages (Ebene über der Übersicht) -------- */

let overlayQuiz = null;

/**
 * Macht das Zitat des Tages zum Eingang in den Quizabend (nur Dashboard).
 * @param {() => object} getState - liefert den aktuellen Zustand (Kinothek, Einstellungen).
 */
export function bindQuoteQuiz(getState) {
  const box = document.querySelector("#quote-of-day");
  if (!box || box.dataset.quiz) return;
  box.dataset.quiz = "1";
  box.classList.add("is-quiz-door");
  box.tabIndex = 0;
  box.setAttribute("role", "button");
  box.setAttribute("aria-label", "Quizabend öffnen");
  if (!box.querySelector(".quiz-night-cue")) box.insertAdjacentHTML("beforeend", `<span class="quiz-night-cue" aria-hidden="true">Quizabend ▸</span>`);
  const go = event => {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openQuizOverlay(getState);
  };
  box.addEventListener("click", go);
  box.addEventListener("keydown", go);
}

/** Öffnet den Quizabend als Vollbild-Ebene; erste Frage ist das Zitat des Tages. */
export async function openQuizOverlay(getState) {
  if (overlayQuiz) return;
  const root = document.createElement("div");
  root.className = "is-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "qq-title-o");
  const lastFocus = document.activeElement;
  const quiz = createQuiz(root, { getState, overlay: true, onClose: closeQuizOverlay, firstQuote: quoteOfDay(MOVIE_QUOTES) });
  overlayQuiz = { root, quiz, lastFocus };
  document.body.append(root);
  document.documentElement.classList.add("has-quiz-night");
  requestAnimationFrame(() => root.classList.add("is-open"));
  await quiz.start();
}

export function closeQuizOverlay() {
  if (!overlayQuiz) return;
  const { root, quiz, lastFocus } = overlayQuiz;
  overlayQuiz = null;
  quiz.destroy();
  document.documentElement.classList.remove("has-quiz-night");
  root.classList.remove("is-open");
  const gone = () => root.remove();
  if (reducedMotion()) gone(); else setTimeout(gone, 320);
  lastFocus?.focus?.({ preventScroll: true });
}

export const isQuizOverlayOpen = () => Boolean(overlayQuiz);

/* ---- Eingang 2: Reiter „Quizabend" unter Entertainment ----------------- */

/**
 * Quizabend im Reiter (views/movies.html). Startet erst beim ersten Zeigen.
 * @param {HTMLElement} panel
 * @param {() => object} getState
 * @returns {{ show: () => void }}
 */
export function initQuizPanel(panel, getState) {
  panel.classList.add("is-inline");
  const quiz = createQuiz(panel, { getState, detailBase: "movie.html" });
  // Genau so hoch wie der sichtbare Rest des Fensters: nichts zu scrollen, die Leiste mit Tipps sitzt unten
  const fit = () => {
    if (panel.hidden) return;
    const top = panel.getBoundingClientRect().top + scrollY;
    const height = Math.max(480, Math.floor(innerHeight - top));
    panel.style.setProperty("--quiz-h", `${height}px`);
    // Was unter dem Reiter noch kommt (Abstand, Fußzeile), geht von der Höhe ab
    const extra = document.documentElement.scrollHeight - innerHeight;
    if (extra > 0) panel.style.setProperty("--quiz-h", `${Math.max(480, height - extra)}px`);
  };
  addEventListener("resize", fit);
  return { show: () => { requestAnimationFrame(fit); quiz.start(); } };
}
