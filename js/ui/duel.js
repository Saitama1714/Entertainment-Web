import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { own } from "../utils/host.js";
import { localCoverUrl } from "../cover-store.js";
import {
  duelEntries, duelSummary, duelLists, genreBias, tone, readThreshold, fieldLayout, tapeRows, duelHighlights,
  VERDICTS, THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_STEP, AGREE, DEFAULT_DUEL_INTRO,
} from "../logic/duel-logic.js";
import { genresOf } from "../logic/movies-logic.js";
import { colorOf, introDue } from "../logic/universe-logic.js";

/*
 * Registerkarte „Du gegen IMDb" – „Das Duell" (Website: „Ich gegen IMDb").
 * Eine dunkle Bühne in fünf Teilen:
 *   1. Plakat: Du in der goldenen Ecke, die Welt in der silbernen, dazwischen
 *      der Ring „einig mit der Welt" und der Stempel mit dem Urteil.
 *   2. Kampfwerte: Ø Note je Bereich (aus den Daten gewählt), Balken auf der
 *      Seite, die milder urteilt.
 *   3. Das Feld (Canvas): jeder Titel ein Punkt, waagerecht euer Abstand.
 *      Schwelle als ziehbare Markierungen, Zoom bis zu den Covern, Vorschau
 *      beim Darüberfahren, Klick zur Detailseite.
 *   4. Zwölf Runden: Genres als Tauziehen, gemessen am eigenen Schnitt
 *      (Zeile = Genre-Filter).
 *   5. Plädoyers: Geheimtipps und Unterschätzte, je drei als Plakat.
 * Beim Öffnen der Auftritt (Einstellung duelIntro, wie der Urknall).
 * Suche und Filter wirken mit (js/views/movies-view.js reicht die gefilterte
 * Liste herein). Zahlen: js/logic/duel-logic.js.
 */

const e = escapeHtml;
const dec = (value, digits = 1) => Number(value).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${dec(Math.abs(value), digits)}`;
const n = value => Number(value).toLocaleString("de-DE");
const half = value => dec(value, value % 1 ? 1 : 0);
const points = value => `${half(value)} ${value === 1 ? "Punkt" : "Punkte"}`;
const href = movie => `movie.html?id=${encodeURIComponent(movie.id)}`;
const votesOf = movie => Number(String(movie.numVotes ?? "").replace(/[^\d]/g, "")) || 0;
const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const LIST_SHORT = 10;
const ROUNDS_SHORT = 12;
const MAX_ZOOM = 10;
const COVER_PX = 22; // ab dieser Breite auf dem Bildschirm werden Punkte zu Covern

const COLORS = { high: "#e9c46f", up: "#9c8350", same: "#5d524c", down: "#61798f", low: "#a8c6e4" };
const NUMBER_WORDS = ["", "Eine", "Zwei", "Drei", "Vier", "Fünf", "Sechs", "Sieben", "Acht", "Neun", "Zehn", "Elf", "Zwölf"];

/* Sprüche je Genre: [du-Form, ich-Form] */
const MILD = {
  Musikfilm: ["Da singst du mit.", "Da singe ich mit."], Musical: ["Jede Nummer ein Treffer.", "Jede Nummer ein Treffer."],
  Biografie: ["Wahre Geschichten ziehen.", "Wahre Geschichten ziehen."], Drama: ["Taschentücher griffbereit.", "Taschentücher griffbereit."],
  Horror: ["Gruseln mit Gewinn.", "Gruseln mit Gewinn."], Sportfilm: ["Underdogs haben bei dir Kredit.", "Underdogs haben bei mir Kredit."],
  Geschichte: ["Geschichtsstunde mit Bestnote.", "Geschichtsstunde mit Bestnote."], Thriller: ["Spannung zahlt sich aus.", "Spannung zahlt sich aus."],
  Krimi: ["Du ermittelst gern mit.", "Ich ermittle gern mit."], Mystery: ["Rätsel machen dich milde.", "Rätsel machen mich milde."],
  Komödie: ["Du lachst gern mit.", "Ich lache gern mit."], Animation: ["Das Kind in dir jubelt.", "Das Kind in mir jubelt."],
  Familienfilm: ["Sonntagnachmittag, Herz auf.", "Sonntagnachmittag, Herz auf."], Liebesfilm: ["Romantik trifft bei dir.", "Romantik trifft bei mir."],
  Kriegsfilm: ["Schwere Kost, gern genommen.", "Schwere Kost, gern genommen."], Western: ["Staub, Sonne, volle Punktzahl.", "Staub, Sonne, volle Punktzahl."],
  "Science-Fiction": ["Die Zukunft hat dich.", "Die Zukunft hat mich."], Fantasy: ["Drachen bekommen Vorschuss.", "Drachen bekommen Vorschuss."],
  Abenteuer: ["Rucksack auf, Daumen hoch.", "Rucksack auf, Daumen hoch."], Action: ["Explosionen ziehen.", "Explosionen ziehen."],
  Dokumentarfilm: ["Fakten mit Herz.", "Fakten mit Herz."],
};
const STRICT = {
  Animation: ["Pixar, bitte nachsitzen.", "Pixar, bitte nachsitzen."], Komödie: ["Nicht jeder Witz zündet.", "Nicht jeder Witz zündet."],
  Horror: ["Dich erschreckt so schnell nichts.", "Mich erschreckt so schnell nichts."], Familienfilm: ["Für die Kleinen, nicht für dich.", "Für die Kleinen, nicht für mich."],
  Liebesfilm: ["Herz ja, Kitsch nein.", "Herz ja, Kitsch nein."], Drama: ["Tränen gibt es nicht umsonst.", "Tränen gibt es nicht umsonst."],
  Action: ["Explosionen allein reichen nicht.", "Explosionen allein reichen nicht."], "Science-Fiction": ["Die Zukunft muss sich mehr Mühe geben.", "Die Zukunft muss sich mehr Mühe geben."],
  Fantasy: ["Drachen allein beeindrucken nicht.", "Drachen allein beeindrucken nicht."], Thriller: ["Spannung? Bitte mehr davon.", "Spannung? Bitte mehr davon."],
  Krimi: ["Den Täter hattest du früher.", "Den Täter hatte ich früher."], Abenteuer: ["Abenteuer gern, aber mit Niveau.", "Abenteuer gern, aber mit Niveau."],
  Kriegsfilm: ["Hier wird nicht verschont.", "Hier wird nicht verschont."], Dokumentarfilm: ["Fakten allein reichen nicht.", "Fakten allein reichen nicht."],
  Musical: ["Nicht jede Nummer sitzt.", "Nicht jede Nummer sitzt."], Musikfilm: ["Falsche Töne fallen auf.", "Falsche Töne fallen auf."],
  Mystery: ["Rätsel müssen sich lohnen.", "Rätsel müssen sich lohnen."], Biografie: ["Ein Leben allein ist noch kein Film.", "Ein Leben allein ist noch kein Film."],
};
const quip = (name, bias) => {
  if (Math.abs(bias) < 0.03) return "Ausgeglichen.";
  const pair = (bias > 0 ? MILD : STRICT)[name] || (bias > 0 ? ["Hier wirst du weich.", "Hier werde ich weich."] : ["Hier schaust du genau hin.", "Hier schaue ich genau hin."]);
  return own(pair[0], pair[1]);
};

/**
 * @param {HTMLElement} panel
 * @param {{threshold?: number, onThreshold?: (value: number) => void, onGenre?: (name: string) => void, introMode?: () => string}} options
 * @returns {{update(movies: Array, opts?: {filtered?: boolean}): void, show(): void, setThreshold(value: number): void}}
 */
export function initDuel(panel, { threshold = 1.5, onThreshold = () => {}, onGenre = () => {}, introMode = () => DEFAULT_DUEL_INTRO } = {}) {
  let entries = [];
  let th = readThreshold(threshold);
  let stale = true;
  let filteredHint = false;
  let mode = "dots";
  const expanded = { tips: false, low: false, rounds: false };

  panel.innerHTML = `
    <div class="dl-stage">
      <section class="dl-hero" aria-labelledby="dl-you-name">
        <p class="dl-marquee"><i aria-hidden="true"></i><span id="duel-count"></span><i aria-hidden="true"></i></p>
        <div class="dl-corners">
          <div class="dl-corner is-you">
            <span class="dl-corner-kick">In der goldenen Ecke</span>
            <h2 class="dl-name" id="dl-you-name">${own("Du", "Ich")}</h2>
            <p class="dl-avg"><b data-dl="you-avg"></b><span>Ø ${own("deine", "meine")} Note</span></p>
            <p class="dl-corner-text" data-dl="you-text"></p>
          </div>
          <div class="dl-ring-wrap">
            <div class="dl-ring" role="img">
              <div class="dl-ring-inner"><span class="dl-vs" aria-hidden="true">VS</span><b class="dl-share" data-dl="share"></b><span>einig mit der Welt</span><small>höchstens ± ${dec(AGREE)} Punkte</small></div>
            </div>
            <p class="dl-ring-legend" data-dl="legend"></p>
          </div>
          <div class="dl-corner is-world">
            <span class="dl-corner-kick">In der silbernen Ecke</span>
            <h2 class="dl-name">die Welt</h2>
            <p class="dl-avg"><span>Ø IMDb</span><b data-dl="world-avg"></b></p>
            <p class="dl-corner-text" data-dl="world-text"></p>
          </div>
        </div>
        <div class="dl-verdict">
          <div class="dl-stamp" data-dl="stamp"><small>Das Urteil</small><b></b></div>
          <p class="dl-verdict-text" data-dl="verdict"></p>
        </div>
      </section>
      <p class="dl-empty" hidden></p>
      <section class="dl-card dl-tape" aria-labelledby="dl-tape-title">
        <div class="dl-head">
          <div><p class="dl-kicker">Tale of the Tape</p><h2 class="dl-title" id="dl-tape-title">Die Kampf<em>werte</em></h2></div>
          <p class="dl-note">Ø Note je Bereich · der Balken zeigt, wer milder urteilt</p>
        </div>
        <div class="dl-tape-rows"></div>
      </section>
      <section class="dl-card dl-field-card" aria-labelledby="dl-field-title">
        <div class="dl-head">
          <div><p class="dl-kicker">Das Feld · jeder Punkt ein Titel</p><h2 class="dl-title" id="dl-field-title">${own("Wo ihr euch <em>trennt</em>", "Wo wir uns <em>trennen</em>")}</h2></div>
          <div class="dl-tools">
            <div class="dl-seg dl-steps" role="group" aria-label="Schwelle für Geheimtipps und Unterschätzte">
              <span aria-hidden="true">Schwelle</span>
              ${Array.from({ length: (THRESHOLD_MAX - THRESHOLD_MIN) / THRESHOLD_STEP + 1 }, (_, i) => THRESHOLD_MIN + i * THRESHOLD_STEP)
                .map(v => `<button type="button" data-duel-step="${v}" aria-pressed="false" aria-label="± ${points(v)}">± ${half(v)}</button>`).join("")}
            </div>
            <div class="dl-seg" role="group" aria-label="Darstellung">
              <button type="button" data-duel-mode="dots" aria-pressed="true">Punkte</button>
              <button type="button" data-duel-mode="covers" aria-pressed="false">Cover</button>
            </div>
            <div class="dl-zoom" role="group" aria-label="Zoom">
              <button type="button" data-duel-zoom="in" aria-label="Näher heran">+</button>
              <button type="button" data-duel-zoom="out" aria-label="Weiter weg">−</button>
              <button type="button" data-duel-zoom="reset" aria-label="Ganzes Feld">⤢</button>
            </div>
          </div>
        </div>
        <div class="dl-field">
          <canvas class="dl-canvas" role="img" aria-describedby="dl-field-help"></canvas>
          <span class="dl-side is-world" aria-hidden="true">← <span class="dl-long">Die </span>Welt<span class="dl-long"> sah mehr</span></span>
          <span class="dl-side is-you" aria-hidden="true">${own("Du", "Ich")}<span class="dl-long"> ${own("sahst", "sah")} mehr</span> →</span>
          <span class="dl-agree-label" aria-hidden="true">Einig</span>
          <div class="dl-callout is-high" hidden></div>
          <div class="dl-callout is-low" hidden></div>
          <button type="button" class="dl-handle is-low" role="slider" aria-label="Schwelle (links)" aria-valuemin="${THRESHOLD_MIN}" aria-valuemax="${THRESHOLD_MAX}"></button>
          <button type="button" class="dl-handle is-high" role="slider" aria-label="Schwelle (rechts)" aria-valuemin="${THRESHOLD_MIN}" aria-valuemax="${THRESHOLD_MAX}"></button>
          <div class="dl-tip" hidden></div>
        </div>
        <div class="dl-axis" aria-hidden="true"></div>
        <div class="dl-counts">
          <p class="is-low"><span>${own("Von dir unterschätzt", "Von mir unterschätzt")}</span><b data-dl="count-low"></b><small data-dl="sub-low"></small></p>
          <p><span>Dazwischen</span><b data-dl="count-mid"></b><small data-dl="sub-mid"></small></p>
          <p class="is-high"><span>${own("Deine Geheimtipps", "Meine Geheimtipps")}</span><b data-dl="count-high"></b><small data-dl="sub-high"></small></p>
        </div>
        <p class="dl-note" id="dl-field-help">Darüberfahren zeigt Cover und Urteil · Klick öffnet die Detailseite · Strg + Mausrad, Doppelklick oder + / − zoomen bis zu den Covern · die Schwelle lässt sich an den Markierungen ziehen</p>
      </section>
      <section class="dl-card dl-rounds" aria-labelledby="dl-rounds-title"></section>
      <div class="dl-pleas">
        <section class="dl-card dl-plea is-high" data-list="tips" aria-labelledby="duel-tips-title"></section>
        <section class="dl-card dl-plea is-low" data-list="low" aria-labelledby="duel-low-title"></section>
      </div>
      <p class="dl-coda" data-dl="coda"></p>
    </div>`;

  const $ = selector => panel.querySelector(selector);
  const slot = key => panel.querySelector(`[data-dl="${key}"]`);
  const stage = $(".dl-stage");
  const field = $(".dl-field");
  const canvas = $(".dl-canvas");
  const ctx = canvas.getContext("2d");
  const tip = $(".dl-tip");

  /* ------------------------------------------------------------ Plakat */

  let summary = null, highlights = null;
  const ringTarget = { hi: 0, same: 0 };
  function setRing(progress) {
    const ring = $(".dl-ring");
    ring.style.setProperty("--hi", `${ringTarget.hi * progress}%`);
    ring.style.setProperty("--same", `${(ringTarget.hi + ringTarget.same) * progress}%`);
    ring.style.setProperty("--end", `${100 * progress}%`);
    slot("share").textContent = `${Math.round((summary?.sameShare || 0) * 100 * progress)} %`;
  }
  function renderHero() {
    const s = summary, h = highlights;
    const count = s.count;
    $("#duel-count").textContent = `Die Kinothek präsentiert · ${n(count)} ${count === 1 ? "Titel" : "Titel"}`;
    const youAvg = count ? entries.reduce((sum, x) => sum + x.you, 0) / count : 0;
    const worldAvg = count ? entries.reduce((sum, x) => sum + x.imdb, 0) / count : 0;
    slot("you-avg").textContent = dec(youAvg, 2);
    slot("world-avg").textContent = dec(worldAvg, 2);
    slot("you-text").innerHTML = `${n(count)} ${count === 1 ? "Urteil" : "Urteile"}${h.tens ? ` · ${n(h.tens)} × die volle 10` : ""}${h.lowest !== null ? `<br>Härtestes Urteil: ${points(h.lowest)}` : ""}`;
    const votes = entries.reduce((sum, x) => sum + votesOf(x.movie), 0);
    const votesText = votes >= 1e9 ? `${dec(votes / 1e9, 1)} Mrd. Stimmen` : votes >= 1e6 ? `${n(Math.round(votes / 1e6))} Mio. Stimmen` : votes ? `${n(votes)} Stimmen` : "";
    slot("world-text").innerHTML = `Dieselben ${n(count)} Titel${votesText ? ` · ${votesText}` : ""}${h.imdbTop ? `<br>Höchstes Lob: ${dec(h.imdbTop.imdb)} für ${e(h.imdbTop.movie.title)}` : ""}`;
    ringTarget.hi = s.higher / Math.max(1, count) * 100;
    ringTarget.same = s.same / Math.max(1, count) * 100;
    $(".dl-ring").setAttribute("aria-label", `${Math.round(s.sameShare * 100)} Prozent einig: ${n(s.higher)} Titel ${own("gibst du", "gebe ich")} mehr, ${n(s.same)} einig, ${n(s.lower)} gibt die Welt mehr`);
    slot("legend").innerHTML = `<span class="is-high"><i></i>${n(s.higher)} ${own("du", "ich")} höher</span><span class="is-same"><i></i>${n(s.same)} einig</span><span class="is-low"><i></i>${n(s.lower)} Welt höher</span>`;
    const verdict = VERDICTS[s.critic];
    const stamp = slot("stamp");
    stamp.hidden = !verdict;
    stamp.querySelector("b").textContent = verdict || "";
    const more = Math.abs(s.mean) < 0.005 ? `${own("gibst du", "gebe ich")} <em>genau so viel</em> wie die Welt.`
      : `${own("gibst du", "gebe ich")} <em>${dec(Math.abs(s.mean), 2)} ${Math.abs(s.mean) === 1 ? "Punkt" : "Punkte"} ${s.mean > 0 ? "mehr" : "weniger"}</em> als die Welt.`;
    const ex = h.exactExample;
    slot("verdict").innerHTML = count ? `Im Schnitt ${more}${h.exact ? ` Auf den Zehntel genau einig ${own("wart ihr", "waren wir")} ${h.exact === 1 ? "einmal" : `${n(h.exact)} Mal`}${ex ? ` – etwa bei ${e(ex.movie.title)}, ${ex.you} zu ${ex.you}` : ""}.` : ""}` : "";
    slot("coda").textContent = { mild: "Kein K. o. – aber ein klarer Punktsieg nach Herz.", strict: "Kein K. o. – aber ein klarer Punktsieg nach Strenge.", fair: "Unentschieden nach Punkten. Fast." }[s.critic] || "";
    setRing(intro ? 0 : 1);
  }

  /* -------------------------------------------------------- Kampfwerte */

  function renderTape() {
    const label = row => ({ all: "Insgesamt", films: "Filme", series: "Serien", "mild-decade": `${row.decade}er`, "strict-decade": `${row.decade}er`, tens: own("Deine Zehner", "Meine Zehner") }[row.key]);
    const who = row => (row.you > row.imdb + 0.005 ? own("du milder", "ich milder") : row.imdb > row.you + 0.005 ? "die Welt milder" : "gleichauf");
    const note = row => ({
      "mild-decade": `${own("dein", "mein")} mildestes Jahrzehnt`, "strict-decade": `${own("dein", "mein")} strengstes Jahrzehnt`,
      tens: "so sieht es die Welt",
    }[row.key] || who(row));
    $(".dl-tape-rows").innerHTML = tapeRows(entries).map(row => {
      const diff = row.you - row.imdb, w = `${Math.min(100, Math.abs(diff) / 1.6 * 100).toFixed(1)}%`;
      return `<div class="dl-tape-row">
        <b class="dl-tape-num${diff > 0.005 ? " is-high" : ""}">${dec(row.you, 2)}</b>
        <span class="dl-bar is-you"><i style="width:${diff > 0.005 ? w : "0%"}"></i></span>
        <span class="dl-tape-label"><span>${e(label(row))}</span><small>${n(row.count)} Titel · ${e(note(row))}</small></span>
        <span class="dl-bar is-world"><i style="width:${diff < -0.005 ? w : "0%"}"></i></span>
        <b class="dl-tape-num${diff < -0.005 ? " is-low" : ""}">${dec(row.imdb, 2)}</b>
      </div>`;
    }).join("");
  }

  /* ------------------------------------------------------------- Das Feld */

  let layout = null;
  let W = 0, H = 0, dpr = 1;
  let cam = { x: 0, y: 0, k: 1 };
  let hits = [];
  let hover = null;
  let lastDrawMs = 0;
  let intro = null;   // Auftritt im Plakat: Ring füllt sich, dann der Stempel
  let flight = null;  // Punkte fliegen ein: "pending" bis das Feld zu sehen ist, dann {t0}
  const covers = new Map();

  function measure() {
    const width = Math.round(field.clientWidth) || W || 1000;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    layout = fieldLayout(entries, { width });
    W = width;
    H = Math.round(Math.min(600, Math.max(260, layout.height + 84)));
    canvas.style.height = `${H}px`;
    field.style.height = `${H}px`;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    for (const p of layout.points) {
      p.seed = hash(p.entry.movie.id);
      p.poster = colorOf(genresOf(p.entry.movie)[0] || "");
    }
    clampCam();
  }
  const sx = x => (x - cam.x) * cam.k;
  const sy = y => H / 2 + (y - cam.y) * cam.k;
  function clampCam() {
    cam.k = Math.min(MAX_ZOOM, Math.max(1, cam.k));
    cam.x = Math.min(W - W / cam.k, Math.max(0, cam.x));
    const reach = Math.max(0, (layout ? layout.height / 2 + 30 : 0) - H / (2 * cam.k));
    cam.y = Math.min(reach, Math.max(-reach, cam.y));
  }
  function zoomAt(factor, px = W / 2, py = H / 2) {
    const wx = cam.x + px / cam.k, wy = cam.y + (py - H / 2) / cam.k;
    cam.k = Math.min(MAX_ZOOM, Math.max(1, cam.k * factor));
    cam.x = wx - px / cam.k;
    cam.y = wy - (py - H / 2) / cam.k;
    clampCam();
    hideTip();
    requestRender();
  }

  /* Leuchten als vorgerenderte Sprites (schneller als shadowBlur) */
  const glow = {};
  for (const [key, color] of [["high", "233,196,111"], ["low", "168,198,228"]]) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${color},.55)`); grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    glow[key] = c;
  }

  function coverImage(movie) {
    const src = typeof movie.cover === "string" ? movie.cover.trim() : "";
    if (!src) return null;
    let c = covers.get(movie.id);
    if (!c) {
      if (covers.size > 500) covers.delete(covers.keys().next().value);
      const img = new Image();
      img.decoding = "async";
      c = { img, ok: false };
      img.onload = () => { c.ok = true; if (c.local) stage.dataset.localCovers = String(Number(stage.dataset.localCovers || 0) + 1); requestRender(); };
      img.onerror = async () => {
        if (c.local) { c.failed = true; return; }
        c.local = true;
        const local = await localCoverUrl(src);
        if (local) img.src = local; else c.failed = true;
      };
      img.src = src;
      covers.set(movie.id, c);
    }
    return c.ok ? c.img : null;
  }

  let frame = 0;
  function requestRender() { if (!frame) frame = requestAnimationFrame(draw); }

  function draw() {
    frame = 0;
    if (!layout || !W || panel.hidden) return;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const xOf = layout.xOf;
    // Zonen: jenseits der Schwelle getönt, „einig" als helles Band, Mittellinie
    const xl = sx(xOf(-th)), xr = sx(xOf(th)), a0 = sx(xOf(-AGREE)), a1 = sx(xOf(AGREE)), z = sx(xOf(0));
    ctx.fillStyle = "rgba(168,198,228,.055)"; ctx.fillRect(0, 0, Math.max(0, xl), H);
    ctx.fillStyle = "rgba(233,196,111,.06)"; ctx.fillRect(xr, 0, Math.max(0, W - xr), H);
    ctx.fillStyle = "rgba(239,230,216,.028)"; ctx.fillRect(a0, 0, a1 - a0, H);
    ctx.fillStyle = "rgba(239,230,216,.18)"; ctx.fillRect(Math.round(z), 0, 1, H);
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(168,198,228,.55)"; ctx.beginPath(); ctx.moveTo(Math.round(xl) + .5, 0); ctx.lineTo(Math.round(xl) + .5, H); ctx.stroke();
    ctx.strokeStyle = "rgba(233,196,111,.6)"; ctx.beginPath(); ctx.moveTo(Math.round(xr) + .5, 0); ctx.lineTo(Math.round(xr) + .5, H); ctx.stroke();
    ctx.setLineDash([]);

    const now = performance.now();
    const coverW = layout.coverW * cam.k, coverH = layout.coverH * cam.k;
    const showCovers = mode === "covers" || coverW >= COVER_PX;
    const r = Math.min(3.4, layout.cellW * 0.36) * Math.sqrt(cam.k);
    const next = [];
    let animating = false;
    for (const p of layout.points) {
      if (flight === "pending") break;
      let x = sx(p.x), y = sy(p.y);
      if (flight) {
        const delay = p.seed * 520, dur = 900;
        const t = Math.min(1, Math.max(0, (now - flight.t0 - delay) / dur));
        if (t < 1) animating = true;
        const k = 1 - Math.pow(1 - t, 3);
        const from = p.entry.diff > 0 || (p.entry.diff === 0 && p.seed > 0.5) ? W + 30 : -30;
        x = from + (x - from) * k;
        y = H / 2 + (y - H / 2) * (0.35 + 0.65 * k);
        if (t === 0) continue;
      }
      if (x < -coverW || x > W + coverW || y < -coverH || y > H + coverH) continue;
      const t = tone(p.entry.diff, th);
      if (showCovers) {
        const img = coverImage(p.entry.movie);
        const left = x - coverW / 2, top = y - coverH / 2;
        if (img) ctx.drawImage(img, left, top, coverW, coverH);
        else { ctx.fillStyle = p.poster; ctx.fillRect(left, top, coverW, coverH); }
        if (t === "high" || t === "low") { ctx.strokeStyle = COLORS[t]; ctx.lineWidth = Math.max(1, cam.k * 0.35); ctx.strokeRect(left + .5, top + .5, coverW - 1, coverH - 1); }
        next.push({ p, x, y, w: coverW, h: coverH });
      } else {
        if (t === "high" || t === "low") { const g = r * 4.2; ctx.drawImage(glow[t], x - g, y - g, g * 2, g * 2); }
        ctx.fillStyle = COLORS[t];
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        next.push({ p, x, y, w: r * 2, h: r * 2 });
      }
    }
    if (hover && !flight) {
      const h = next.find(item => item.p === hover);
      if (h) {
        ctx.strokeStyle = "#efe6d8"; ctx.lineWidth = 1.5;
        if (showCovers) ctx.strokeRect(h.x - h.w / 2 - 2.5, h.y - h.h / 2 - 2.5, h.w + 5, h.h + 5);
        else { ctx.beginPath(); ctx.arc(h.x, h.y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    hits = next;
    placeOverlays();
    lastDrawMs = performance.now() - t0;
    if (flight && flight !== "pending") {
      if (animating) requestRender();
      else { flight = null; requestRender(); }
    }
  }

  /* Achse, Markierungen, Ausreißer und Seitenbeschriftung folgen der Kamera */
  function placeOverlays() {
    const xOf = layout.xOf;
    const step = cam.k >= 3 ? 0.5 : 1;
    const ticks = [];
    for (let v = Math.ceil(layout.lo / step) * step; v <= layout.hi + 1e-9; v += step) {
      const x = sx(xOf(v));
      if (x < 8 || x > W - 8) continue;
      ticks.push(`<span style="left:${x.toFixed(1)}px">${Math.abs(v) < 1e-9 ? "einig" : signed(v, v % 1 ? 1 : 0)}</span>`);
    }
    $(".dl-axis").innerHTML = ticks.join("");
    const lowX = sx(xOf(-th)), highX = sx(xOf(th));
    const handles = [[".dl-handle.is-low", lowX, `−${half(th)}`], [".dl-handle.is-high", highX, `+${half(th)}`]];
    for (const [sel, x, text] of handles) {
      const handle = $(sel);
      handle.style.left = `${x.toFixed(1)}px`;
      handle.hidden = x < -20 || x > W + 20;
      handle.textContent = text;
      handle.setAttribute("aria-valuenow", String(th));
      handle.setAttribute("aria-valuetext", `± ${points(th)}`);
    }
    const agree = $(".dl-agree-label");
    agree.style.left = `${sx(xOf(0)).toFixed(1)}px`;
    const zoomed = cam.k > 1.05;
    stage.classList.toggle("is-zoomed", zoomed);
    for (const [sel, item] of [[".dl-callout.is-high", highlights?.wildest], [".dl-callout.is-low", highlights?.harshest]]) {
      const box = $(sel);
      const p = item && layout.points.find(q => q.entry === item);
      const strong = item && (sel.endsWith("high") ? item.diff >= 1 : item.diff <= -1);
      box.hidden = Boolean(zoomed || flight || !p || !strong);
      if (box.hidden) continue;
      const x = sx(p.x), y = sy(p.y);
      const right = x > W / 2;
      box.classList.toggle("is-right", right);
      box.style.left = right ? "" : `${Math.max(0, x - 14).toFixed(1)}px`;
      box.style.right = right ? `${Math.max(0, W - x - 14).toFixed(1)}px` : "";
      box.style.setProperty("--line-x", `${right ? (W - Math.max(0, W - x - 14)) - x : x - Math.max(0, x - 14)}px`);
      const top = sel.endsWith("high");
      box.style.top = top ? "14px" : "";
      box.style.bottom = top ? "" : "14px";
      box.style.setProperty("--line-h", `${Math.max(8, (top ? y - 14 : H - 14 - y) - box.offsetHeight - 6)}px`);
    }
  }

  function renderCallouts() {
    const fill = (sel, item, kicker) => {
      const box = $(sel);
      box.innerHTML = item ? `<small>${kicker}</small><b>${e(item.movie.title)}</b><span>${own("Du", "Ich")} ${item.you} · Welt ${dec(item.imdb)} · <strong>${signed(item.diff)}</strong></span>` : "";
    };
    fill(".dl-callout.is-high", highlights.wildest, "Der wildeste Ausreißer");
    fill(".dl-callout.is-low", highlights.harshest, own("Hier warst du am strengsten", "Hier war ich am strengsten"));
  }

  /* Vorschau */
  const posterStyle = movie => `--g:${colorOf(genresOf(movie)[0] || "")}`;
  const thumb = movie => `<span class="dl-thumb" style="${posterStyle(movie)}">${movie.cover ? `<img src="${e(movie.cover)}" alt="" loading="lazy" decoding="async">` : ""}</span>`;
  let tipFor = null;
  function hitAt(px, py) {
    let best = null, bestD = Infinity;
    for (const h of hits) {
      const dx = Math.abs(px - h.x), dy = Math.abs(py - h.y);
      if (dx > Math.max(6, h.w / 2 + 2) || dy > Math.max(6, h.h / 2 + 2)) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }
  function showTip(h) {
    if (!h) { hideTip(); return; }
    if (tipFor !== h.p) {
      tipFor = h.p;
      const { movie, you, imdb, diff } = h.p.entry;
      tip.innerHTML = `${thumb(movie)}<span><b>${e(movie.title)}</b><small>${e([movie.year, genresOf(movie).slice(0, 2).join(", ")].filter(Boolean).join(" · "))}</small>
        <span class="dl-tip-score"><span>${own("Du", "Ich")} <em class="is-you">${you}</em></span><span>Welt <em class="is-world">${dec(imdb)}</em></span><strong class="is-${tone(diff, th)}">${signed(diff)}</strong></span></span>`;
      tip.querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    }
    tip.hidden = false;
    const flip = h.x > W - 300;
    tip.style.left = `${flip ? h.x - tip.offsetWidth - h.w / 2 - 12 : h.x + h.w / 2 + 12}px`;
    tip.style.top = `${Math.min(H - tip.offsetHeight - 6, Math.max(6, h.y - tip.offsetHeight / 2))}px`;
    if (hover !== h.p) { hover = h.p; requestRender(); }
  }
  function hideTip() {
    tip.hidden = true; tipFor = null;
    if (hover) { hover = null; requestRender(); }
  }
  const local = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };

  /* Zoom, Verschieben, Klick */
  canvas.addEventListener("wheel", event => {
    if (!event.ctrlKey && !event.metaKey) return; // normales Scrollen bleibt der Seite
    event.preventDefault();
    const at = local(event);
    zoomAt(Math.exp(-event.deltaY * 0.0022), at.x, at.y);
  }, { passive: false });
  canvas.addEventListener("dblclick", event => { const at = local(event); zoomAt(2, at.x, at.y); });
  const pointers = new Map();
  let drag = null, pinch = null;
  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointers.set(event.pointerId, local(event));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k };
      drag = null;
    } else drag = { ...local(event), cam: { ...cam }, moved: false, id: event.pointerId };
  });
  canvas.addEventListener("pointermove", event => {
    const at = local(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, at);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinch.k * d / Math.max(1, pinch.d);
      zoomAt(target / cam.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (drag) {
      if (!drag.moved && Math.abs(at.x - drag.x) + Math.abs(at.y - drag.y) > 4 && cam.k > 1) {
        drag.moved = true;
        canvas.setPointerCapture(drag.id);
        canvas.classList.add("is-dragging");
      }
      if (drag.moved) {
        cam.x = drag.cam.x - (at.x - drag.x) / cam.k;
        cam.y = drag.cam.y - (at.y - drag.y) / cam.k;
        clampCam(); hideTip(); requestRender();
        return;
      }
    }
    if (event.pointerType === "mouse") showTip(hitAt(at.x, at.y));
  });
  const endPointer = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    canvas.classList.remove("is-dragging");
    setTimeout(() => { if (!pointers.size) drag = null; });
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", event => { if (event.pointerType === "mouse") hideTip(); });
  canvas.addEventListener("click", event => {
    if (drag?.moved || (flight && flight !== "pending")) return;
    const at = local(event);
    const h = hitAt(at.x, at.y);
    if (!h) return;
    if (event.pointerType && event.pointerType !== "mouse" && tipFor !== h.p) { showTip(h); return; } // Touch: erst Vorschau, dann öffnen
    location.href = href(h.p.entry.movie);
  });

  /* Schwelle: Knöpfe, Markierungen ziehen, Pfeiltasten */
  function setTh(value, { notify = true } = {}) {
    const next = readThreshold(value);
    if (next === th) return;
    th = next;
    renderThresholdParts();
    if (layout) placeOverlays(); // Markierungen sofort, das Feld im nächsten Bild
    requestRender();
    if (notify) onThreshold(th);
  }
  panel.querySelectorAll(".dl-handle").forEach(handle => {
    handle.addEventListener("pointerdown", event => {
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-dragging");
      const move = ev => {
        const at = local(ev);
        const wx = cam.x + at.x / cam.k;
        const d = layout.lo + wx / W * (layout.hi - layout.lo);
        setTh(Math.abs(d));
      };
      const up = () => { handle.classList.remove("is-dragging"); handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
    handle.addEventListener("keydown", event => {
      const outward = handle.classList.contains("is-high") ? 1 : -1;
      const delta = { ArrowRight: outward, ArrowUp: 1, ArrowLeft: -outward, ArrowDown: -1, PageUp: 1, PageDown: -1 }[event.key];
      if (event.key === "Home") { setTh(THRESHOLD_MIN); event.preventDefault(); return; }
      if (event.key === "End") { setTh(THRESHOLD_MAX); event.preventDefault(); return; }
      if (!delta) return;
      event.preventDefault();
      setTh(th + delta * THRESHOLD_STEP);
    });
  });

  function renderThresholdParts() {
    panel.querySelectorAll("[data-duel-step]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.duelStep) === th)));
    const { tips, low } = duelLists(entries, th);
    slot("count-high").textContent = n(tips.length);
    slot("count-low").textContent = n(low.length);
    slot("count-mid").textContent = n(entries.length - tips.length - low.length);
    slot("sub-high").textContent = `mindestens ${points(th)} über IMDb`;
    slot("sub-low").textContent = `mindestens ${points(th)} unter IMDb`;
    slot("sub-mid").textContent = summary ? `Ø Abstand ${dec(summary.meanAbs, 2)} Punkte` : "";
    renderPleas(tips, low);
  }

  /* -------------------------------------------------------------- Runden */

  function renderRounds() {
    const g = genreBias(entries);
    const box = $(".dl-rounds");
    const total = g.list.length;
    const shown = expanded.rounds || total <= ROUNDS_SHORT ? g.list.map((item, i) => ({ ...item, n: i + 1 }))
      : [...g.list.slice(0, ROUNDS_SHORT / 2).map((item, i) => ({ ...item, n: i + 1 })), { gap: total - ROUNDS_SHORT },
        ...g.list.slice(-ROUNDS_SHORT / 2).map((item, i) => ({ ...item, n: total - ROUNDS_SHORT / 2 + i + 1 }))];
    const max = Math.max(0.2, ...g.list.map(item => Math.abs(item.bias))) * 1.08;
    const count = Math.min(total, expanded.rounds ? total : ROUNDS_SHORT);
    const word = count <= 12 ? NUMBER_WORDS[count] : n(count);
    box.innerHTML = `<div class="dl-head">
        <div><p class="dl-kicker">Nach Genre · gemessen an ${own("deinem", "meinem")} Schnitt (${signed(g.mean, 2)})</p>
        <h2 class="dl-title" id="dl-rounds-title">${count === 1 ? "Eine <em>Runde</em>" : `${word} <em>Runden</em>`}</h2></div>
        ${total >= 2 ? `<p class="dl-scale" aria-hidden="true"><span class="is-low">← strenger als sonst</span><span class="is-high">milder als sonst →</span></p>` : ""}
      </div>
      ${total >= 2 ? `<div class="dl-round-rows">${shown.map(item => item.gap ? `<p class="dl-round-gap"><span>${n(item.gap)} ${item.gap === 1 ? "Genre" : "Genres"} im Gleichgewicht</span></p>`
        : (() => {
          const k = 50 + item.bias / max * 46;
          const side = item.bias > 0 ? "is-high" : item.bias < 0 ? "is-low" : "is-same";
          return `<button type="button" class="dl-round ${side}" data-duel-genre="${e(item.name)}" aria-label="Runde ${item.n}, ${e(item.name)}: ${signed(item.bias, 2)} gegenüber ${own("deinem", "meinem")} Schnitt, ${n(item.count)} Titel – als Filter setzen">
            <span class="dl-round-n">R${item.n}</span>
            <span class="dl-round-name"><b>${e(item.name)}</b><small>${n(item.count)}</small></span>
            <span class="dl-rope" aria-hidden="true"><i class="dl-rope-bar" style="left:${Math.min(50, k).toFixed(1)}%;width:${Math.abs(k - 50).toFixed(1)}%"></i><i class="dl-knot" style="left:${k.toFixed(1)}%"></i></span>
            <span class="dl-round-v">${signed(item.bias, 2)}</span>
            <span class="dl-round-quip">${e(quip(item.name, item.bias))}</span>
          </button>`;
        })()).join("")}</div>
        ${total > ROUNDS_SHORT ? `<button class="dl-more" type="button" data-duel-more="rounds" aria-expanded="${expanded.rounds}">${expanded.rounds ? "Nur die deutlichsten zeigen" : `Alle ${n(total)} Runden zeigen`}</button>` : ""}
        <p class="dl-note">Runde anklicken setzt den Genre-Filter – Feld und Plädoyers folgen.</p>`
      : `<p class="dl-text">Zu wenige Titel für einen Vergleich nach Genre${filteredHint ? " – Filter lockern?" : "."}</p>`}`;
  }

  /* ----------------------------------------------------------- Plädoyers */

  function renderPleas(tips, low) {
    const block = (key, list) => {
      const isTips = key === "tips";
      const kicker = isTips ? own("Deine Geheimtipps", "Meine Geheimtipps") : own("Von dir unterschätzt", "Von mir unterschätzt");
      const head = isTips ? own("Du sahst mehr als <em>die Welt</em>", "Ich sah mehr als <em>die Welt</em>") : own("Die Welt sah mehr als <em>du</em>", "Die Welt sah mehr als <em>ich</em>");
      const lead = isTips ? `Mindestens ${points(th)} über IMDb. Die Welt hat es einfach noch nicht verstanden.` : `Mindestens ${points(th)} unter IMDb. Vielleicht beim zweiten Mal?`;
      const empty = isTips ? `Bei ± ${points(th)} hat ${own("dich", "mich")} nichts so überzeugt, dass die Welt danebenlag.` : `Bei ± ${points(th)} ${own("hast du", "habe ich")} nichts unterschätzt. Respekt.`;
      const top = list.slice(0, 3);
      const rest = (expanded[key] ? list : list.slice(0, LIST_SHORT)).slice(3);
      const pos = v => `${((v - 1) / 9 * 100).toFixed(2)}%`;
      return `<div><p class="dl-kicker">${kicker} · ${n(list.length)} Titel</p><h2 class="dl-title" id="duel-${key}-title">${head}</h2><p class="dl-text">${lead}</p></div>
        ${list.length ? `<ol class="dl-posters">${top.map((item, i) => `<li><a class="dl-poster${item.movie.cover ? " has-cover" : ""}" href="${href(item.movie)}">
            <span class="dl-poster-art" style="${posterStyle(item.movie)}"><span class="dl-poster-n">N° ${i + 1}</span><span class="dl-poster-name">${e(item.movie.title)}</span>${item.movie.cover ? `<img src="${e(item.movie.cover)}" alt="" loading="lazy" decoding="async">` : ""}</span>
            <span class="dl-poster-title"><span class="dl-pt-name">${e(item.movie.title)}</span><small>${e(item.movie.year || "")}</small></span>
            <span class="dl-scorecard"><span><span>${own("Du", "Ich")} <b class="is-you">${item.you}</b></span><span>Welt <b class="is-world">${dec(item.imdb)}</b></span></span><strong>${signed(item.diff)}</strong></span>
          </a></li>`).join("")}</ol>
          ${rest.length ? `<ol class="dl-rows" start="4">${rest.map((item, i) => {
            const a = Math.min(item.you, item.imdb), b = Math.max(item.you, item.imdb);
            return `<li><a class="dl-row" href="${href(item.movie)}">
              <span class="dl-row-rank">${i + 4}</span>
              <span class="dl-row-title"><b>${e(item.movie.title)}</b><small>${e(item.movie.year || "")} · ${own("Du", "Ich")} ${item.you} · Welt ${dec(item.imdb)}</small></span>
              <span class="dl-dumbbell" aria-hidden="true"><i class="dl-db-bar" style="left:${pos(a)};width:${((b - a) / 9 * 100).toFixed(2)}%"></i><i class="dl-db-you" style="left:${pos(item.you)}"></i><i class="dl-db-world" style="left:${pos(item.imdb)}"></i></span>
              <strong>${signed(item.diff)}</strong></a></li>`;
          }).join("")}</ol>` : ""}`
          : `<p class="dl-plea-empty">${empty}</p>`}
        ${list.length > LIST_SHORT ? `<button class="dl-more" type="button" data-duel-more="${key}" aria-expanded="${expanded[key]}">${expanded[key] ? "Weniger zeigen" : `Alle ${n(list.length)} zeigen`}</button>` : ""}`;
    };
    $('[data-list="tips"]').innerHTML = block("tips", tips);
    $('[data-list="low"]').innerHTML = block("low", low);
    panel.querySelectorAll(".dl-poster-art img, .dl-thumb img").forEach(img => img.addEventListener("error", () => { img.closest(".dl-poster")?.classList.remove("has-cover"); img.remove(); }, { once: true }));
  }

  /* ------------------------------------------------------------- Auftritt */

  let introDone = false;
  function maybeIntro() {
    if (introDone || intro) return;
    if (!entries.length) return; // erst mit Daten (sie kommen oft nach dem ersten Öffnen)
    if (reducedMotion()) { finishIntro(); return; }
    introDone = true;
    let memory = {};
    try {
      memory = { seenThisSession: sessionStorage.getItem("duel:intro-session") === "1", last: Number(localStorage.getItem("duel:intro-last")) || 0, day: localStorage.getItem("duel:intro-day") || "" };
    } catch { /* ohne Speicher: Standard */ }
    const due = introDue(introMode() || DEFAULT_DUEL_INTRO, { now: new Date(), ...memory });
    if (!due.play) { finishIntro(); return; }
    try {
      if (due.remember.session) sessionStorage.setItem("duel:intro-session", "1");
      if (due.remember.last) localStorage.setItem("duel:intro-last", String(due.remember.last));
      if (due.remember.day) localStorage.setItem("duel:intro-day", due.remember.day);
    } catch { /* egal */ }
    stage.dataset.intro = "played";
    stage.classList.add("is-entering");
    intro = { t0: performance.now() };
    flight = "pending";
    setRing(0);
    const tick = () => {
      if (!intro) return;
      const progress = Math.min(1, (performance.now() - intro.t0) / 1500);
      setRing(1 - Math.pow(1 - progress, 3));
      if (progress >= 1) finishIntro(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    requestRender();
    checkFlight();
  }
  function finishIntro() {
    introDone = true;
    if (intro) {
      intro = null;
      stage.classList.remove("is-entering");
      stage.classList.add("is-stamped");
    }
    setRing(1);
    requestRender();
  }
  // Die Punkte fliegen erst ein, wenn das Feld ins Bild kommt
  function startFlight() {
    if (flight !== "pending") return;
    flight = { t0: performance.now() };
    requestRender();
  }
  function checkFlight() {
    if (flight !== "pending") return;
    const rect = field.getBoundingClientRect();
    if (rect.height && rect.top < window.innerHeight * 0.85 && rect.bottom > 0) startFlight();
  }
  new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) startFlight(); }, { threshold: 0.25 }).observe(field);

  /* ------------------------------------------------------------ Gesamtbild */

  function render() {
    summary = duelSummary(entries);
    highlights = duelHighlights(entries);
    const empty = !entries.length;
    stage.classList.toggle("is-empty", empty);
    const emptyBox = $(".dl-empty");
    emptyBox.hidden = !empty;
    emptyBox.textContent = empty ? `Keine bewerteten Titel mit IMDb-Wertung${filteredHint ? " – Suche oder Filter lockern?" : "."}` : "";
    renderHero();
    renderTape();
    renderRounds();
    measure();
    renderCallouts();
    canvas.setAttribute("aria-label", `Das Feld: ${n(entries.length)} Titel nach Abstand zwischen ${own("deiner", "meiner")} Note und IMDb – links die Welt höher, rechts ${own("du", "ich")}`);
    renderThresholdParts();
    hideTip();
    requestRender();
    stale = false;
  }

  panel.addEventListener("click", event => {
    const step = event.target.closest("[data-duel-step]");
    if (step) { setTh(Number(step.dataset.duelStep)); return; }
    const modeButton = event.target.closest("[data-duel-mode]");
    if (modeButton) {
      mode = modeButton.dataset.duelMode;
      panel.querySelectorAll("[data-duel-mode]").forEach(b => b.setAttribute("aria-pressed", String(b === modeButton)));
      stage.classList.toggle("is-covers", mode === "covers");
      hideTip(); requestRender();
      return;
    }
    const zoomButton = event.target.closest("[data-duel-zoom]");
    if (zoomButton) {
      const what = zoomButton.dataset.duelZoom;
      if (what === "reset") { cam = { x: 0, y: 0, k: 1 }; hideTip(); requestRender(); }
      else zoomAt(what === "in" ? 1.8 : 1 / 1.8);
      return;
    }
    const genre = event.target.closest("[data-duel-genre]");
    if (genre) { onGenre(genre.dataset.duelGenre); return; }
    const more = event.target.closest("[data-duel-more]");
    if (more) {
      const key = more.dataset.duelMore;
      expanded[key] = !expanded[key];
      if (key === "rounds") renderRounds(); else renderThresholdParts();
      panel.querySelector(`[data-duel-more="${key}"]`)?.focus();
    }
  });

  let lastWidth = 0;
  new ResizeObserver(() => {
    const width = Math.round(field.clientWidth);
    if (!width || width === lastWidth || stale || !layout) return;
    lastWidth = width;
    const k = cam.k;
    measure();
    cam = { x: 0, y: 0, k: 1 };
    if (k > 1) zoomAt(k);
    requestRender();
  }).observe(field);

  // Testhaken (wie im Filmuniversum)
  stage._duel = { flight: () => flight, hits: () => hits, cam: () => ({ ...cam }), drawMs: () => lastDrawMs, layout: () => layout, threshold: () => th, draw: () => draw() };

  return {
    update(movies, { filtered = false } = {}) {
      entries = duelEntries(movies);
      filteredHint = filtered;
      stale = true;
      if (!panel.hidden) { render(); maybeIntro(); }
    },
    show() {
      if (stale) render();
      else if (Math.round(field.clientWidth) !== W) { measure(); requestRender(); }
      else requestRender();
      lastWidth = Math.round(field.clientWidth);
      maybeIntro();
    },
    setThreshold(value) {
      if (!stale) setTh(value, { notify: false });
      else th = readThreshold(value);
    },
  };
}
