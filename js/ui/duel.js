import { escapeHtml } from "../utils/dom.js";
import { own } from "../utils/host.js";
import {
  duelEntries, duelSummary, duelLists, genreBias, swarmLayout, chartScales, tone, readThreshold,
  CHART, THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_STEP, AGREE,
} from "../logic/duel-logic.js";
import { genresOf } from "../logic/movies-logic.js";

/*
 * Registerkarte „Du gegen IMDb" (Website: „Ich gegen IMDb"): links der
 * Schwarm (je eigener Note eine Säule, nach IMDb-Wertung aufgefächert;
 * umschaltbar auf Cover, zoombar), rechts „Einig mit der Welt" und „Nach
 * Genre" (gemessen am eigenen Schnitt, Zeile = Genre-Filter), darunter die
 * Schwelle und die Listen „Deine Geheimtipps" / „Von dir unterschätzt".
 * Suche und Filter wirken mit (js/views/movies-view.js reicht die gefilterte
 * Liste herein). Zahlen: js/logic/duel-logic.js.
 */

const e = escapeHtml;
const dec = (value, digits = 1) => Number(value).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${dec(Math.abs(value), digits)}`;
const n = value => Number(value).toLocaleString("de-DE");
const points = value => `${dec(value, value % 1 ? 1 : 0)} ${value === 1 ? "Punkt" : "Punkte"}`;
const href = movie => `movie.html?id=${encodeURIComponent(movie.id)}`;
const LIST_SHORT = 10;
const COVER = { gapX: 7.4, gapY: 10.5, w: 6.8, h: 10.2 };
const MAX_ZOOM = 6;

const POSTER_COLORS = [["#7a2e24", "#3b1d1a"], ["#2f5464", "#16242e"], ["#4b6236", "#1f2a1c"], ["#5d3f73", "#2b1f33"], ["#7a5c1c", "#2e2412"], ["#4a4a58", "#1a1a1f"], ["#2d6b66", "#122a2a"]];
const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const posterStyle = movie => { const [a, b] = POSTER_COLORS[hash(movie.title) % POSTER_COLORS.length]; return `--p1:${a};--p2:${b}`; };
const thumb = movie => `<span class="duel-thumb" style="${posterStyle(movie)}">${movie.cover ? `<img src="${e(movie.cover)}" alt="" loading="lazy" decoding="async">` : ""}</span>`;

/** Strengstes Genre: kleiner Seitenhieb. */
const STRICT_WINK = {
  Animation: "Pixar, bitte nachsitzen.", Komödie: "Witze müssen sich bei dir anstrengen.", Horror: "Dich erschreckt so schnell nichts.",
  Familienfilm: "Familienabend? Nur unter Vorbehalt.", Liebesfilm: "Romantik prallt an dir ab.", Drama: "Tränen gibt es bei dir nicht umsonst.",
  Action: "Explosionen allein reichen dir nicht.", "Science-Fiction": "Die Zukunft muss sich mehr Mühe geben.", Fantasy: "Drachen allein beeindrucken dich nicht.",
  Thriller: "Spannung? Bitte mehr davon.", Krimi: "Den Mörder hattest du sowieso früher.", Abenteuer: "Abenteuer gern, aber mit Niveau.",
};
const strictWink = name => {
  const text = STRICT_WINK[name] || "";
  return own(text, text.replace(/\bdich\b/g, "mich").replace(/\bdir\b/g, "mir").replace(/\bdu\b/g, "ich").replace(/hattest/, "hatte"));
};

/* ------------------------------------------------------------- Diagramm */

function axesSvg() {
  const { x, y } = chartScales();
  const left = CHART.left, right = CHART.width - CHART.right, bottom = CHART.height - CHART.bottom;
  const rows = [2, 4, 6, 8, 10].map(v => `<line class="duel-grid" x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 10}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
  const cols = Array.from({ length: 10 }, (_, i) => `<text x="${x(i + 1)}" y="${bottom + 18}" text-anchor="middle">${i + 1}</text>`).join("");
  return `${rows}${cols}
    <text x="${(left + right) / 2}" y="${CHART.height - 4}" text-anchor="middle">${own("Deine Note", "Meine Note")}</text>
    <text x="13" y="${(CHART.top + bottom) / 2}" text-anchor="middle" transform="rotate(-90 13 ${(CHART.top + bottom) / 2})">IMDb-Wertung</text>
    <line class="duel-diagonal" x1="${x(1)}" y1="${y(1)}" x2="${x(10)}" y2="${y(10)}"/>`;
}

/* ---------------------------------------------------------- Registerkarte */

/**
 * @param {HTMLElement} panel
 * @param {{threshold?: number, onThreshold?: (value: number) => void, onGenre?: (name: string) => void}} options
 * @returns {{update(movies: Array): void, show(): void, setThreshold(value: number): void}}
 */
export function initDuel(panel, { threshold = 1.5, onThreshold = () => {}, onGenre = () => {} } = {}) {
  let entries = [], layout = [], coverLayout = null;
  let th = readThreshold(threshold);
  let mode = "dots";
  let stale = true;
  let view = { x: 0, y: 0, w: CHART.width, h: CHART.height };
  const expanded = { tips: false, low: false, genres: false };
  const GENRES_SHORT = 12; // eingeklappt: die 6 mildesten und die 6 strengsten

  panel.innerHTML = `
    <div class="duel-layout">
      <section class="duel-card duel-chart-card" aria-labelledby="duel-title">
        <div class="duel-head">
          <div>
            <p class="duel-kicker" id="duel-count"></p>
            <h2 class="duel-title" id="duel-title">Wo ${own("du", "ich")} und die Welt <em>auseinanderliegen</em></h2>
          </div>
          <div class="duel-tools">
            <div class="duel-seg" role="group" aria-label="Darstellung">
              <button type="button" data-duel-mode="dots" aria-pressed="true">Punkte</button>
              <button type="button" data-duel-mode="covers" aria-pressed="false">Cover</button>
            </div>
            <div class="duel-zoom" role="group" aria-label="Zoom">
              <button type="button" data-duel-zoom="in" aria-label="Hineinzoomen">+</button>
              <button type="button" data-duel-zoom="out" aria-label="Herauszoomen">−</button>
              <button type="button" data-duel-zoom="reset" aria-label="Ganzes Diagramm">⤢</button>
            </div>
          </div>
        </div>
        <div class="duel-chart">
          <svg class="duel-svg" viewBox="0 0 ${CHART.width} ${CHART.height}" role="img" aria-describedby="duel-chart-help">
            <g class="duel-axes">${axesSvg()}</g>
            <g class="duel-points"></g>
          </svg>
          <div class="duel-tip" hidden></div>
        </div>
        <div class="duel-foot">
          <div class="duel-legend"></div>
          <p class="duel-help" id="duel-chart-help">Gestrichelt: genau wie IMDb · Punkt anklicken öffnet die Detailseite · Zoom mit + / − oder Strg + Mausrad, verschieben durch Ziehen</p>
        </div>
      </section>
      <div class="duel-side">
        <section class="duel-card duel-agree" aria-label="Einig mit der Welt"></section>
        <section class="duel-card duel-genres" aria-label="Nach Genre"></section>
      </div>
    </div>
    <div class="duel-threshold">
      <label for="duel-threshold-input">Ab welchem Abstand zählt ein Titel?<small>${own("Gilt für beide Listen und die Farben im Diagramm · wird gespeichert, die Website übernimmt ihn", "Gilt für beide Listen und die Farben im Diagramm · nur für diesen Besuch")}</small></label>
      <div>
        <input id="duel-threshold-input" type="range" min="${THRESHOLD_MIN}" max="${THRESHOLD_MAX}" step="${THRESHOLD_STEP}" value="${th}">
        <div class="duel-ticks" aria-hidden="true">${Array.from({ length: (THRESHOLD_MAX - THRESHOLD_MIN) / THRESHOLD_STEP + 1 }, (_, i) => `<span>${dec(THRESHOLD_MIN + i * THRESHOLD_STEP, (THRESHOLD_MIN + i * THRESHOLD_STEP) % 1 ? 1 : 0)}</span>`).join("")}</div>
      </div>
      <output for="duel-threshold-input" id="duel-threshold-out"></output>
    </div>
    <div class="duel-lists">
      <section class="duel-card duel-list" data-list="tips" aria-labelledby="duel-tips-title"></section>
      <section class="duel-card duel-list" data-list="low" aria-labelledby="duel-low-title"></section>
    </div>`;
  const $ = selector => panel.querySelector(selector);
  const svg = $(".duel-svg");
  const tip = $(".duel-tip");

  /* Punkte */
  function drawPoints() {
    const group = $(".duel-points");
    if (mode === "dots") {
      group.innerHTML = layout.map((p, i) => `<circle data-i="${i}" cx="${p.x}" cy="${p.y}" r="2.2"/>`).join("");
    } else {
      coverLayout ??= swarmLayout(entries, { gapX: COVER.gapX, gapY: COVER.gapY });
      group.innerHTML = coverLayout.map((p, i) => {
        const movie = p.entry.movie;
        const [a] = POSTER_COLORS[hash(movie.title) % POSTER_COLORS.length];
        const x = p.x - COVER.w / 2, y = p.y - COVER.h / 2;
        return `<g data-i="${i}"><rect x="${x}" y="${y}" width="${COVER.w}" height="${COVER.h}" rx=".8" fill="${a}"/>${movie.cover ? `<image href="${e(movie.cover)}" x="${x}" y="${y}" width="${COVER.w}" height="${COVER.h}" preserveAspectRatio="xMidYMid slice"/>` : ""}<rect class="duel-cover-edge" x="${x}" y="${y}" width="${COVER.w}" height="${COVER.h}" rx=".8"/></g>`;
      }).join("");
      group.querySelectorAll("image").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    }
    paintTones();
  }
  const current = () => (mode === "dots" ? layout : coverLayout || []);
  function paintTones() {
    const list = current();
    $(".duel-points").querySelectorAll("[data-i]").forEach(node => { node.setAttribute("class", `is-${tone(list[node.dataset.i].entry.diff, th)}`); });
  }

  /* Zoom und Verschieben über den Ausschnitt (viewBox) */
  const applyView = () => {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    svg.classList.toggle("is-zoomed", view.w < CHART.width - 0.5);
  };
  function zoom(factor, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = Math.min(CHART.width, Math.max(CHART.width / MAX_ZOOM, view.w / factor));
    const h = w * CHART.height / CHART.width;
    view = { x: cx - (cx - view.x) * (w / view.w), y: cy - (cy - view.y) * (h / view.h), w, h };
    clampView();
    applyView();
  }
  function clampView() {
    view.x = Math.min(CHART.width - view.w, Math.max(0, view.x));
    view.y = Math.min(CHART.height - view.h, Math.max(0, view.y));
  }
  const toChart = event => {
    const rect = svg.getBoundingClientRect();
    return { x: view.x + (event.clientX - rect.left) / rect.width * view.w, y: view.y + (event.clientY - rect.top) / rect.height * view.h };
  };
  svg.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return; // normales Scrollen bleibt der Seite
    event.preventDefault();
    const at = toChart(event);
    zoom(event.deltaY < 0 ? 1.25 : 0.8, at.x, at.y);
  }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", event => {
    if (view.w >= CHART.width - 0.5 || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, view: { ...view }, moved: false, id: event.pointerId };
  });
  svg.addEventListener("pointermove", event => {
    if (drag) {
      const rect = svg.getBoundingClientRect();
      const dx = (event.clientX - drag.x) / rect.width * view.w, dy = (event.clientY - drag.y) / rect.height * view.h;
      if (!drag.moved && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) {
        drag.moved = true;
        svg.setPointerCapture(drag.id); // erst beim Ziehen - ein Klick auf einen Punkt bleibt ein Klick
        svg.classList.add("is-dragging");
      }
      if (!drag.moved) return;
      view = { ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy };
      clampView(); applyView(); hideTip();
      return;
    }
    showTip(event);
  });
  svg.addEventListener("pointerup", () => { svg.classList.remove("is-dragging"); setTimeout(() => { drag = null; }); });
  svg.addEventListener("pointerleave", hideTip);
  svg.addEventListener("click", event => {
    if (drag?.moved) return;
    const node = event.target.closest("[data-i]");
    if (node) location.href = href(current()[node.dataset.i].entry.movie);
  });

  /* Vorschau beim Darüberfahren */
  let tipFor = -1;
  function showTip(event) {
    const node = event.target.closest?.("[data-i]");
    if (!node) { hideTip(); return; }
    const i = Number(node.dataset.i);
    const p = current()[i];
    if (!p) return;
    if (tipFor !== i) {
      tipFor = i;
      const { movie, you, imdb, diff } = p.entry;
      const genres = genresOf(movie).slice(0, 2).join(", ");
      tip.innerHTML = `${thumb(movie)}<span><b>${e(movie.title)}</b><small>${e([movie.year, genres].filter(Boolean).join(" · "))}</small>
        <small>${own("Du", "Ich")} <em>${you}</em> · IMDb ${dec(imdb)} · <em class="is-${tone(diff, th)}">${signed(diff)}</em></small></span>`;
      tip.querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    }
    const box = $(".duel-chart").getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    tip.hidden = false;
    const left = rect.left - box.left + rect.width / 2;
    const top = rect.top - box.top;
    const flip = left > box.width - 270;
    tip.style.left = `${flip ? left - tip.offsetWidth - 12 : left + 12}px`;
    tip.style.top = `${Math.max(0, top - tip.offsetHeight / 2)}px`;
  }
  function hideTip() { tip.hidden = true; tipFor = -1; }

  /* Rechte Seite */
  function renderSide() {
    const s = duelSummary(entries);
    const pct = value => Math.round(value / Math.max(1, s.count) * 1000) / 10;
    const verdict = { mild: own("Urteil: <b>ein milder Kritiker</b> – die Welt war öfter strenger als du.", "Urteil: <b>ein milder Kritiker</b> – die Welt war öfter strenger als ich."),
      strict: own("Urteil: <b>ein strenger Kritiker</b> – die Welt war meist begeisterter als du.", "Urteil: <b>ein strenger Kritiker</b> – die Welt war meist begeisterter als ich."),
      fair: "Urteil: <b>ein fairer Richter</b> – mal drüber, mal drunter, im Schnitt genau richtig." }[s.critic] || "";
    $(".duel-agree").innerHTML = s.count ? `<p class="duel-kicker">Einig mit der Welt</p>
      <div class="duel-share"><span class="duel-big">${Math.round(s.sameShare * 100)} %</span><p>${own("deiner", "meiner")} Noten liegen höchstens <b>einen halben Punkt</b> neben IMDb.</p></div>
      <div class="duel-stack" role="img" aria-label="${n(s.higher)} höher, ${n(s.same)} einig, ${n(s.lower)} niedriger">
        <i class="is-high" style="width:${pct(s.higher)}%"></i><i class="is-same" style="width:${pct(s.same)}%"></i><i class="is-low" style="width:${pct(s.lower)}%"></i>
      </div>
      <div class="duel-trio"><span><b>${n(s.higher)}</b>${own("du", "ich")} höher</span><span><b>${n(s.same)}</b>einig</span><span><b>${n(s.lower)}</b>${own("du", "ich")} niedriger</span></div>
      <p class="duel-text">Im Schnitt ${own("gibst du", "gebe ich")} <b>${dec(Math.abs(s.mean))} ${Math.abs(s.mean) === 1 ? "Punkt" : "Punkte"} ${s.mean >= 0 ? "mehr" : "weniger"}</b> als IMDb, Abstand im Mittel ${dec(s.meanAbs)}. ${verdict}</p>`
      : `<p class="duel-kicker">Einig mit der Welt</p><p class="duel-text">Keine bewerteten Titel mit IMDb-Wertung${hasFilterHint ? " – Filter lockern?" : "."}</p>`;

    const g = genreBias(entries);
    const max = Math.max(0.2, ...g.list.map(item => Math.abs(item.bias))) * 1.08;
    const milder = g.list[0], stricter = g.list[g.list.length - 1];
    const wink = g.list.length >= 2 && stricter.bias < 0 ? strictWink(stricter.name) : "";
    $(".duel-genres").innerHTML = `<div class="duel-genres-head"><p class="duel-kicker">Nach Genre</p><span>ab ${g.min} Titeln · gemessen an ${own("deinem", "meinem")} Ø (${signed(g.mean, 2)})</span></div>
      ${g.list.length >= 2 ? `<div class="duel-genre-scale" aria-hidden="true"><span></span><span>← strenger</span><span>milder →</span><span></span></div>
      <div class="duel-genre-rows">${shownGenres(g.list).map(item => item.gap ? '<span class="duel-genre-gap" aria-hidden="true">⋯</span>' : `<button type="button" class="duel-genre" data-duel-genre="${e(item.name)}" title="Nur ${e(item.name)} zeigen" aria-label="${e(item.name)}: ${signed(item.bias, 2)} gegenüber ${own("deinem", "meinem")} Schnitt, ${n(item.count)} Titel – als Filter setzen">
          <span>${e(item.name)}</span><span class="duel-neg"><i style="width:${Math.max(0, -item.bias) / max * 100}%"></i></span><span class="duel-pos"><i style="width:${Math.max(0, item.bias) / max * 100}%"></i></span><b>${signed(item.bias, 2)}</b></button>`).join("")}</div>
      <p class="duel-text">Am weichsten ${own("wirst du", "werde ich")} bei <b>${e(milder.name)}</b>, am strengsten ${own("bist du", "bin ich")} bei <b>${e(stricter.name)}</b>.${wink ? ` ${wink}` : ""}</p>
      ${g.list.length > GENRES_SHORT ? `<button class="duel-more" type="button" data-duel-more="genres" aria-expanded="${expanded.genres}">${expanded.genres ? "Nur die deutlichsten zeigen" : `Alle ${n(g.list.length)} Genres zeigen`}</button>` : ""}
      <p class="duel-note">Zeile anklicken setzt den Genre-Filter – Diagramm und Listen folgen.</p>`
      : `<p class="duel-text">Zu wenige Titel für einen Vergleich nach Genre.</p>`}`;
  }
  let hasFilterHint = false;
  const shownGenres = list => {
    if (expanded.genres || list.length <= GENRES_SHORT) return list;
    const half = GENRES_SHORT / 2;
    return [...list.slice(0, half), { gap: true }, ...list.slice(-half)];
  };

  /* Schwelle und Listen */
  function renderThreshold() {
    $("#duel-threshold-out").textContent = `± ${points(th)}`;
    $(".duel-legend").innerHTML = [
      ["high", `${own("du", "ich")} ≥ ${dec(th, th % 1 ? 1 : 0)} höher`], ["up", "etwas höher"], ["same", `einig (± ${dec(AGREE)})`],
      ["down", "etwas niedriger"], ["low", `${own("du", "ich")} ≥ ${dec(th, th % 1 ? 1 : 0)} niedriger`],
    ].map(([key, label]) => `<span><i class="is-${key}"></i>${label}</span>`).join("");
  }
  function renderLists() {
    const { tips, low } = duelLists(entries, th);
    const block = (key, list) => {
      const isTips = key === "tips";
      const title = isTips ? own("Deine Geheimtipps", "Meine Geheimtipps") : own("Von dir unterschätzt", "Von mir unterschätzt");
      const head = isTips ? own("Du sahst mehr als <em>die Welt</em>", "Ich sah mehr als <em>die Welt</em>") : own("Die Welt sah mehr <em>als du</em>", "Die Welt sah mehr <em>als ich</em>");
      const lead = isTips ? `Mindestens ${points(th)} über IMDb. Die Welt hat es einfach noch nicht verstanden.` : `Mindestens ${points(th)} unter IMDb. Vielleicht beim zweiten Mal?`;
      const empty = isTips ? `Bei ± ${points(th)} hat ${own("dich", "mich")} nichts so überzeugt, dass die Welt danebenlag.` : `Bei ± ${points(th)} ${own("hast du", "habe ich")} nichts unterschätzt. Respekt.`;
      const shown = expanded[key] ? list : list.slice(0, LIST_SHORT);
      return `<div><p class="duel-kicker">${title} · ${n(list.length)} Titel</p>
          <h2 class="duel-title" id="duel-${key}-title">${head}</h2><p class="duel-text">${lead}</p></div>
        ${list.length ? `<ol class="duel-rows">${shown.map((item, i) => `<li><a class="duel-row is-${isTips ? "high" : "low"}" href="${href(item.movie)}">
            <span class="duel-rank">${i + 1}</span>${thumb(item.movie)}
            <span class="duel-row-title"><b>${e(item.movie.title)}</b><small>${e(item.movie.year || "")}</small></span>
            <span class="duel-row-diff"><strong>${signed(item.diff)}</strong><small>${own("Du", "Ich")} ${item.you} · IMDb ${dec(item.imdb)}</small></span></a></li>`).join("")}</ol>`
          : `<p class="duel-empty">${empty}</p>`}
        ${list.length > LIST_SHORT ? `<button class="duel-more" type="button" data-duel-more="${key}" aria-expanded="${expanded[key]}">${expanded[key] ? "Weniger zeigen" : `Alle ${n(list.length)} zeigen`}</button>` : ""}`;
    };
    $('[data-list="tips"]').innerHTML = block("tips", tips);
    $('[data-list="low"]').innerHTML = block("low", low);
    panel.querySelectorAll(".duel-row img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
  }

  function render() {
    layout = swarmLayout(entries);
    coverLayout = null;
    $("#duel-count").textContent = `${own("Du", "Ich")} gegen IMDb · ${n(entries.length)} ${entries.length === 1 ? "bewerteter Titel" : "bewertete Titel"}`;
    svg.setAttribute("aria-label", `Schwarm: ${n(entries.length)} Titel, je ${own("deiner", "meiner")} Noten eine Säule, senkrecht die IMDb-Wertung`);
    drawPoints();
    renderSide();
    renderThreshold();
    renderLists();
    stale = false;
  }

  panel.addEventListener("click", event => {
    const modeButton = event.target.closest("[data-duel-mode]");
    if (modeButton && modeButton.dataset.duelMode !== mode) {
      mode = modeButton.dataset.duelMode;
      panel.querySelectorAll("[data-duel-mode]").forEach(b => b.setAttribute("aria-pressed", String(b === modeButton)));
      panel.classList.toggle("is-covers", mode === "covers");
      hideTip();
      drawPoints();
      return;
    }
    const zoomButton = event.target.closest("[data-duel-zoom]");
    if (zoomButton) {
      const what = zoomButton.dataset.duelZoom;
      if (what === "reset") { view = { x: 0, y: 0, w: CHART.width, h: CHART.height }; applyView(); } else zoom(what === "in" ? 1.6 : 1 / 1.6);
      return;
    }
    const genre = event.target.closest("[data-duel-genre]");
    if (genre) { onGenre(genre.dataset.duelGenre); return; }
    const more = event.target.closest("[data-duel-more]");
    if (more) {
      const key = more.dataset.duelMore;
      expanded[key] = !expanded[key];
      if (key === "genres") renderSide(); else renderLists();
      panel.querySelector(`[data-duel-more="${key}"]`)?.focus();
    }
  });
  $("#duel-threshold-input").addEventListener("input", event => {
    th = readThreshold(event.target.value);
    renderThreshold();
    paintTones();
    renderLists();
    onThreshold(th);
  });

  return {
    update(movies, { filtered = false } = {}) {
      entries = duelEntries(movies);
      hasFilterHint = filtered;
      stale = true;
      if (!panel.hidden) render();
    },
    show() { if (stale) render(); },
    setThreshold(value) {
      th = readThreshold(value);
      $("#duel-threshold-input").value = String(th);
      if (!stale) { renderThreshold(); paintTones(); renderLists(); }
    },
  };
}
