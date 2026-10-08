import { $, escapeHtml, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { formatDay } from "../utils/format.js";
import {
  DEFAULT_TIMELINE_MODE, timelineEntries, timelineDomain, axisTicks, stackMarks,
  formatGap, movieSpan, releaseInfo, ratedTime, nearestIndex,
} from "../logic/timeline-logic.js";

/*
 * Registerkarte „Zeitleiste" unter Entertainment: oben Cover Flow (ein Titel
 * groß in der Mitte, die Nachbarn schräg daneben, gespiegelt auf dem
 * „Kinoboden"), darunter die Zeitleiste mit einem Strich je Titel. Beide
 * zeigen dieselbe Liste - die gesuchten und gefilterten Titel der Seite -,
 * sortiert nach dem Zeitpunkt der gewählten Ansicht (Bewertet / Erschienen).
 *
 * Bedienung: ←/→ (oder Mausrad, Ziehen, Klick auf ein seitliches Cover)
 * blättert; Klick auf das mittlere Cover oder Enter zeigt den Abstand
 * zwischen Erscheinen und Bewertung als Balken auf der Achse. Ein Strich der
 * Zeitleiste zeigt beim Überfahren sein Cover und springt beim Klick dorthin.
 *
 * Für 500+ Titel werden nur die Cover nahe der Mitte als Elemente angelegt
 * (so viele, wie nebeneinander passen: windowFor()); die Achse ist ein SVG, das nach jeder Änderung neu entsteht.
 * Rechenlogik: js/logic/timeline-logic.js.
 *
 * Gemeinsam mit der Website Entertainment-Web (gemeinsam.txt): keine
 * Chrome-APIs, keine Dashboard-Einstellungen. Was je Projekt anders ist
 * (Detailseite, „Deine"/„Meine Bewertung", ob es Bewertungsdaten gibt),
 * kommt über die Optionen von initTimeline().
 */

/*
 * Wie viele Cover je Seite sichtbar sind, hängt von der Breite ab: Lage wie in
 * .coverflow-item (app.css) - Mitte des n-ten Covers bei (0,95 + (n−1)·0,32)·Breite,
 * durch die Perspektive (800 px, 160 px nach hinten) auf 5/6 verkleinert; der
 * gedrehte Rand ragt noch etwa 0,3 Breiten weiter. Ein Cover mehr als sichtbar
 * wird als Element angelegt - unsichtbar, damit es beim Blättern einblendet.
 */
const MIN_SIDE = 3;
const MAX_SIDE = 20;
function windowFor(flowWidth, coverWidth) {
  if (!flowWidth || !coverWidth) return 8;
  const half = flowWidth / 2 - 0.3 * coverWidth;
  const side = Math.floor((half / (5 / 6) - 0.95 * coverWidth) / (0.32 * coverWidth)) + 1;
  return Math.max(MIN_SIDE, Math.min(MAX_SIDE, side)) + 1;
}
const STACK_GAP = 5;       // px: dichter liegende Striche werden gestapelt
const MARK_LENGTH = 7;     // px: Länge eines Strichs
const LEVEL_STEP = 8;      // px: Abstand der Stapel-Stufen
const MAX_LEVEL = 9;       // darüber hinaus liegen Striche übereinander
const TWEEN_MS = 450;      // Zoom der Achse (wie Kachel-Zoom-Standard)

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Baut die Zeitleiste in das Panel ein.
 * @param {HTMLElement} panel - #timeline-panel (Dashboard: views/movies.html, Website: index.html).
 * @param {object} [options]
 * @param {string} [options.detailHref] - Detailseite, relativ zur Seite.
 * @param {string[]} [options.modes] - verfügbare Ansichten ("release", "rated");
 *   fehlen Bewertungsdaten, nur ["release"]. Bei nur einer entfällt der Umschalter.
 * @param {string} [options.mode] - Ansicht beim Start (sonst "rated", falls verfügbar).
 * @param {string} [options.ratingLabel] - Beschriftung der eigenen Bewertung.
 * @param {(mode: string) => void} [options.onModeChange] - z. B. zum Merken der Ansicht.
 * @returns {{update: (movies: Array) => void, show: () => void, mode: () => string}}
 */
export function initTimeline(panel, {
  detailHref = "movie.html",
  modes = ["release", "rated"],
  mode: startMode = DEFAULT_TIMELINE_MODE,
  ratingLabel = "Deine Bewertung",
  onModeChange = () => {},
} = {}) {
  const flow = $("#coverflow", panel);
  const info = $("#timeline-info", panel);
  const axis = $("#timeline-axis", panel);
  const svg = $("svg", axis);
  const peek = $("#timeline-peek", panel);
  const count = $("#timeline-count", panel);
  const missingNote = $("#timeline-missing", panel);
  // Ohne Bewertungsdaten (Website, wenn die eigene Bewertung nicht
  // veröffentlicht ist) gibt es weder Bewertungsdatum noch Abstand
  const hasRatings = modes.includes("rated");
  if (!hasRatings) {
    const help = $("#timeline-help", panel);
    if (help) help.textContent = "← → blättern · Strich anklicken springt dorthin";
  }
  // Umschalter steht in der Filterzeile über den Panels (views/movies.html)
  const modeGroup = $(".timeline-mode");
  const modeButtons = [...modeGroup.querySelectorAll("[data-timeline-mode]")]
    .filter(button => {
      const available = modes.includes(button.dataset.timelineMode);
      button.hidden = !available;
      return available;
    });
  // Nur eine Ansicht (z. B. Website ohne Bewertungsdaten): kein Umschalter
  modeGroup.classList.toggle("is-single", modeButtons.length < 2);

  let movies = [];
  let mode = modes.includes(startMode) ? startMode : modes.includes(DEFAULT_TIMELINE_MODE) ? DEFAULT_TIMELINE_MODE : modes[0];
  let entries = [];
  let missing = 0;
  let current = -1;
  let selectedId = null;
  let domain = null;         // gerade gezeichneter Ausschnitt [start, ende]
  let tween = 0;
  let marks = [];            // gezeichnete Striche: {x, id, index} - für Hover/Klick
  let hoverIndex = -1;
  const items = new Map();
  let WINDOW = 8; // Cover je Seite als Element (das äußerste unsichtbar), siehe windowFor()
  const measureWindow = () => {
    const coverWidth = parseFloat(getComputedStyle(flow).getPropertyValue("--cf-w")) || 160;
    const next = windowFor(flow.clientWidth, coverWidth);
    const changed = next !== WINDOW;
    WINDOW = next;
    return changed;
  };   // Film-ID → Cover-Element im Fenster

  const currentEntry = () => entries[current] || null;
  const selectedMovie = () => entries.find(entry => entry.movie.id === selectedId)?.movie || null;

  /* ---------------- Cover Flow ---------------- */

  /*
   * Ein Cover besteht aus Vorderseite und Spiegelung. Die Spiegelung ist ein
   * eigenes Element (gespiegelte Kopie, nach unten ausgeblendet) und bewegt
   * sich mit dem Cover mit - -webkit-box-reflect verschwand während der
   * 3D-Übergänge kurz und tauchte danach wieder auf.
   */
  function coverHtml(movie) {
    const face = faceHtml(movie);
    return `<div class="coverflow-face">${face}</div><div class="coverflow-reflection" aria-hidden="true">${face}</div>`;
  }

  function faceHtml(movie) {
    return movie.cover
      ? `<img class="coverflow-image" src="${escapeHtml(movie.cover)}" alt="" draggable="false" decoding="async">`
      : `<span class="coverflow-fallback"><span class="cover-placeholder">${icon("image")}</span><span class="coverflow-fallback-title">${escapeHtml(movie.title)}</span></span>`;
  }

  /** Setzt Lage und Drehung eines Covers über CSS-Variablen (Formeln in app.css). */
  function place(element, offset) {
    const distance = Math.min(Math.abs(offset), WINDOW);
    element.style.setProperty("--side", String(Math.sign(offset)));
    element.style.setProperty("--distance", String(distance));
    element.style.zIndex = String(100 - distance);
    element.classList.toggle("is-center", offset === 0);
    element.classList.toggle("is-hidden", Math.abs(offset) >= WINDOW);
  }

  function renderFlow() {
    if (!entries.length) {
      items.forEach(element => element.remove());
      items.clear();
      flow.classList.add("is-empty");
      flow.querySelector(".coverflow-empty")?.remove();
      flow.insertAdjacentHTML("beforeend", `<div class="coverflow-empty">${emptyState(emptyText())}</div>`);
      return;
    }
    flow.classList.remove("is-empty");
    flow.querySelector(".coverflow-empty")?.remove();

    const wanted = new Map();
    for (let offset = -WINDOW; offset <= WINDOW; offset++) {
      const entry = entries[current + offset];
      if (entry) wanted.set(entry.movie.id, { entry, offset });
    }
    for (const [id, element] of items) {
      if (!wanted.has(id)) { element.remove(); items.delete(id); }
    }
    const fresh = [];
    for (const [id, { entry, offset }] of wanted) {
      let element = items.get(id);
      if (!element) {
        element = document.createElement("div");
        element.className = "coverflow-item";
        element.dataset.id = id;
        element.innerHTML = coverHtml(entry.movie);
        // Neue Cover kommen vom Rand herein (unsichtbar an der äußersten Stelle)
        place(element, offset < 0 ? -WINDOW : WINDOW);
        flow.append(element);
        items.set(id, element);
        fresh.push([element, offset]);
      } else {
        place(element, offset);
      }
      element.classList.toggle("is-selected", id === selectedId);
    }
    if (fresh.length) {
      flow.getBoundingClientRect(); // Startlage übernehmen, damit der Übergang läuft
      for (const [element, offset] of fresh) place(element, offset);
    }
  }

  function emptyText() {
    if (!movies.length) return "Keine Titel für diese Suche oder Filter.";
    return mode === "rated"
      ? "Keiner dieser Titel ist auf IMDb bewertet."
      : "Für diese Titel ist kein Erscheinungsdatum bekannt.";
  }

  /* ---------------- Angaben zum Titel ---------------- */

  function renderInfo() {
    const entry = currentEntry();
    if (!entry) { info.innerHTML = ""; return; }
    const { movie } = entry;
    const release = releaseInfo(movie);
    const rated = ratedTime(movie);
    const facts = [
      release ? `Erschienen ${release.approx ? escapeHtml(movie.year) : escapeHtml(formatDay(release.time))}` : "",
      !hasRatings ? "" : rated !== null ? `Bewertet ${escapeHtml(formatDay(rated))}` : "Noch nicht bewertet",
      movie.yourRating ? `${escapeHtml(ratingLabel)} ${escapeHtml(movie.yourRating)}/10` : "",
    ].filter(Boolean).join(" · ");

    let gap = "";
    if (movie.id === selectedId) {
      const span = movieSpan(movie);
      if (span) {
        const { text, before } = formatGap(span.from, span.to, { approx: span.approx });
        gap = `<p class="timeline-gap"><span class="timeline-gap-value">${escapeHtml(text)}</span> ${before ? "vor dem Erscheinen bewertet" : "nach dem Erscheinen bewertet"}</p>`;
      } else {
        gap = `<p class="timeline-gap is-open">${rated === null ? "Noch nicht bewertet – kein Abstand" : "Erscheinungsdatum unbekannt"}</p>`;
      }
    }
    const href = `${detailHref}?id=${encodeURIComponent(movie.id)}`;
    info.innerHTML = `
      <p class="timeline-title"><a href="${href}">${escapeHtml(movie.title)}</a></p>
      <p class="timeline-facts">${facts}</p>
      ${gap || (hasRatings ? `<p class="timeline-gap-hint">Klick aufs Cover oder Enter zeigt den Abstand</p>` : "")}`;
  }

  /* ---------------- Achse ---------------- */

  function targetDomain() {
    const selected = selectedMovie();
    const span = selected ? movieSpan(selected) : null;
    return timelineDomain(entries, span);
  }

  function renderAxis() {
    const width = axis.clientWidth;
    if (!width || !entries.length) { svg.innerHTML = ""; axis.hidden = !entries.length; return; }
    axis.hidden = false;
    const [start, end] = domain;
    const pad = 12;
    const x = time => pad + ((time - start) / (end - start)) * (width - 2 * pad);

    const xs = entries.map(entry => x(entry.time));
    const stack = stackMarks(xs, STACK_GAP);
    const deepest = Math.min(MAX_LEVEL, Math.max(0, ...stack.map(mark => mark.level)));
    const reach = 4 + deepest * LEVEL_STEP + MARK_LENGTH;   // Ausdehnung je Seite
    const mid = Math.max(reach + 8, 40);
    const height = mid * 2 + 26;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("height", String(height));

    const parts = [];
    for (const tick of axisTicks(domain, width)) {
      const tx = x(tick.time).toFixed(1);
      parts.push(`<line class="tl-grid${tick.major ? "" : " is-minor"}" x1="${tx}" x2="${tx}" y1="${mid - reach}" y2="${mid + reach}"/>`,
        `<text class="tl-label" x="${tx}" y="${height - 6}">${escapeHtml(tick.label)}</text>`);
    }
    parts.push(`<line class="tl-baseline" x1="${pad}" x2="${width - pad}" y1="${mid}" y2="${mid}"/>`);

    const selected = selectedMovie();
    const span = selected ? movieSpan(selected) : null;
    if (span) {
      const a = x(Math.min(span.from, span.to));
      const b = x(Math.max(span.from, span.to));
      parts.push(`<rect class="tl-gap" x="${a.toFixed(1)}" y="${mid - 3}" width="${Math.max(b - a, 1).toFixed(1)}" height="6" rx="3"/>`,
        `<circle class="tl-gap-release" cx="${x(span.from).toFixed(1)}" cy="${mid}" r="4.5"/>`,
        `<circle class="tl-gap-rated" cx="${x(span.to).toFixed(1)}" cy="${mid}" r="4.5"/>`);
    }

    marks = [];
    entries.forEach((entry, index) => {
      const { side, level } = stack[index];
      const inner = mid + side * (4 + Math.min(level, MAX_LEVEL) * LEVEL_STEP);
      const outer = inner + side * MARK_LENGTH;
      const classes = ["tl-mark"];
      if (index === current) classes.push("is-current");
      if (entry.movie.id === selectedId) classes.push("is-selected");
      if (index === hoverIndex) classes.push("is-hover");
      parts.push(`<line class="${classes.join(" ")}" x1="${xs[index].toFixed(1)}" x2="${xs[index].toFixed(1)}" y1="${inner}" y2="${outer}"/>`);
      marks.push({ x: xs[index], y: (inner + outer) / 2, index });
    });
    const now = currentEntry();
    if (now) {
      const cx = x(now.time).toFixed(1);
      parts.push(`<line class="tl-cursor" x1="${cx}" x2="${cx}" y1="${mid - reach - 4}" y2="${mid + reach + 4}"/>`);
    }
    svg.classList.toggle("has-selection", Boolean(selected));
    svg.innerHTML = parts.join("");
  }

  /** Zoomt die Achse weich auf den neuen Ausschnitt (ohne Bewegung: sofort). */
  function animateDomain() {
    const target = targetDomain();
    cancelAnimationFrame(tween);
    if (!domain || reducedMotion() || !axis.clientWidth) {
      domain = target;
      renderAxis();
      return;
    }
    const from = domain;
    const begin = performance.now();
    const step = now => {
      const t = Math.min(1, (now - begin) / TWEEN_MS);
      const ease = 1 - (1 - t) ** 3;
      domain = [from[0] + (target[0] - from[0]) * ease, from[1] + (target[1] - from[1]) * ease];
      renderAxis();
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  /* ---------------- Zustand ---------------- */

  function renderAll() {
    renderFlow();
    renderInfo();
    animateDomain();
    count.textContent = entries.length ? `Titel ${current + 1} von ${entries.length}` : "";
    missingNote.textContent = missing && entries.length
      ? `${missing} Titel ${mode === "rated" ? "noch nicht bewertet" : "ohne Erscheinungsdatum"}`
      : "";
  }

  function go(index) {
    if (!entries.length) return;
    const next = Math.max(0, Math.min(entries.length - 1, index));
    if (next === current) return;
    current = next;
    renderAll();
  }

  function toggleSelected() {
    if (!hasRatings) return;
    const entry = currentEntry();
    if (!entry) return;
    selectedId = selectedId === entry.movie.id ? null : entry.movie.id;
    renderAll();
  }

  /** Neue Titelliste (Suche/Filter) oder neue Ansicht: aktuellen Titel möglichst behalten. */
  function rebuild() {
    const previous = currentEntry();
    ({ entries, missing } = timelineEntries(movies, mode));
    if (selectedId && !entries.some(entry => entry.movie.id === selectedId)) selectedId = null;
    if (!entries.length) current = -1;
    else if (previous) {
      const same = entries.findIndex(entry => entry.movie.id === previous.movie.id);
      current = same >= 0 ? same : nearestIndex(entries, previous.time);
    } else current = entries.length - 1; // Start: das Neueste
    hoverIndex = -1;
    peek.hidden = true;
    renderAll();
  }

  /* ---------------- Bedienung ---------------- */

  modeButtons.forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.timelineMode === mode) return;
      mode = button.dataset.timelineMode;
      syncModeButtons();
      onModeChange(mode);
      rebuild();
    });
  });
  // Radiogruppe: Pfeiltasten wechseln die Ansicht
  modeGroup.addEventListener("keydown", event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = modeButtons.findIndex(button => button.dataset.timelineMode === mode);
    const next = modeButtons[(index + step + modeButtons.length) % modeButtons.length];
    next.focus();
    next.click();
  });
  const syncModeButtons = () => modeButtons.forEach(button => {
    const active = button.dataset.timelineMode === mode;
    button.setAttribute("aria-checked", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  syncModeButtons();

  flow.addEventListener("keydown", event => {
    const actions = {
      ArrowRight: () => go(current + 1),
      ArrowLeft: () => go(current - 1),
      PageDown: () => go(current + 10),
      PageUp: () => go(current - 10),
      Home: () => go(0),
      End: () => go(entries.length - 1),
      Enter: toggleSelected,
      " ": toggleSelected,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });

  // Mausrad / Trackpad: ein Schritt je Bewegung, leicht gebremst
  let lastWheel = 0;
  flow.addEventListener("wheel", event => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!entries.length || Math.abs(delta) < 2) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 70) return;
    lastWheel = now;
    go(current + Math.sign(delta));
  }, { passive: false });

  // Ziehen (Maus, Finger): je ~60 px ein Titel weiter
  let drag = null;
  flow.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, start: current, moved: false, id: event.pointerId };
  });
  flow.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const steps = Math.round((drag.x - event.clientX) / 60);
    if (steps) {
      if (!drag.moved) flow.setPointerCapture?.(event.pointerId);
      drag.moved = true;
    }
    if (drag.moved) go(drag.start + steps);
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const wasDrag = drag.moved;
    drag = null;
    if (wasDrag) return;
    // Klick: seitliches Cover → dorthin; mittleres → Abstand zeigen
    const item = event.target.closest?.(".coverflow-item");
    if (!item) return;
    const index = entries.findIndex(entry => entry.movie.id === item.dataset.id);
    if (index === current) toggleSelected();
    else if (index >= 0) go(index);
  };
  flow.addEventListener("pointerup", endDrag);
  flow.addEventListener("pointercancel", () => { drag = null; });

  /** Nächster Strich zur Mausposition (innerhalb von 8 px waagrecht). */
  function markAt(event) {
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best = null;
    for (const mark of marks) {
      const dx = Math.abs(mark.x - px);
      if (dx > 8) continue;
      const score = dx * 3 + Math.abs(mark.y - py) / 4;
      if (!best || score < best.score) best = { ...mark, score };
    }
    return best;
  }

  svg.addEventListener("pointermove", event => {
    const mark = markAt(event);
    const index = mark ? mark.index : -1;
    if (index === hoverIndex) return;
    hoverIndex = index;
    svg.style.cursor = mark ? "pointer" : "";
    if (!mark) { peek.hidden = true; renderAxis(); return; }
    const { movie } = entries[index];
    peek.innerHTML = `${movie.cover ? `<img src="${escapeHtml(movie.cover)}" alt="">` : `<span class="timeline-peek-fallback">${escapeHtml(movie.title)}</span>`}
      <span class="timeline-peek-title">${escapeHtml(movie.title)}</span>`;
    const left = Math.max(40, Math.min(axis.clientWidth - 40, mark.x));
    peek.style.left = `${left}px`;
    peek.hidden = false;
    renderAxis();
  });
  svg.addEventListener("pointerleave", () => {
    if (hoverIndex === -1) return;
    hoverIndex = -1;
    peek.hidden = true;
    svg.style.cursor = "";
    renderAxis();
  });
  svg.addEventListener("click", event => {
    const mark = markAt(event);
    if (!mark) return;
    go(mark.index);
    flow.focus({ preventScroll: true });
  });

  // Kaputter Cover-Link: Platzhalter mit Titel statt des Symbols für ein
  // fehlendes Bild (wie bei den Karten; error steigt nicht auf → Capture)
  flow.addEventListener("error", event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("coverflow-image")) return;
    const item = img.closest(".coverflow-item");
    if (!item?.querySelector(".coverflow-image")?.isConnected) return; // schon ersetzt
    const entry = entries.find(candidate => candidate.movie.id === item?.dataset.id);
    if (entry) item.innerHTML = coverHtml({ ...entry.movie, cover: "" });
  }, true);
  peek.addEventListener("error", event => {
    if (!(event.target instanceof HTMLImageElement)) return;
    const title = peek.querySelector(".timeline-peek-title")?.textContent || "";
    event.target.replaceWith(Object.assign(document.createElement("span"), { className: "timeline-peek-fallback", textContent: title }));
  }, true);

  new ResizeObserver(() => { if (domain) renderAxis(); }).observe(axis);
  // Breiteres/schmaleres Fenster: mehr oder weniger Cover nebeneinander
  new ResizeObserver(() => { if (measureWindow() && entries.length) renderFlow(); }).observe(flow);

  return {
    /** Neue (gesuchte, gefilterte) Titelliste. */
    update(list) {
      movies = list;
      rebuild();
    },
    /** Panel ist sichtbar geworden: Achse mit echter Breite zeichnen. */
    show() {
      if (measureWindow()) renderFlow();
      domain = targetDomain();
      renderAxis();
    },
    /** Aktuelle Ansicht ("rated" oder "release"). */
    mode: () => mode,
  };
}
