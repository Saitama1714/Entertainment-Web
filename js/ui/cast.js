import { own, has } from "../utils/host.js";
import { $, escapeHtml, reducedMotion } from "../utils/dom.js";
import {
  buildCastGraph, castRanking, castPartners, castMatches, roleLabel, ROLE_LABELS, MIN_CORE_TITLES,
} from "../logic/cast-logic.js";

/*
 * Registerkarte „Besetzung" unter Entertainment: links das Netz der
 * Menschen hinter deinen Titeln (Regie, Darsteller, Drehbuch), rechts die
 * Rangliste „Deine Stammbesetzung" bzw. die Personenkarte.
 *
 * - Form = Rolle: Regie gefüllter Punkt, Darsteller Ring, Drehbuch Raute;
 *   Regie und Drehbuch zugleich: Punkt mit innerem Ring. Größe = Titel.
 * - Linie = gemeinsame Titel (je mehr, desto kräftiger).
 * - Im Netz liegen Personen ab MIN_CORE_TITLES Titeln; die übrigen kommen
 *   beim Hineinzoomen dazu (nur im sichtbaren Ausschnitt) oder über die Suche.
 * - Namen: anfangs nur die größten, mit dem Zoom immer mehr.
 * - Antippen (Punkt, Zeile, „Arbeitet oft mit") öffnet die Personenkarte;
 *   das Netz zeigt dann nur noch die Person und ihre Partner.
 * - Suche (das gemeinsame Suchfeld) hebt Personen hervor: nach Namen oder
 *   weil sie an einem gefundenen Titel mitgewirkt haben.
 *
 * Bedienung wie im Sternbild: Mausrad / zwei Finger zoomen, Ziehen
 * verschiebt, Doppelklick zoomt hinein; Pfeiltasten wählen die nächste
 * Person in der Richtung, + / − zoomen, Esc schließt die Karte.
 * Das Layout rechnet ein Worker (js/workers/cast-worker.js).
 * Rechenlogik: js/logic/cast-logic.js.
 */

const NS = "http://www.w3.org/2000/svg";
const fmt = n => n.toLocaleString("de-DE");
const f1 = n => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const coverOf = movie => (typeof movie?.cover === "string" ? movie.cover.trim() : "");
const ROLE_TABS = [["all", "Alle"], ["dir", "Regie"], ["act", "Darsteller"], ["wri", "Drehbuch"]];
const PERI_ZOOM = 2.4;       // ab diesem Zoom kommen Personen mit nur einem Titel dazu
const PERI_LABEL_ZOOM = 5;   // … und ab hier mit Namen
const PERI_MAX = 700;        // höchstens so viele auf einmal
const TIER_ZOOM = [1.7, 3.2];// Namen der mittleren bzw. kleinen Personen ab diesem Zoom

function el(parent, tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  if (text != null) node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** Nur die Felder, die das Netz braucht (für den Worker). */
const slim = movie => ({
  id: movie.id, title: movie.title, year: movie.year, yourRating: movie.yourRating,
  directors: movie.directors, imdbId: movie.imdbId,
});

/**
 * Baut die Registerkarte in das Panel ein.
 * @param {HTMLElement} panel - #cast-panel mit #cast-stage, #cast-side, #cast-foot, #cast-status.
 * @param {object} [options]
 * @param {"rated"|"all"} [options.mode]
 * @param {(ids: string[], name: string) => void} [options.onShowTitles] - „Im Raster zeigen".
 * @param {() => void} [options.onStartFetch] - Knopf „Besetzung laden".
 */
export function initCast(panel, { mode: startMode = "rated", onShowTitles = null, onStartFetch = null } = {}) {
  const stage = $("#cast-stage", panel);
  const side = $("#cast-side", panel);
  const foot = $("#cast-foot", panel);
  const statusLine = $("#cast-status", panel);
  let mode = startMode === "all" || !has("rating") ? "all" : "rated"; // Website ohne eigene Bewertung: ganze Sammlung
  let movies = [];
  let listSig = "";
  let castData = {};
  let query = "";
  let matchIds = new Set();
  let graph = null;
  let stale = true;
  let gen = 0;
  let role = "all";
  let selected = null;
  let matches = null;
  const shownRoles = { dir: true, act: true, wri: true };
  const nodeEls = new Map();
  const periEls = new Map();

  /* ---------------- Gerüst ---------------- */
  stage.innerHTML = `
    <div class="ca-tools">
      <button type="button" class="cs-tool" data-ca="in" aria-label="Näher heran">+</button>
      <button type="button" class="cs-tool" data-ca="out" aria-label="Weiter weg">−</button>
      <button type="button" class="cs-tool" data-ca="all">Alles</button>
    </div>
    <div class="ca-roles" role="group" aria-label="Personen im Netz">
      ${["dir", "act", "wri"].map(r => `<button type="button" class="timeline-mode-option" data-role-toggle="${r}" aria-pressed="true">${ROLE_LABELS[r]}</button>`).join("")}
    </div>
    <div class="ca-legend" aria-hidden="true">
      <span><i class="ca-key is-dir"></i>Regie</span>
      <span><i class="ca-key is-act"></i>Darsteller</span>
      <span><i class="ca-key is-wri"></i>Drehbuch</span>
      <span><i class="ca-key is-line"></i>gemeinsame Titel</span>
    </div>
    <p class="cs-empty ca-empty" hidden></p>`;
  const svg = el(stage, "svg", {
    class: "ca-map", role: "application", tabindex: 0,
    "aria-label": "Netz der Besetzung. Pfeiltasten wählen eine Person, Plus und Minus zoomen, Escape schließt die Personenkarte. Die Rangliste daneben enthält dieselben Personen.",
  });
  stage.insertBefore(svg, stage.firstChild);
  const L = {};
  for (const name of ["edges", "hot", "peri", "nodes"]) L[name] = el(svg, "g", { class: `ca-${name}` });
  const emptyNote = $(".ca-empty", stage);
  const tip = document.createElement("div");
  tip.className = "cs-tip";
  tip.setAttribute("role", "status");
  document.body.appendChild(tip);
  const showTip = (event, html) => {
    tip.innerHTML = html;
    tip.classList.add("is-visible");
    const x = Math.min(event.clientX + 14, innerWidth - tip.offsetWidth - 8), y = event.clientY + 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y + tip.offsetHeight > innerHeight ? event.clientY - tip.offsetHeight - 12 : y}px`;
  };
  const hideTip = () => tip.classList.remove("is-visible");

  /* ---------------- Rechnen (Worker) ---------------- */
  let worker = null;
  try {
    worker = new Worker(new URL("../workers/cast-worker.js", import.meta.url), { type: "module" });
  } catch {
    worker = null;
  }
  const byId = () => new Map(movies.map(movie => [movie.id, movie]));
  function attach(raw) {
    const lookup = byId();
    for (const item of raw.items) item.movie = lookup.get(item.id) || null;
    raw.core = raw.core.map(i => (typeof i === "number" ? raw.persons[i] : i));
    return raw;
  }
  let busyTimer = 0;
  let refreshPending = false;
  foot.addEventListener("click", event => { if (event.target.closest("[data-refresh]")) rebuild(); });
  function rebuild() {
    stale = false;
    refreshPending = false;
    const my = ++gen;
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { if (my === gen) showEmpty("Netz wird gezeichnet …"); }, 300);
    const done = raw => {
      if (my !== gen) return;
      clearTimeout(busyTimer);
      graph = attach(raw);
      draw();
    };
    if (worker) {
      worker.onmessage = ({ data }) => { if (data.gen === gen && data.graph) done(data.graph); };
      worker.onerror = () => { worker = null; rebuild(); };
      worker.postMessage({ gen: my, movies: movies.map(slim), castData, mode });
    } else {
      setTimeout(() => {
        if (my !== gen) return;
        const raw = buildCastGraph(movies, castData, { mode });
        done({ ...raw, core: raw.core.map(person => person.i) });
      }, 0);
    }
  }

  /* ---------------- Kamera ---------------- */
  const cam = { x: 0, y: 0, w: 1, h: 1, raf: 0 };
  let aspect = 0.6, pxWidth = 1, homeW = 1;
  const unit = () => cam.w / pxWidth;
  const minW = () => homeW / 16;
  const maxW = () => homeW * 1.3;
  const zoom = () => homeW / cam.w;
  function measure() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pxWidth = rect.width;
    aspect = rect.height / rect.width;
    return true;
  }
  function apply() {
    cam.h = cam.w * aspect;
    svg.setAttribute("viewBox", `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
    svg.style.setProperty("--u", unit());
    levels();
  }
  function setCam(x, y, w) {
    cancelAnimationFrame(cam.raf);
    w = clamp(w, minW(), maxW());
    Object.assign(cam, { x, y, w });
    apply();
  }
  const centre = () => [cam.x + cam.w / 2, cam.y + cam.h / 2];
  function fly(cx, cy, w, ms = 800) {
    cancelAnimationFrame(cam.raf);
    w = clamp(w, minW(), maxW());
    if (reducedMotion()) { setCam(cx - w / 2, cy - w * aspect / 2, w); return; }
    const [sx, sy] = centre(), sw = cam.w, t0 = performance.now();
    const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = ease(p);
      const ww = Math.exp(Math.log(sw) + (Math.log(w) - Math.log(sw)) * e);
      const x = sx + (cx - sx) * e, y = sy + (cy - sy) * e;
      Object.assign(cam, { w: ww, x: x - ww / 2, y: y - ww * aspect / 2 });
      apply();
      if (p < 1) cam.raf = requestAnimationFrame(step);
    };
    cam.raf = requestAnimationFrame(step);
  }
  function home(ms = 0) {
    if (!graph) return;
    const b = graph.bounds;
    homeW = Math.max(b.x1 - b.x0, (b.y1 - b.y0) / aspect) * 1.06;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (ms) fly(cx, cy, homeW, ms); else setCam(cx - homeW / 2, cy - homeW * aspect / 2, homeW);
  }
  function zoomAt(px, py, factor, ms) {
    const w = clamp(cam.w / factor, minW(), maxW());
    const nx = px - (px - cam.x) * (w / cam.w), ny = py - (py - cam.y) * (w / cam.w);
    if (ms) fly(nx + w / 2, ny + w * aspect / 2, w, ms); else setCam(nx, ny, w);
  }
  const toWorld = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    return [cam.x + (clientX - rect.left) / rect.width * cam.w, cam.y + (clientY - rect.top) / rect.height * cam.h];
  };

  /* ---------------- Zoomstufen ---------------- */
  let periQueued = false;
  function levels() {
    if (!graph) return;
    const z = zoom();
    svg.classList.toggle("t1", z >= TIER_ZOOM[0]);
    svg.classList.toggle("t2", z >= TIER_ZOOM[1]);
    svg.classList.toggle("peri-labels", z >= PERI_LABEL_ZOOM);
    svg.style.setProperty("--ns", Math.min(1, 1 / Math.sqrt(z)).toFixed(3));
    if (!periQueued) { periQueued = true; requestAnimationFrame(() => { periQueued = false; drawPeripheral(); }); }
  }

  /* ---------------- Zeichnen ---------------- */
  function showEmpty(text) {
    emptyNote.textContent = text;
    emptyNote.hidden = !text;
  }
  // Punkte wachsen beim Zoomen langsamer als die Karte (Wurzel), damit sie
  // beim Hineinzoomen nicht den Bildschirm füllen: --ns auf dem SVG
  function drawPerson(layer, person) {
    const g = el(layer, "g", {
      class: `ca-node is-${person.primary}${person.both ? " is-both" : ""} tier${person.tier}`,
      "data-person": person.i, transform: `translate(${person.x} ${person.y})`, style: `--r:${person.r.toFixed(2)}`,
    });
    const r = person.r;
    const glyph = el(g, "g", { class: "ca-glyph" });
    if (person.primary === "wri") {
      const s = r * 1.5;
      el(glyph, "rect", { class: "ca-shape", x: -s / 2, y: -s / 2, width: s, height: s, rx: s * 0.12, transform: "rotate(45)" });
    } else {
      el(glyph, "circle", { class: "ca-shape", r });
      if (person.both) el(glyph, "circle", { class: "ca-inner", r: r * 0.55 });
    }
    el(glyph, "circle", { class: "ca-hit", r: r + 3 });
    el(g, "text", { class: "ca-label", dy: "1.15em" }, person.name);
    return g;
  }

  function draw() {
    for (const layer of Object.values(L)) layer.replaceChildren();
    nodeEls.clear();
    periEls.clear();
    selected = selected !== null && graph.persons.find(p => p.key === selected.key) ? graph.persons.find(p => p.key === selected.key) : null;
    const hasCore = graph.core.length > 0;
    svg.style.visibility = hasCore ? "" : "hidden";
    if (!graph.items.length) {
      showEmpty(mode === "rated" && movies.length
        ? "Keine bewerteten Titel für diese Auswahl. „Ganze Sammlung“ zeigt alle."
        : "Keine Titel für diese Auswahl.");
    } else if (!hasCore) {
      showEmpty(`Noch keine Verbindungen: Im Netz stehen Personen mit mindestens ${MIN_CORE_TITLES} Titeln. Mit Darstellern und Drehbuch (Einstellungen → Entertainment) füllt es sich.`);
    } else showEmpty("");

    const maxW = Math.max(1, ...graph.edges.map(edge => edge.w));
    const many = graph.edges.length > 1500;
    for (const edge of graph.edges) {
      if (many && edge.w < 2) continue; // bei sehr vielen Linien nur die kräftigen
      const A = graph.persons[edge.a], B = graph.persons[edge.b];
      el(L.edges, "line", {
        x1: A.x, y1: A.y, x2: B.x, y2: B.y, "data-a": edge.a, "data-b": edge.b,
        "stroke-opacity": (0.14 + 0.5 * edge.w / maxW).toFixed(2),
        style: `--w:${(0.6 + 3 * edge.w / maxW).toFixed(2)}`,
      });
    }
    // Kleine zuerst, große obenauf
    for (const person of [...graph.core].reverse()) nodeEls.set(person.i, drawPerson(L.nodes, person));

    applyRoles();
    matches = castMatches(graph, query, matchIds);
    if (selected) select(selected, { fly: false }); else { renderSide(); markSelection(); }
    measure();
    home();
    footer();
  }

  function footer() {
    if (!graph) return;
    if (refreshPending) {
      foot.innerHTML = `Neue Besetzung geladen. <button type="button" class="small-button" data-refresh>Netz aktualisieren</button>`;
      return;
    }
    const shown = graph.core.length;
    const parts = [`${fmt(shown)} ${shown === 1 ? "Person" : "Personen"} mit mindestens ${MIN_CORE_TITLES} Titeln`, `${fmt(graph.items.length)} Titel`];
    const hint = selected ? "Esc schließt die Personenkarte" : "hineinzoomen zeigt alle · Punkt antippen öffnet die Personenkarte";
    foot.textContent = `${parts.join(" · ")} · ${hint}`;
  }

  /** Personen mit nur einem Titel: erst ab PERI_ZOOM, nur im Ausschnitt - dazu immer Partner und Treffer. */
  function drawPeripheral() {
    if (!graph) return;
    const want = new Set();
    const z = zoom();
    if (z >= PERI_ZOOM) {
      const mx = cam.w * 0.1, my = cam.h * 0.1;
      for (const person of graph.persons) {
        if (person.core || person.x === null || want.size >= PERI_MAX) continue;
        if (person.x < cam.x - mx || person.x > cam.x + cam.w + mx || person.y < cam.y - my || person.y > cam.y + cam.h + my) continue;
        want.add(person.i);
      }
    }
    if (selected) for (const { i } of castPartners(graph, selected.i, 200)) if (!graph.persons[i].core && graph.persons[i].x !== null) want.add(i);
    if (selected && !selected.core && selected.x !== null) want.add(selected.i);
    if (matches) for (const i of matches) if (!graph.persons[i].core && graph.persons[i].x !== null && want.size < PERI_MAX * 1.5) want.add(i);
    for (const [i, g] of periEls) if (!want.has(i)) { g.remove(); periEls.delete(i); }
    for (const i of want) {
      if (periEls.has(i)) continue;
      const g = drawPerson(L.peri, graph.persons[i]);
      g.classList.add("is-peri");
      periEls.set(i, g);
    }
    markSelection();
    applyRoles();
  }

  /** Rollen-Schalter: Person sichtbar, wenn eine ihrer Rollen eingeschaltet ist. */
  function applyRoles() {
    if (!graph) return;
    const visible = person => ["dir", "act", "wri"].some(r => shownRoles[r] && person.roles[r] > 0);
    for (const [i, g] of [...nodeEls, ...periEls]) g.classList.toggle("is-off", !visible(graph.persons[i]));
    for (const line of L.edges.children) {
      const off = !visible(graph.persons[Number(line.dataset.a)]) || !visible(graph.persons[Number(line.dataset.b)]);
      line.classList.toggle("is-off", off);
    }
  }

  /** Hervorhebung: gewählte Person + Partner, sonst Treffer der Suche. */
  function markSelection() {
    if (!graph) return;
    const near = new Set();
    if (selected) {
      near.add(selected.i);
      for (const { i } of castPartners(graph, selected.i, 500)) near.add(i);
    }
    svg.classList.toggle("has-sel", Boolean(selected));
    svg.classList.toggle("has-match", !selected && Boolean(matches));
    for (const [i, g] of [...nodeEls, ...periEls]) {
      g.classList.toggle("is-sel", selected?.i === i);
      g.classList.toggle("is-near", near.has(i));
      g.classList.toggle("is-match", Boolean(matches?.has(i)));
    }
    L.hot.replaceChildren();
    if (!selected || selected.x === null) return;
    for (const { i, w } of castPartners(graph, selected.i, 500)) {
      const other = graph.persons[i];
      if (other.x === null) continue;
      el(L.hot, "line", { x1: selected.x, y1: selected.y, x2: other.x, y2: other.y, style: `--w:${Math.min(4, 1 + w * 0.6)}` });
    }
  }

  /* ---------------- Rangliste und Personenkarte ---------------- */
  function rankingHtml() {
    const list = matches
      ? castRanking([...matches].map(i => graph.persons[i]), role, 60)
      : castRanking(graph.persons, role, 60);
    const top = Math.max(1, ...list.map(p => (role === "all" ? p.n : p.roles[role])));
    const head = matches
      ? `<p class="cs-kicker">Suche</p><h2 class="ca-title">Treffer für „${escapeHtml(query.trim())}“</h2>`
      : `<p class="cs-kicker">Am häufigsten in ${own("deiner", "der")} Sammlung</p><h2 class="ca-title">${own("Deine", "Meine")} Stammbesetzung</h2>`;
    return `
      <div class="ca-head">${head}</div>
      <div class="ca-seg" role="radiogroup" aria-label="Rolle in der Rangliste">
        ${ROLE_TABS.map(([key, label]) => `<button type="button" class="timeline-mode-option" role="radio" data-role="${key}" aria-checked="${role === key}" tabindex="${role === key ? 0 : -1}">${label}</button>`).join("")}
      </div>
      ${list.length ? `
      <div class="ca-cols" aria-hidden="true"><span></span><span>Person</span><span></span><span>Titel</span><span>Ø</span></div>
      <ol class="ca-rank">
        ${list.map((p, k) => {
          const n = role === "all" ? p.n : p.roles[role];
          return `<li><button type="button" class="ca-row" data-person="${p.i}" aria-label="${escapeHtml(`${p.name}, ${roleLabel(p.roles)}, ${n} Titel${p.avg !== null ? `, Durchschnitt ${f1(p.avg)}` : ""}`)}">
            <span class="ca-rank-no">${String(k + 1).padStart(2, "0")}</span>
            <span class="ca-who"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(roleLabel(p.roles))}</small></span>
            <span class="ca-bar"><i style="width:${Math.round(n / top * 100)}%"></i></span>
            <span class="ca-num">${fmt(n)}</span>
            <span class="ca-avg">${p.avg !== null ? f1(p.avg) : "–"}</span>
          </button></li>`;
        }).join("")}
      </ol>` : `<p class="cs-meta">${matches ? "Niemand gefunden." : "Noch keine Personen in dieser Auswahl."}</p>`}
      <p class="ca-note">Zeile oder Punkt antippen öffnet die Personenkarte.</p>`;
  }

  const coverHtml = item => {
    const src = coverOf(item.movie);
    return src
      ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">`
      : `<span class="cs-cover-fallback">${escapeHtml(item.title)}</span>`;
  };

  function cardHtml(person) {
    const max = Math.max(1, ...person.dist);
    const partners = castPartners(graph, person.i, 6);
    const tiles = person.titles.slice(0, 8).map(k => graph.items[k]);
    const more = person.titles.length - tiles.length;
    return `
      <div class="cs-card-top"><div><p class="cs-kicker">${escapeHtml(roleLabel(person.roles))}</p><h3 class="ca-name">${escapeHtml(person.name)}</h3></div>
        <button type="button" class="cs-close" data-close aria-label="Personenkarte schließen">×</button></div>
      <p class="cs-meta"><b>${fmt(person.n)}</b> ${person.n === 1 ? "Titel" : "Titel"}${person.avg !== null ? ` · Ø <b>${f1(person.avg)}</b>` : ""} · ${fmt(person.rated)} bewertet</p>
      ${person.rated ? `<div><p class="cs-kicker">${own("Deine", "Meine")} Bewertung</p>
        <div class="cs-hist">${person.dist.map((v, k) => `<i class="${k >= 8 ? "is-top" : ""}" style="height:${v / max * 100}%" title="${k + 1}: ${v}"></i>`).join("")}</div>
        <div class="cs-histx">${person.dist.map((_, k) => `<span>${k + 1}</span>`).join("")}</div></div>` : ""}
      <div><p class="cs-kicker">Titel · beste zuerst</p>
        <div class="cs-covers">${tiles.map(item => `<a class="ca-cover" href="movie.html?id=${encodeURIComponent(item.id)}" aria-label="${escapeHtml(`${item.title}${item.year ? ` (${item.year})` : ""}${item.rating !== null ? `, ${own("deine", "meine")} Bewertung ${item.rating}` : ""}`)}">${coverHtml(item)}${item.rating !== null ? `<em class="${item.rating >= 9 ? "is-top" : ""}">${item.rating}</em>` : ""}</a>`).join("")}</div>
        ${more > 0 ? `<p class="ca-note">und ${fmt(more)} weitere</p>` : ""}</div>
      ${partners.length ? `<div><p class="cs-kicker">Arbeitet oft mit</p><div class="cs-chips">${partners.map(x => `<button type="button" data-person="${x.i}">${escapeHtml(graph.persons[x.i].name)} <span>${fmt(x.w)}</span></button>`).join("")}</div></div>` : ""}
      ${onShowTitles ? `<button type="button" class="button secondary ca-show" data-show>${fmt(person.n)} ${person.n === 1 ? "Titel" : "Titel"} im Raster zeigen</button>` : ""}`;
  }

  function renderSide() {
    if (!graph) { side.innerHTML = ""; return; }
    side.classList.toggle("is-card", Boolean(selected));
    side.innerHTML = selected ? cardHtml(selected) : rankingHtml();
    // Cover, die nicht laden: Titel statt kaputtem Bild
    side.querySelectorAll("img").forEach(img => img.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "cs-cover-fallback";
      span.textContent = img.closest("[aria-label]")?.getAttribute("aria-label") || "";
      img.replaceWith(span);
    }, { once: true }));
  }

  function select(person, { fly: flyTo = true } = {}) {
    hideTip();
    selected = person;
    renderSide();
    drawPeripheral();
    markSelection();
    footer();
    if (!flyTo || person.x === null) return;
    const pts = [person, ...castPartners(graph, person.i, 12).map(x => graph.persons[x.i])].filter(p => p.x !== null);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = clamp(Math.max(x1 - x0, (y1 - y0) / aspect) * 1.5 + person.r * 8, homeW / 9, homeW / 1.4);
    fly((x0 + x1) / 2, (y0 + y1) / 2, w);
  }
  function closeCard() {
    if (!selected) return;
    selected = null;
    renderSide();
    drawPeripheral();
    markSelection();
    footer();
  }

  side.addEventListener("click", event => {
    const target = event.target.closest("button");
    if (!target || !graph) return;
    if (target.dataset.close !== undefined) { closeCard(); svg.focus(); return; }
    if (target.dataset.role) { role = target.dataset.role; renderSide(); side.querySelector(`[data-role="${role}"]`)?.focus(); return; }
    if (target.dataset.person !== undefined) { select(graph.persons[Number(target.dataset.person)]); side.querySelector("[data-close]")?.focus(); return; }
    if (target.dataset.show !== undefined && selected && onShowTitles) {
      onShowTitles(selected.titles.map(k => graph.items[k].id), selected.name);
    }
  });
  side.addEventListener("keydown", event => {
    const seg = event.target.closest("[data-role]");
    const step = seg && { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = ROLE_TABS.findIndex(([key]) => key === role);
    role = ROLE_TABS[(index + step + ROLE_TABS.length) % ROLE_TABS.length][0];
    renderSide();
    side.querySelector(`[data-role="${role}"]`)?.focus();
  });

  /* ---------------- Bedienung der Karte ---------------- */
  const personAt = target => {
    const node = target.closest?.("[data-person]");
    return node && svg.contains(node) && graph ? graph.persons[Number(node.dataset.person)] : null;
  };
  let moved = false;
  svg.addEventListener("click", event => {
    if (moved || !graph) return;
    const person = personAt(event.target);
    if (person) select(person, { fly: false });
  });
  svg.addEventListener("pointermove", event => {
    if (dragging || !graph) return;
    const person = personAt(event.target);
    if (!person) { hideTip(); return; }
    showTip(event, `<b>${escapeHtml(person.name)}</b><br>${escapeHtml(roleLabel(person.roles))} · ${fmt(person.n)} Titel${person.avg !== null ? ` · Ø ${f1(person.avg)}` : ""}`);
  });
  svg.addEventListener("pointerleave", hideTip);

  const DIRECTIONS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  const keyboardPool = () => graph.core.filter(p => !nodeEls.get(p.i)?.classList.contains("is-off"));
  function neighbour(from, [dx, dy]) {
    let best = null, bestScore = Infinity;
    for (const p of keyboardPool()) {
      if (p === from) continue;
      const vx = p.x - from.x, vy = p.y - from.y, along = vx * dx + vy * dy;
      if (along <= 0.1) continue;
      const across = Math.abs(vx * dy - vy * dx);
      if (across > along * 1.2) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  function keepInView(person) {
    const inside = person.x > cam.x + cam.w * 0.15 && person.x < cam.x + cam.w * 0.85 && person.y > cam.y + cam.h * 0.15 && person.y < cam.y + cam.h * 0.85;
    const w = Math.min(cam.w, homeW / 2.5);
    if (!inside || w !== cam.w) fly(person.x, person.y, w, 450);
  }
  svg.addEventListener("keydown", event => {
    if (!graph || !graph.core.length) return;
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomAt(...centre(), 1.6, 300); return; }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomAt(...centre(), 1 / 1.6, 300); return; }
    const dir = DIRECTIONS[event.key];
    if (!dir) return;
    event.preventDefault();
    const [cx, cy] = centre();
    const pool = keyboardPool();
    if (!pool.length) return;
    const next = selected && selected.x !== null ? neighbour(selected, dir)
      : pool.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) ? b : a));
    if (!next) return;
    select(next, { fly: false });
    keepInView(next);
  });

  svg.addEventListener("wheel", event => {
    event.preventDefault();
    hideTip();
    const [x, y] = toWorld(event.clientX, event.clientY);
    zoomAt(x, y, Math.exp(-event.deltaY * 0.0016));
  }, { passive: false });
  svg.addEventListener("dblclick", event => { const [x, y] = toWorld(event.clientX, event.clientY); zoomAt(x, y, 2.4, 500); });

  const pointers = new Map();
  let last = null, start = null, dragging = false;
  svg.addEventListener("pointerdown", event => {
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    last = null; moved = false; start = [event.clientX, event.clientY];
  });
  svg.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (!dragging && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) {
      dragging = moved = true;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add("is-dragging");
      hideTip();
    }
    if (!dragging) return;
    const rect = svg.getBoundingClientRect(), points = [...pointers.values()];
    const c = points.reduce((acc, p) => [acc[0] + p[0] / points.length, acc[1] + p[1] / points.length], [0, 0]);
    const d = points.length > 1 ? Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]) : 0;
    if (last && last.n === points.length) {
      setCam(cam.x - (c[0] - last.c[0]) / rect.width * cam.w, cam.y - (c[1] - last.c[1]) / rect.height * cam.h, cam.w);
      if (points.length > 1 && last.d) { const [x, y] = toWorld(c[0], c[1]); zoomAt(x, y, d / last.d); }
    }
    last = { c, d, n: points.length };
  });
  const release = event => {
    pointers.delete(event.pointerId);
    last = null;
    if (!pointers.size) {
      dragging = false;
      svg.classList.remove("is-dragging");
      setTimeout(() => { moved = false; }, 0);
    }
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  stage.querySelector('[data-ca="in"]').addEventListener("click", () => zoomAt(...centre(), 2, 450));
  stage.querySelector('[data-ca="out"]').addEventListener("click", () => zoomAt(...centre(), 0.5, 450));
  stage.querySelector('[data-ca="all"]').addEventListener("click", () => { closeCard(); home(700); });
  stage.querySelectorAll("[data-role-toggle]").forEach(button => button.addEventListener("click", () => {
    const r = button.dataset.roleToggle;
    const on = !shownRoles[r];
    if (!on && Object.values(shownRoles).filter(Boolean).length === 1) return; // mindestens eine Rolle bleibt
    shownRoles[r] = on;
    button.setAttribute("aria-pressed", String(on));
    applyRoles();
  }));
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape" && selected) { event.stopPropagation(); closeCard(); svg.focus(); }
  });
  new ResizeObserver(() => {
    if (panel.hidden || !graph) return;
    const [cx, cy] = centre(), w = cam.w;
    if (!measure()) return;
    const b = graph.bounds;
    homeW = Math.max(b.x1 - b.x0, (b.y1 - b.y0) / aspect) * 1.06;
    setCam(cx - w / 2, cy - w * aspect / 2, w);
  }).observe(stage);

  /* ---------------- Status des Abrufs ---------------- */
  statusLine.addEventListener("click", event => {
    if (event.target.closest("[data-start-fetch]") && onStartFetch) onStartFetch();
  });

  const visible = () => !panel.hidden;
  return {
    /**
     * Neue Titelliste (gefiltert, ohne Suche) und die Suche.
     * @param {Array} list
     * @param {string} [searchText]
     * @param {Set<string>} [foundIds] - Titel, die die Suche gefunden hat.
     */
    update(list, searchText = "", foundIds = new Set()) {
      // Gleiche Titel (und Bewertungen) wie zuletzt? Dann hat sich nur die Suche geändert.
      const sig = list.map(movie => `${movie.id}:${movie.yourRating}:${movie.directors}`).join("|");
      const sameMovies = sig === listSig;
      listSig = sig;
      movies = list;
      query = searchText;
      matchIds = foundIds;
      if (sameMovies && graph && !stale) {
        // Nur die Suche hat sich geändert: kein neues Layout
        matches = castMatches(graph, query, matchIds);
        renderSide();
        drawPeripheral();
        return;
      }
      if (!visible()) { stale = true; return; }
      rebuild();
    },
    /** Neue Besetzung (nach einem Abruf); gezeichnet wird, wenn sichtbar. */
    setCastData(data) {
      castData = data || {};
      if (!visible()) { stale = true; return; }
      // Während du schaust, springt das Netz nicht um: Knopf zum Aktualisieren
      if (graph && graph.items.length) { refreshPending = true; footer(); return; }
      rebuild();
    },
    setMode(next) {
      mode = next === "all" || !has("rating") ? "all" : "rated";
      if (visible()) rebuild(); else stale = true;
    },
    /** Nach dem Einblenden der Registerkarte aufrufen. */
    show() {
      if (!measure()) return;
      if (stale || !graph) rebuild(); else apply();
    },
    /**
     * Zeile unter dem Netz zum Abruf der Besetzung.
     * @param {string} text
     * @param {{action?: string, progress?: number}} [options] - action: Knopf „Besetzung laden".
     */
    setStatus(text, { action = "", progress = null } = {}) {
      statusLine.innerHTML = `${progress !== null ? `<span class="ca-meter" aria-hidden="true"><i style="width:${Math.round(progress * 100)}%"></i></span>` : ""}<span>${escapeHtml(text)}</span>${action ? ` <button type="button" class="small-button" data-start-fetch>${escapeHtml(action)}</button>` : ""}`;
    },
  };
}
