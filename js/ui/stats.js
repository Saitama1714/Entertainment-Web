import { $, escapeHtml, emptyState, reducedMotion } from "../utils/dom.js";
import { own, has } from "../utils/host.js";
import { icon } from "../utils/icons.js";
import { collectionStats } from "../logic/stats-logic.js";
import { genresOf } from "../logic/movies-logic.js";
import {
  emptyTonight, tonightPool, reelCandidates, reelSequence, tonightChoices, drawTonight, runtimeOf, runtimeLabel, runtimeLimitLabel,
} from "../logic/tonight-logic.js";
import { flapNumberHtml, playFlapsWhenVisible } from "./split-flap.js";

/*
 * Registerkarte „Heute" unter Entertainment (früher „Auf einen Blick"):
 * oben Gesamt/Gesehen/Offen als Klapptafel (js/ui/split-flap.js), darunter
 * „Was schaue ich heute?": links Eingrenzungen (Laufzeit als Schieberegler,
 * Art, Medium, Genre aus den ungesehenen Titeln, „Nur ungesehene"), rechts
 * die Ziehung - Cover rattern wie ein Spielautomat durch und bremsen auf dem
 * gezogenen Titel ab (Cover-Roulette), darunter zwei Alternativen.
 * Eingrenzungen gelten nur für die laufende Sitzung. Rechenlogik:
 * js/logic/tonight-logic.js.
 */

const fmt = n => n.toLocaleString("de-DE");
const POSTER_COLORS = [["#7a2e24", "#3b1d1a"], ["#2f5464", "#16242e"], ["#4b6236", "#1f2a1c"], ["#5d3f73", "#2b1f33"], ["#7a5c1c", "#2e2412"], ["#4a4a58", "#1a1a1f"], ["#9c0205", "#331414"], ["#2d6b66", "#122a2a"]];
const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const KIND_LABELS = { "": "Alles", film: "Film", series: "Serie" };
const mediumLabel = type => (type === "UHD Blu-ray" ? "4K" : type);
const REEL_LENGTH = 32;   // höchstens so viele Cover im Streifen; der gezogene sitzt an Platz REEL_TARGET (bei wenig Auswahl früher)
const REEL_TARGET = 29;   // 29 Cover davor, der gezogene als 30., zwei angeschnitten dahinter
const REEL_STEP = 216;    // Breite eines Covers + Abstand (css/tonight.css)

let state = null;
let options = emptyTonight();
let current = { pick: null, alts: [] };
let bound = false;
let spinning = false;
let stale = false; // Eingrenzung seit dem letzten Ziehen geändert

/** Cover (oder Ersatzplakat mit Titel) eines Titels. */
function posterHtml(movie, extra = "") {
  const cover = typeof movie.cover === "string" ? movie.cover.trim() : "";
  const [light, dark] = POSTER_COLORS[hash(movie.title) % POSTER_COLORS.length];
  return `<span class="tonight-poster ${extra}" style="--p1:${light};--p2:${dark}">
    <span class="tonight-poster-fallback"><b>${escapeHtml(movie.title || "")}</b><small>${escapeHtml(movie.year || "")}</small></span>
    ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="eager" decoding="async">` : ""}
  </span>`;
}

/** Ein Cover, das nicht lädt: das Ersatzplakat bleibt sichtbar. */
function settleImages(root) {
  root.querySelectorAll(".tonight-poster img").forEach(img => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

const href = movie => `movie.html?id=${encodeURIComponent(movie.id)}`;

function resultHtml({ pick, alts }) {
  const facts = [pick.year, runtimeLabel(runtimeOf(pick)), pick.medium, pick.directors ? `Regie: ${pick.directors}` : ""].filter(Boolean);
  return `
    <div class="tonight-pick">
      <a class="tonight-cover tonight-fade" href="${escapeHtml(href(pick))}" aria-label="${escapeHtml(`${pick.title} – Detailseite öffnen`)}">${posterHtml(pick)}</a>
      <div class="tonight-info">
        <h3 class="tonight-name tonight-fade">${escapeHtml(pick.title)}</h3>
        <p class="tonight-meta tonight-fade d1">${facts.map(escapeHtml).join(" · ")}</p>
        ${genresOf(pick).length ? `<div class="tonight-genres tonight-fade d1">${genresOf(pick).map(g => `<span>${escapeHtml(g)}</span>`).join("")}</div>` : ""}
        <p class="tonight-meta tonight-fade d2">${[
          pick.imdbRating ? `IMDb <b>${escapeHtml(String(pick.imdbRating).replace(".", ","))}</b>` : "",
          has("seen") ? (pick.seen ? "Schon gesehen" : "Noch nicht gesehen") : "",
        ].filter(Boolean).join(" · ")}</p>
        <div class="tonight-fade d2"><a class="button secondary" href="${escapeHtml(href(pick))}">Zur Detailseite</a></div>
        ${alts.length ? `<div class="tonight-alts tonight-fade d2">
          <p class="tonight-kicker">Oder lieber</p>
          <div class="tonight-alt-list">${alts.map((movie, k) => `
            <button type="button" class="tonight-alt" data-alt="${k}">
              ${posterHtml(movie, "is-small")}
              <span><b>${escapeHtml(movie.title)}</b><small>${escapeHtml([movie.year, runtimeLabel(runtimeOf(movie))].filter(Boolean).join(" · "))}</small></span>
            </button>`).join("")}</div>
        </div>` : ""}
      </div>
    </div>`;
}

/**
 * Bühne: noch nichts gezogen (leere Bühne mit „?"), ein Vorschlag, oder ein
 * Vorschlag, der nach einer Änderung der Eingrenzung zurücktritt (stale).
 */
function renderResult(pool = tonightPool(state.movies, options)) {
  const box = $("#tonight-result");
  if (!pool.length) {
    box.innerHTML = `<p class="tonight-empty">Nichts passt zu dieser Auswahl. Lockere die Eingrenzungen links.</p>`;
    return;
  }
  if (!current.pick) {
    box.innerHTML = `
      <div class="tonight-idle" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="tonight-idle-frame"><b>?</b></span></div>
      <p class="tonight-caption"><b>${fmt(pool.length)}</b> ${pool.length === 1 ? "Titel passt" : "Titel passen"} zu deiner Auswahl. Zieh dir einen.</p>`;
    return;
  }
  const fits = pool.some(movie => movie.id === current.pick.id);
  box.innerHTML = stale
    ? `<div class="tonight-stale">
        <div class="tonight-stale-pick" aria-hidden="true">${resultHtml(current)}</div>
        <p class="tonight-notice" role="status"><i aria-hidden="true"></i><span>Auswahl geändert – jetzt ${pool.length === 1 ? "passt" : "passen"} <b>${fmt(pool.length)}</b> Titel</span></p>
      </div>
      <p class="tonight-caption">${fits ? "Der Vorschlag passt noch – oder zieh neu." : "Der letzte Vorschlag passt nicht mehr. Zieh neu."}</p>`
    : resultHtml(current);
  settleImages(box);
}

/** Cover-Roulette: Streifen läuft durch und bremst auf dem gezogenen Titel. */
function spin(pool, done) {
  const reel = $("#tonight-reel");
  if (reducedMotion()) { done(); return; }
  // Kulisse: passende Titel, bei wenigen aufgefüllt mit den übrigen ungesehenen (nie gesehene, solange „Nur ungesehene" an ist)
  // Jeder Film nur einmal; bei wenig Auswahl wird der Streifen kürzer statt zu wiederholen
  const { items, target } = reelSequence(current.pick, reelCandidates(state.movies, pool, options), { length: REEL_LENGTH, target: REEL_TARGET });
  if (target === 0) { done(); return; } // nichts als Kulisse: gleich das Ergebnis
  reel.innerHTML = `<div class="tonight-strip">${items.map(movie => posterHtml(movie)).join("")}</div><div class="tonight-frame"></div>`;
  settleImages(reel);
  reel.hidden = false;
  $("#tonight-result").hidden = true;
  spinning = true;
  const strip = reel.firstElementChild;
  // Abstand von Cover zu Cover messen (schmale Fenster: kleinere Cover), dann Ziel setzen
  const step = strip.children[1].offsetLeft - strip.children[0].offsetLeft || REEL_STEP;
  strip.style.setProperty("--end", `${-target * step}px`);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    spinning = false;
    reel.hidden = true;
    reel.innerHTML = "";
    $("#tonight-result").hidden = false;
    done();
  };
  strip.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 4300); // falls kein animationend kommt (Tab im Hintergrund)
}

function draw() {
  if (spinning) return;
  const pool = tonightPool(state.movies, options);
  current = drawTonight(pool, { avoid: current.pick?.id });
  stale = false;
  updateButton(pool);
  if (!current.pick) { renderResult(pool); return; }
  spin(pool, () => renderResult(pool));
}

/**
 * Zahl links und Knopf: „Ziehen" (noch nichts gezogen) bzw. „Neu ziehen",
 * mit der Zahl passender Titel im Knopf; er glimmt, solange eine Ziehung
 * ansteht (noch nichts gezogen oder Eingrenzung geändert).
 */
function updateButton(pool = tonightPool(state.movies, options)) {
  $("#tonight-count").innerHTML = `Aus <b>${fmt(pool.length)}</b> passenden ${pool.length === 1 ? "Titel" : "Titeln"}`;
  const button = $("#tonight-draw");
  button.disabled = pool.length === 0;
  button.classList.toggle("is-waiting", pool.length > 0 && (!current.pick || stale));
  button.innerHTML = pool.length
    ? `<span class="btn-icon">${icon("shuffle")}</span>${current.pick ? "Neu ziehen" : "Ziehen"}<span class="tonight-draw-count" aria-label="${fmt(pool.length)} passende Titel">${fmt(pool.length)}</span>`
    : `<span class="btn-icon">${icon("shuffle")}</span>Nichts passt`;
}

/** Auswahl-Knöpfe und Genre-Liste nach dem Stand der Sammlung. */
function renderFilters() {
  const choices = tonightChoices(state.movies, options);
  if (options.genre && !choices.genres.some(g => g.name === options.genre)) options.genre = "";
  options.media = options.media.filter(type => choices.media.includes(type));
  if (options.kind && !choices.kinds.includes(options.kind)) options.kind = "";
  $("#tonight-kind .tonight-chips").innerHTML = ["", ...choices.kinds].map(value =>
    `<button type="button" class="tonight-chip" data-key="kind" data-value="${value}" aria-pressed="${options.kind === value}">${KIND_LABELS[value]}</button>`).join("");
  // Medium: mehrere zugleich (ODER); „Alle" hebt die Auswahl auf
  $("#tonight-medium .tonight-chips").innerHTML = ["", ...choices.media].map(value =>
    `<button type="button" class="tonight-chip" data-key="media" data-value="${escapeHtml(value)}" aria-pressed="${value ? options.media.includes(value) : !options.media.length}">${escapeHtml(value ? mediumLabel(value) : "Alle")}</button>`).join("");
  $("#tonight-medium").hidden = choices.media.length < 2;
  $("#tonight-kind").hidden = choices.kinds.length < 2;
  $("#tonight-genre").innerHTML = `<option value="">Alle Genres</option>${choices.genres.map(g => `<option value="${escapeHtml(g.name)}" ${g.name === options.genre ? "selected" : ""}>${escapeHtml(g.name)} (${fmt(g.n)})</option>`).join("")}`;
  const range = $("#tonight-runtime");
  range.value = String(options.maxMinutes);
  range.style.setProperty("--fill", `${(options.maxMinutes - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`);
  $("#tonight-runtime-label").textContent = runtimeLimitLabel(options.maxMinutes);
  range.setAttribute("aria-valuetext", runtimeLimitLabel(options.maxMinutes));
  $("#tonight-unseen").setAttribute("aria-pressed", String(options.unseenOnly));
  $("#tonight-unseen").hidden = !has("seen"); // Website ohne Gesehen-Status: alle Titel
}

/** Eingrenzung geändert: Zahl und Auswahl neu; ein Vorschlag tritt zurück, der Knopf glimmt - gezogen wird erst auf Klick. */
function changed() {
  renderFilters();
  const pool = tonightPool(state.movies, options);
  const wasStale = stale;
  if (current.pick) stale = true;
  updateButton(pool);
  // Schieberegler feuert oft: die zurückgetretene Ansicht nur einmal neu aufbauen, danach nur Hinweis und Zahl
  if (wasStale && current.pick && $("#tonight-result .tonight-stale")) {
    const fits = pool.some(movie => movie.id === current.pick.id);
    $("#tonight-result .tonight-notice").innerHTML = `<i aria-hidden="true"></i><span>Auswahl geändert – jetzt ${pool.length === 1 ? "passt" : "passen"} <b>${fmt(pool.length)}</b> Titel</span>`;
    $("#tonight-result .tonight-caption").textContent = fits ? "Der Vorschlag passt noch – oder zieh neu." : "Der letzte Vorschlag passt nicht mehr. Zieh neu.";
    if (!pool.length) renderResult(pool);
    return;
  }
  renderResult(pool);
}

function bind() {
  if (bound) return;
  bound = true;
  $("#tonight-draw").addEventListener("click", () => draw());
  $("#tonight-filters").addEventListener("submit", event => event.preventDefault());
  $("#tonight-filters").addEventListener("click", event => {
    const chip = event.target.closest(".tonight-chip");
    if (chip) {
      const { key, value } = chip.dataset;
      if (key === "media") {
        options = { ...options, media: !value ? [] : options.media.includes(value) ? options.media.filter(type => type !== value) : [...options.media, value] };
      } else options = { ...options, [key]: value };
      changed();
      $(`#tonight-filters .tonight-chip[data-key="${key}"][data-value="${CSS.escape(value)}"]`)?.focus(); // Fokus bleibt nach dem Neuzeichnen
      return;
    }
    if (event.target.closest("#tonight-unseen")) { options = { ...options, unseenOnly: !options.unseenOnly }; changed(); }
  });
  $("#tonight-runtime").addEventListener("input", event => { options = { ...options, maxMinutes: Number(event.target.value) }; changed(); });
  $("#tonight-genre").addEventListener("change", event => { options = { ...options, genre: event.target.value }; changed(); });
  $("#tonight-result").addEventListener("click", event => {
    const alt = event.target.closest("[data-alt]");
    if (!alt || stale) return;
    const chosen = current.alts[Number(alt.dataset.alt)];
    current = { pick: chosen, alts: [current.pick, ...current.alts.filter(movie => movie !== chosen)] };
    renderResult();
    $("#tonight-result .tonight-cover")?.focus();
  });
}

/**
 * Zeichnet die Registerkarte „Heute" (nach dem Laden und nach jeder Änderung
 * an den Titeln). Gezogen wird nie von selbst - nur auf „Ziehen".
 * @param {{movies: Array}} appState
 */
export function renderStats(appState) {
  state = appState;
  const numbersEl = $("#stats-numbers");
  const tonightEl = $("#tonight");
  if (!numbersEl || !tonightEl) return;
  const progress = $("#stats-progress");

  const stats = collectionStats(state.movies);
  if (stats.total === 0) {
    numbersEl.innerHTML = emptyState(own("Zahlen und Vorschläge gibt es, sobald deine IMDb-Listen importiert sind.", "Hier sind noch keine Titel veröffentlicht."));
    progress.hidden = true;
    tonightEl.hidden = true;
    return;
  }

  // Website ohne Gesehen-Status: nur die Gesamtzahl
  if (!has("seen")) options = { ...options, unseenOnly: false };
  const numbers = has("seen") ? [["Gesamt", stats.total], ["Gesehen", stats.seen], ["Offen", stats.unseen]] : [["Titel", stats.total]];
  numbersEl.innerHTML = numbers.map(([label, value]) => `
      <div class="stat-item">
        <span class="stat-value">${flapNumberHtml(label, value)}</span>
        <span class="stat-label">${label}</span>
      </div>`).join("");
  playFlapsWhenVisible(numbersEl); // Klapptafel blättert, sobald die Zahlen zu sehen sind
  const share = Math.round(stats.seen / stats.total * 100);
  progress.hidden = !has("seen");
  progress.innerHTML = `<span class="stats-bar"><i style="width:${share}%"></i></span><span>${share} % ${own("deiner", "der")} Sammlung gesehen</span>`;

  tonightEl.hidden = false;
  bind();
  renderFilters();
  // Bisheriger Vorschlag bleibt, solange es ihn noch gibt (aktuelle Fassung des Titels)
  if (current.pick) {
    const byId = new Map(state.movies.map(movie => [movie.id, movie]));
    const pick = byId.get(current.pick.id);
    current = pick ? { pick, alts: current.alts.map(movie => byId.get(movie.id)).filter(Boolean) } : { pick: null, alts: [] };
    if (!pick) stale = false;
  }
  const pool = tonightPool(state.movies, options);
  updateButton(pool);
  renderResult(pool);
}
