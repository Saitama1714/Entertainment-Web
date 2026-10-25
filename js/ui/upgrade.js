import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { localCoverUrl } from "../cover-store.js";
import {
  upgradeCandidates, tidyUpgradeList, setUpgradeItem, readUpgradeList, shelfCounts, upgradeScore, mediumRank, clearSkips,
  WEIGHTS, UPGRADE_MINS, DEFAULT_MIN, DEFAULT_TARGET, PIXELS,
} from "../logic/upgrade-logic.js";
import { genresOf, titleKind } from "../logic/movies-logic.js";
import { colorOf } from "../logic/universe-logic.js";

/*
 * Registerkarte „Upgrade" – „Das Kopierwerk" (nur Dashboard). Kopf mit den
 * Schaltern Ziel (4K | Blu-ray) und Mindestnote, dem Platz 1 als
 * Vorher/Nachher-Plakat (Trennlinie ziehbar) und „Was du gewinnst"; darunter
 * die Aufträge (Rangliste nach Upgrade-Wert) und rechts der Auftragsschein
 * (Merkliste mit „Gekauft"). „Nicht upgraden" stellt einen Titel für beide
 * Ziele zurück (eingeklappt unter den Aufträgen, einzeln oder alle
 * zurücksetzen; einzeln auch auf der Detailseite). Immer die ganze
 * Kinothek, ohne Suche und Filter. Zahlen: js/logic/upgrade-logic.js.
 */

const e = escapeHtml;
const n = value => Number(value).toLocaleString("de-DE");
const href = movie => `movie.html?id=${encodeURIComponent(movie.id)}`;
const LIST_SHORT = 12;
const NAMES = { "4k": "4K", bd: "Blu-ray" };
const MEDIUM_NAME = { 1: "DVD", 2: "Blu-ray", 3: "4K" };
const RESOLUTION = { 1: "480p", 2: "1080p", 3: "2160p" };
const votesText = movie => {
  const v = Number(String(movie.numVotes ?? "").replace(/[^\d]/g, "")) || 0;
  if (!v) return "";
  return v >= 1e6 ? `${(Math.round(v / 1e5) / 10).toLocaleString("de-DE")} Mio. Stimmen` : `${n(Math.round(v / 1000))} Tsd. Stimmen`;
};
const kind = movie => ({ series: "Serie" }[titleKind(movie)] || "");
const posterStyle = movie => `--g:${colorOf(genresOf(movie)[0] || "")}`;

/**
 * @param {HTMLElement} panel
 * @param {{target?: string, min?: number, list?: Array, onView?: (view: {upgradeTarget: string, upgradeMin: number}) => void,
 *   onList?: (list: Array, done: Array) => void}} options
 * @returns {{update(movies: Array): void, show(): void, setList(list: Array): void}}
 */
export function initUpgrade(panel, { target = DEFAULT_TARGET, min, list = [], onView = () => {}, onList = () => {} } = {}) {
  let movies = [];
  let goal = target === "bd" ? "bd" : "4k";
  let floor = UPGRADE_MINS.includes(min) ? min : DEFAULT_MIN[goal];
  let items = readUpgradeList(list);
  let seg = "all";
  let expanded = false;
  let stale = true;
  let split = 50;

  panel.innerHTML = `
    <div class="up-stage">
      <section class="up-hero" aria-labelledby="up-title">
        <div class="up-hero-main">
          <div class="up-switches">
            <div class="up-seg" role="group" aria-label="Ziel"><span aria-hidden="true">Ziel</span>
              <button type="button" data-up-target="4k" aria-pressed="false">4K</button><button type="button" data-up-target="bd" aria-pressed="false">Blu-ray</button></div>
            <div class="up-seg" role="group" aria-label="Ab welcher eigenen Note"><span aria-hidden="true">Ab Note</span>
              ${UPGRADE_MINS.map(v => `<button type="button" data-up-min="${v}" aria-pressed="false" aria-label="Ab Note ${v}">${v}</button>`).join("")}</div>
          </div>
          <p class="up-kicker" data-up="kicker"></p>
          <h2 class="up-title" id="up-title">Bereit für <em data-up="name"></em></h2>
          <p class="up-lede" data-up="lede"></p>
          <div class="up-stats" data-up="stats"></div>
        </div>
        <div class="up-hero-side">
          <div class="up-feature" data-up="feature"></div>
          <div class="up-gain" aria-labelledby="up-gain-title">
            <p class="up-kicker is-quiet" id="up-gain-title">Was du gewinnst</p>
            <div class="up-frames" aria-hidden="true"><i class="is-uhd"><b>4K</b></i><i class="is-bd"><b>Blu-ray</b></i><i class="is-dvd"><b>DVD</b></i></div>
            <p class="up-gain-text" data-up="gain"></p>
          </div>
        </div>
      </section>
      <div class="up-work">
        <section class="up-card up-orders" aria-labelledby="up-orders-title">
          <div class="up-head">
            <div><p class="up-kicker is-quiet">Die Aufträge · nach Upgrade-Wert</p>
              <h2 class="up-h2" id="up-orders-title">Was zuerst ins <em>Kopierwerk</em> geht</h2></div>
            <div class="up-seg up-medium" role="group" aria-label="Medium">
              <button type="button" data-up-seg="all" aria-pressed="true">Alle</button><button type="button" data-up-seg="dvd" aria-pressed="false">DVD</button><button type="button" data-up-seg="bd" aria-pressed="false">Blu-ray</button></div>
          </div>
          <p class="up-weights" data-up="weights"></p>
          <ol class="up-rows" data-up="rows"></ol>
          <p class="up-empty" data-up="empty" hidden></p>
          <button type="button" class="up-more" data-up-more hidden></button>
          <details class="up-skipped" data-up="skipped-box" hidden>
            <summary><span>Zurückgestellt · <b data-up="skip-count"></b></span><small>Diese Titel prüft das Kopierwerk nicht, bis du sie zurücksetzt – für 4K und Blu-ray.</small></summary>
            <ol class="up-skip-list" data-up="skipped"></ol>
            <div class="up-skip-all" data-up="skip-all"></div>
          </details>
        </section>
        <aside class="up-slip" aria-labelledby="up-slip-title">
          <div class="up-paper">
            <div class="up-paper-head"><h2 id="up-slip-title">Auftragsschein</h2><span>Kopierwerk</span></div>
            <p class="up-paper-label" data-up="wish-label"></p>
            <ol class="up-paper-list" data-up="wish"></ol>
            <p class="up-paper-label" data-up="bought-label"></p>
            <ol class="up-paper-list is-bought" data-up="bought"></ol>
            <p class="up-paper-note">Trag gekaufte Titel bei IMDb in der Liste „Filmsammlung“ mit dem neuen Medium ein (4K oder Blu-ray). Sobald der nächste Import es meldet, verschwinden sie hier von selbst.</p>
          </div>
          <p class="up-fine">Ob es eine 4K- oder Blu-ray-Ausgabe gibt, prüft die Liste nicht. Ziel und Mindestnote merkt sich der Reiter.</p>
        </aside>
      </div>
    </div>`;
  const $ = selector => panel.querySelector(selector);
  const slot = key => panel.querySelector(`[data-up="${key}"]`);
  const stage = $(".up-stage");

  const save = () => onList(items, []);
  const byId = id => movies.find(m => m.id === id);

  /* ------------------------------------------------------------- Kopf */

  function renderHead(candidates) {
    const shelf = shelfCounts(movies);
    stage.dataset.target = goal;
    panel.querySelectorAll("[data-up-target]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.upTarget === goal)));
    panel.querySelectorAll("[data-up-min]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.upMin) === floor)));
    slot("kicker").textContent = `Das Kopierwerk · ab deiner ${floor}`;
    slot("name").textContent = NAMES[goal];
    slot("lede").textContent = goal === "4k"
      ? "Deine Lieblinge, die noch auf DVD oder Blu-ray im Regal stehen – sortiert danach, wie sehr sich der Sprung auf 4K lohnt."
      : "Die günstige Runde: deine Lieblinge, die noch auf DVD stehen – sortiert danach, wie sehr sich eine Blu-ray lohnt.";
    const dvd = candidates.filter(c => mediumRank(c.movie.medium) === 1).length;
    const cells = goal === "4k"
      ? [[candidates.length, "Kandidaten", true], [dvd, "noch auf DVD"], [candidates.length - dvd, "auf Blu-ray"]]
      : [[candidates.length, "Kandidaten", true], [shelf.bd, "schon auf Blu-ray"], [shelf.uhd, "schon in 4K"]];
    slot("stats").innerHTML = cells.map(([value, label, main]) => `<p class="up-stat${main ? " is-main" : ""}"><b>${n(value)}</b><span>${label}</span></p>`).join("");
    slot("gain").innerHTML = goal === "4k"
      ? `4K hat <b>${PIXELS.uhd / PIXELS.bd}-mal</b> so viele Bildpunkte wie Blu-ray – und <b>${PIXELS.uhd / PIXELS.dvd}-mal</b> so viele wie DVD.`
      : `Blu-ray hat <b>${PIXELS.bd / PIXELS.dvd}-mal</b> so viele Bildpunkte wie DVD – zum Bruchteil des 4K-Preises.`;
    renderFeature(candidates[0]);
  }

  /* Platz 1 als Vorher/Nachher-Plakat: links das Medium im Regal (gerastert), rechts das Ziel */
  let featureFor = null;
  function renderFeature(top) {
    const box = slot("feature");
    if (!top) { box.innerHTML = ""; box.hidden = true; featureFor = null; return; }
    box.hidden = false;
    const key = `${top.movie.id}|${goal}`;
    const from = mediumRank(top.movie.medium), to = goal === "4k" ? 3 : 2;
    if (featureFor === key) { box.querySelector(".up-feature-kick").textContent = `N° 1 · Upgrade-Wert ${top.score}`; return; }
    featureFor = key;
    const m = top.movie;
    const cover = typeof m.cover === "string" && m.cover.trim() ? m.cover.trim() : "";
    box.innerHTML = `<span class="up-feature-kick">N° 1 · Upgrade-Wert ${top.score}</span>
      <div class="up-compare" style="--split:${split}%;${posterStyle(m)}">
        <div class="up-layer is-after"><span class="up-fallback">${e(m.title)}</span>${cover ? `<img src="${e(cover)}" alt="" decoding="async">` : ""}</div>
        <div class="up-layer is-before" aria-hidden="true"><span class="up-fallback">${e(m.title)}</span><canvas></canvas><i class="up-grid"></i></div>
        <span class="up-tag is-before">${MEDIUM_NAME[from]}<small> · ${RESOLUTION[from]}</small></span>
        <span class="up-tag is-after">${MEDIUM_NAME[to]}<small> · ${RESOLUTION[to]}</small></span>
        <button type="button" class="up-split" role="slider" aria-label="Vorher und nachher vergleichen" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${split}"><span aria-hidden="true">‹ ›</span></button>
      </div>
      <a class="up-feature-title" href="${href(m)}">${e(m.title)}<small>${e([m.year, kind(m), `Note ${m.yourRating}`].filter(Boolean).join(" · "))}</small></a>`;
    const img = box.querySelector(".is-after img");
    if (img) {
      const pixelate = () => {
        const canvas = box.querySelector(".is-before canvas");
        if (!canvas) return;
        // Auflösung wie im Regal: DVD grob, Blu-ray feiner
        const w = from === 1 ? 30 : 64, h = Math.round(w * 1.5);
        canvas.width = w; canvas.height = h;
        try { canvas.getContext("2d").drawImage(img, 0, 0, w, h); canvas.classList.add("is-ready"); } catch { /* bleibt beim Raster */ }
      };
      let local = false;
      img.addEventListener("load", pixelate, { once: false });
      img.addEventListener("error", async () => {
        if (local) { img.remove(); return; }
        local = true;
        const url = await localCoverUrl(cover);
        if (url) img.src = url; else img.remove();
      });
      if (img.complete && img.naturalWidth) pixelate();
    }
  }
  function setSplit(value) {
    split = Math.round(Math.max(0, Math.min(100, value)));
    const compare = $(".up-compare");
    if (!compare) return;
    compare.style.setProperty("--split", `${split}%`);
    compare.querySelector(".up-split").setAttribute("aria-valuenow", String(split));
  }

  /* ---------------------------------------------------------- Aufträge */

  function renderRows(candidates) {
    const w = WEIGHTS[goal];
    $(".up-medium").hidden = goal !== "4k";
    panel.querySelectorAll("[data-up-seg]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.upSeg === seg)));
    slot("weights").innerHTML = [["note", "Deine Note"], ["medium", "Medium (DVD bringt den größeren Sprung)"], ["reach", "Jahr und Bekanntheit"]]
      .filter(([key]) => w[key] > 0).map(([key, label]) => `<span><i class="is-${key}"></i>${label} ${Math.round(w[key] * 100)} %</span>`).join("");
    const shown = goal === "4k" && seg !== "all" ? candidates.filter(c => mediumRank(c.movie.medium) === (seg === "dvd" ? 1 : 2)) : candidates;
    const list = expanded ? shown : shown.slice(0, LIST_SHORT);
    const to = NAMES[goal];
    slot("rows").innerHTML = list.map((c, i) => {
      const m = c.movie, rank = mediumRank(m.medium);
      const wished = items.some(item => item.id === m.id && item.state === "wish" && item.target === goal);
      const seg3 = ["note", "medium", "reach"].map(key => `<i class="is-${key}" style="width:${(w[key] * c.parts[key] * 100).toFixed(1)}%"></i>`).join("");
      return `<li class="up-row">
        <span class="up-rank">${i + 1}</span>
        <a class="up-thumb" href="${href(m)}" tabindex="-1" aria-hidden="true" style="${posterStyle(m)}">${m.cover ? `<img src="${e(m.cover)}" alt="" loading="lazy" decoding="async">` : ""}</a>
        <span class="up-row-title"><a href="${href(m)}">${e(m.title)}</a><small>${e([m.year, kind(m), `Note ${m.yourRating}`, votesText(m)].filter(Boolean).join(" · "))}</small></span>
        <span class="up-route" aria-label="${MEDIUM_NAME[rank]} zu ${to}"><b class="is-m${rank}">${MEDIUM_NAME[rank]}</b><i aria-hidden="true">→</i><b class="is-to-${goal}">${to}</b></span>
        <span class="up-score"><span><b>${c.score}</b><small>von 100</small></span><span class="up-bar" aria-hidden="true">${seg3}</span></span>
        <span class="up-actions">
          <button type="button" class="up-btn${wished ? " is-on" : ""}" data-up-wish="${e(m.id)}" aria-pressed="${wished}">${wished ? "Gemerkt" : "Merken"}</button>
          <button type="button" class="up-btn is-quiet" data-up-buy="${e(m.id)}">Gekauft</button>
          <button type="button" class="up-skip" data-up-skip="${e(m.id)}" title="Fällt aus beiden Listen, bis du es zurücksetzt">Nicht upgraden</button>
        </span>
      </li>`;
    }).join("");
    slot("rows").querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    const empty = slot("empty");
    const shelf = shelfCounts(movies);
    empty.hidden = list.length > 0;
    empty.textContent = shelf.dvd + shelf.bd + shelf.uhd === 0
      ? "Hier zählt die physische Sammlung – das Medium kommt aus der Beschreibung in deiner IMDb-Liste „Filmsammlung“. Noch keine Titel mit DVD oder Blu-ray gefunden."
      : goal === "4k" ? `Ab Note ${floor} steht nichts mehr unter 4K im Regal. Respekt.` : `Ab Note ${floor} keine DVD mehr unter deinen Lieblingen. Das Regal ist auf Stand.`;
    const more = $("[data-up-more]");
    more.hidden = shown.length <= LIST_SHORT;
    more.textContent = expanded ? "Weniger zeigen" : `Alle ${n(shown.length)} zeigen`;
    more.setAttribute("aria-expanded", String(expanded));
  }

  /* ------------------------------------------------ Zurückgestellt (Nicht upgraden) */

  let confirmAll = false;
  const day = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }); };
  function renderSkipped() {
    const skipped = items.filter(item => item.state === "skip").map(item => ({ item, movie: byId(item.id) })).filter(x => x.movie)
      .sort((a, b) => String(b.item.at).localeCompare(String(a.item.at)));
    const box = slot("skipped-box");
    box.hidden = !skipped.length;
    if (!skipped.length) { confirmAll = false; return; }
    slot("skip-count").textContent = n(skipped.length);
    slot("skipped").innerHTML = skipped.map(({ item, movie }) => `<li>
        <a class="up-thumb is-small" href="${href(movie)}" tabindex="-1" aria-hidden="true" style="${posterStyle(movie)}">${movie.cover ? `<img src="${e(movie.cover)}" alt="" loading="lazy" decoding="async">` : ""}</a>
        <span class="up-row-title"><a href="${href(movie)}">${e(movie.title)}</a><small>${e([MEDIUM_NAME[mediumRank(movie.medium)] || movie.medium || "", `Note ${movie.yourRating}`, item.at ? `seit ${day(item.at)}` : ""].filter(Boolean).join(" · "))}</small></span>
        <button type="button" class="up-btn is-quiet" data-up-unskip="${e(movie.id)}">Zurücksetzen</button>
      </li>`).join("");
    slot("skipped").querySelectorAll("img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    slot("skip-all").innerHTML = confirmAll
      ? `<span>Wirklich alle ${n(skipped.length)} zurücksetzen? Sie werden dann wieder geprüft.</span>
         <button type="button" class="up-btn is-on" data-up-skip-all="yes">Ja, alle zurücksetzen</button>
         <button type="button" class="up-btn is-quiet" data-up-skip-all="no">Abbrechen</button>`
      : `<button type="button" class="up-btn" data-up-skip-all="ask">Alle zurücksetzen</button>`;
  }

  /* ------------------------------------------------------ Auftragsschein */

  function renderSlip() {
    const wish = items.filter(item => item.state === "wish").map(item => ({ item, movie: byId(item.id) })).filter(x => x.movie);
    const bought = items.filter(item => item.state === "bought").map(item => ({ item, movie: byId(item.id) })).filter(x => x.movie);
    slot("wish-label").textContent = `Gemerkt · ${wish.length}`;
    slot("wish").innerHTML = wish.length ? wish.map(({ item, movie }) => `<li>
        <span><a href="${href(movie)}">${e(movie.title)}</a><small>${MEDIUM_NAME[mediumRank(movie.medium)] || ""} → ${NAMES[item.target]} · Wert ${upgradeScore(movie, item.target)}</small></span>
        <button type="button" class="up-paper-btn" data-up-buy="${e(movie.id)}" data-up-for="${item.target}">Gekauft</button>
        <button type="button" class="up-paper-x" data-up-drop="${e(movie.id)}" aria-label="${e(movie.title)} von der Merkliste nehmen">×</button>
      </li>`).join("") : `<li class="up-paper-empty">Noch leer – „Merken“ legt Titel hierher.</li>`;
    slot("bought-label").textContent = `Gekauft · ${bought.length}`;
    slot("bought-label").hidden = !bought.length;
    slot("bought").innerHTML = bought.map(({ item, movie }) => `<li>
        <span class="up-check" aria-hidden="true">✓</span><span class="up-done">${e(movie.title)}</span><small>${NAMES[item.target]}</small>
        <button type="button" class="up-paper-undo" data-up-undo="${e(movie.id)}">rückgängig</button>
      </li>`).join("");
  }

  /* ---------------------------------------------------------- Gesamtbild */

  function render() {
    const candidates = upgradeCandidates(movies, { target: goal, min: floor, list: items });
    renderHead(candidates);
    renderRows(candidates);
    renderSlip();
    renderSkipped();
    stale = false;
  }

  panel.addEventListener("click", event => {
    const t = event.target.closest("[data-up-target]");
    if (t && t.dataset.upTarget !== goal) {
      goal = t.dataset.upTarget;
      floor = DEFAULT_MIN[goal];
      seg = "all"; expanded = false;
      onView({ upgradeTarget: goal, upgradeMin: floor });
      render();
      return;
    }
    const mn = event.target.closest("[data-up-min]");
    if (mn) { floor = Number(mn.dataset.upMin); expanded = false; onView({ upgradeTarget: goal, upgradeMin: floor }); render(); return; }
    const sg = event.target.closest("[data-up-seg]");
    if (sg) { seg = sg.dataset.upSeg; expanded = false; render(); return; }
    if (event.target.closest("[data-up-more]")) { expanded = !expanded; render(); $("[data-up-more]")?.focus(); return; }
    const wish = event.target.closest("[data-up-wish]");
    if (wish) {
      const id = wish.dataset.upWish;
      const on = items.some(item => item.id === id && item.state === "wish" && item.target === goal);
      items = setUpgradeItem(items, id, on ? {} : { target: goal, state: "wish" });
      save(); render();
      panel.querySelector(`[data-up-wish="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    const buy = event.target.closest("[data-up-buy]");
    if (buy) {
      items = setUpgradeItem(items, buy.dataset.upBuy, { target: buy.dataset.upFor || goal, state: "bought" });
      save(); render();
      return;
    }
    const skip = event.target.closest("[data-up-skip]");
    if (skip) {
      items = setUpgradeItem(items, skip.dataset.upSkip, { target: goal, state: "skip" });
      save(); render();
      return;
    }
    const unskip = event.target.closest("[data-up-unskip]");
    if (unskip) { items = setUpgradeItem(items, unskip.dataset.upUnskip); save(); render(); return; }
    const all = event.target.closest("[data-up-skip-all]");
    if (all) {
      const what = all.dataset.upSkipAll;
      if (what === "ask") confirmAll = true;
      else if (what === "no") confirmAll = false;
      else { items = clearSkips(items); confirmAll = false; save(); }
      render();
      panel.querySelector(what === "ask" ? '[data-up-skip-all="no"]' : '[data-up-skip-all="ask"]')?.focus();
      return;
    }
    const drop = event.target.closest("[data-up-drop]");
    if (drop) { items = setUpgradeItem(items, drop.dataset.upDrop); save(); render(); return; }
    const undo = event.target.closest("[data-up-undo]");
    if (undo) {
      const item = items.find(i => i.id === undo.dataset.upUndo);
      items = setUpgradeItem(items, undo.dataset.upUndo, item ? { target: item.target, state: "wish" } : {});
      save(); render();
    }
  });

  /* Trennlinie: ziehen (überall auf dem Plakat), Pfeiltasten auf dem Griff */
  panel.addEventListener("pointerdown", event => {
    const compare = event.target.closest(".up-compare");
    if (!compare || event.button > 0) return;
    event.preventDefault();
    touched = true;
    const move = ev => { const r = compare.getBoundingClientRect(); setSplit((ev.clientX - r.left) / r.width * 100); };
    move(event);
    compare.setPointerCapture(event.pointerId);
    compare.classList.add("is-dragging");
    const up = () => { compare.classList.remove("is-dragging"); compare.removeEventListener("pointermove", move); compare.removeEventListener("pointerup", up); compare.removeEventListener("pointercancel", up); };
    compare.addEventListener("pointermove", move);
    compare.addEventListener("pointerup", up);
    compare.addEventListener("pointercancel", up);
    compare.querySelector(".up-split").focus({ preventScroll: true });
  });
  panel.addEventListener("keydown", event => {
    if (!event.target.closest(".up-split")) return;
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[event.key];
    if (event.key === "Home") { touched = true; setSplit(0); event.preventDefault(); return; }
    if (event.key === "End") { touched = true; setSplit(100); event.preventDefault(); return; }
    if (step === undefined) return;
    event.preventDefault();
    touched = true;
    setSplit(split + step);
  });

  /* Erster Auftritt: die Trennlinie gleitet einmal über das Plakat */
  let swept = false;
  let touched = false; // sobald man selbst zieht, hört die Vorführung auf
  function sweep() {
    if (swept || reducedMotion() || !$(".up-compare")) return;
    swept = true;
    const t0 = performance.now();
    const tick = now => {
      if (touched) return;
      const t = Math.min(1, (now - t0) / 1600);
      const k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setSplit(t < .5 ? 50 + 40 * (k * 2) : 90 - 40 * ((k - .5) * 2));
      if (t < 1) requestAnimationFrame(tick); else setSplit(50);
    };
    requestAnimationFrame(tick);
  }

  return {
    update(next) {
      movies = next;
      const tidy = tidyUpgradeList(items, movies);
      if (tidy.list.length !== items.length) { items = tidy.list; onList(items, tidy.done); }
      stale = true;
      if (!panel.hidden) render();
    },
    show() { if (stale) render(); sweep(); },
    setList(list) { items = readUpgradeList(list); if (!stale) render(); },
  };
}
