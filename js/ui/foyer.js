import { $, $$, escapeHtml, reducedMotion } from "../utils/dom.js";
import { SITE } from "../utils/host.js";
import { LOGO_SVG } from "./logo-svg.js";
import { readLogoMotion, logoTempoFactor } from "../logic/logo-motion-logic.js";
import {
  spoolItems, spoolLayout, SPOOL, saalInfo, SAAL_ROOMS,
  programmPicks, boardLines, kasse, openWatchable,
} from "../logic/foyer-logic.js";
import { backupReminderStatus, downloadBackup } from "./backup.js";
import { formatDay } from "../utils/format.js";
import { CONFIG } from "../utils/constants.js";

/*
 * Design „Foyer" (2.41) - die Oberfläche. Ist <html data-skin="foyer"> gesetzt
 * (js/ui/app-shell.js, applyDesign), kommen hier dazu:
 *   - die Spule: der Knopf oben rechts klappt sie auf (innen Foyer, Lesezeichen,
 *     Entertainment, Vorführraum; außen die Säle von Entertainment); das
 *     Logo-Medaillon führt wie in Kino-Noir zur Übersicht (seit 2.41.3),
 *   - ein Ortsschild in der Kopfleiste („Foyer · Guten Abend", „Saal 2 · …"),
 *   - je Seite: Programmtafel, Uhr/Zitat und Eintrittskarte im Foyer
 *     (Übersicht), Saalschilder unter Entertainment und auf Lesezeichen.
 * Wechselt das Design zurück (oder wird das Fenster schmal), räumt unmount()
 * alles wieder ab und stellt verschobene Teile zurück. Aussehen: css/foyer.css.
 * Logik (Spule, Säle, Tafel, Kasse): js/logic/foyer-logic.js.
 */

let state = null;
let hooks = {};
let mounted = false;
let page = "home";
let base = "";
let currentTab = "titles";
let boardRound = 0;
const moved = [];          // verschobene Knoten {node, parent, next}
const swapped = [];        // geänderte Texte {el, text}
let spool = null;          // offenes Overlay
let returnFocus = null;

/** Welche Seite ist das? */
function detectPage() {
  const path = location.pathname;
  if (/\/views\/bookmarks\.html$/.test(path)) return "bookmarks";
  if (/\/views\/movies\.html$/.test(path)) return "movies";
  if (/\/views\/movie\.html$/.test(path)) return "detail";
  return "home";
}

/** Reiter, die es auf dieser Seite gibt (Website/Dashboard). */
const availableTabs = () => $$(".view-tab").map(tab => tab.id.replace("tab-", ""));

const greeting = (hour = new Date().getHours()) => (hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend");

/* ---- Ortsschild in der Kopfleiste ----------------------------------------- */

function whereLabel() {
  if (page === "home") return { eyebrow: "Foyer", title: greeting() };
  if (page === "bookmarks") return { eyebrow: "Saal 1", title: "Lesezeichen" };
  if (page === "detail") return { eyebrow: "Saal 2 · Titel", title: "Die Vorstellung" };
  const room = saalInfo(currentTab, availableTabs());
  return { eyebrow: "Saal 2 · Entertainment", title: room.name };
}

function renderWhere() {
  const inner = $(".appbar-inner");
  if (!inner) return;
  let where = $("#foyer-where");
  if (!where) {
    where = document.createElement("div");
    where.id = "foyer-where";
    where.className = "foyer-where";
    where.dataset.foyer = "";
    $(".brand", inner)?.after(where);
  }
  const { eyebrow, title } = whereLabel();
  where.innerHTML = `<span class="foyer-eyebrow">${escapeHtml(eyebrow)}</span><span class="foyer-where-title">${escapeHtml(title)}</span>`;
  if (page === "detail" && !$("#foyer-back")) {
    (spoolButton() || inner).insertAdjacentHTML(spoolButton() ? "beforebegin" : "beforeend", `<button type="button" class="foyer-pill" id="foyer-back" data-foyer>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>Zurück</button>`);
    $("#foyer-back").addEventListener("click", () => {
      if (history.length > 1) history.back();
      else location.href = "movies.html";
    });
  }
}

/* ---- Saalschilder ------------------------------------------------------- */

const bulbs = `<span class="foyer-bulbs" aria-hidden="true"></span>`;

/** Saalschild unter Entertainment (Titel groß, die übrigen Säle kompakt). */
function renderMoviesSign() {
  const tabs = $(".view-tabs");
  if (!tabs) return;
  let sign = $("#foyer-saal");
  if (!sign) {
    sign = document.createElement("section");
    sign.id = "foyer-saal";
    sign.dataset.foyer = "";
    tabs.before(sign);
    sign.addEventListener("click", event => {
      const go = event.target.closest("[data-foyer-tab]");
      if (go) selectTab(go.dataset.foyerTab);
    });
  }
  const room = saalInfo(currentTab, availableTabs());
  const count = kasse(state?.movies || []);
  const line = room.tab === "titles"
    ? `${count.total.toLocaleString("de-DE")} Titel in der Kinothek · ${count.seen.toLocaleString("de-DE")} gesehen · ${count.open.toLocaleString("de-DE")} offen`
    : room.line;
  sign.className = `foyer-saal${room.compact ? " is-compact" : ""}`;
  sign.setAttribute("aria-label", `Saal 2: ${room.name}`);
  sign.innerHTML = `${bulbs}
    <span class="foyer-saal-number" aria-hidden="true">2</span>
    <div class="foyer-saal-text">
      <h2 class="foyer-saal-name">${escapeHtml(room.name)}</h2>
      <p class="foyer-saal-line">${escapeHtml(line)}</p>
    </div>
    <nav class="foyer-saal-nav" aria-label="Nachbarsäle">
      <button type="button" class="foyer-pill" data-foyer-tab="${room.prev.tab}"><span aria-hidden="true">‹</span> ${escapeHtml(room.prev.name)}</button>
      <button type="button" class="foyer-pill" data-foyer-tab="${room.next.tab}">${escapeHtml(room.next.name)} <span aria-hidden="true">›</span></button>
    </nav>`;
}

/** Saalschild auf „Lesezeichen" mit Zähler für die Schaukästen. */
function renderBookmarksSign() {
  const head = $(".page-head");
  if (!head) return;
  let sign = $("#foyer-saal");
  if (!sign) {
    sign = document.createElement("section");
    sign.id = "foyer-saal";
    sign.className = "foyer-saal";
    sign.dataset.foyer = "";
    head.after(sign);
  }
  const pinned = state?.pinnedBookmarkIds?.length || 0;
  sign.setAttribute("aria-label", "Saal 1: Lesezeichen");
  sign.innerHTML = `${bulbs}
    <span class="foyer-saal-number" aria-hidden="true">1</span>
    <div class="foyer-saal-text">
      <h2 class="foyer-saal-name">Lesezeichen</h2>
      <p class="foyer-saal-line">Was im Schaukasten hängt, erscheint im Foyer. Platz für ${CONFIG.MAX_PINNED_BOOKMARKS}.</p>
    </div>
    <p class="foyer-saal-count"><span class="foyer-saal-count-value">${pinned}<small> / ${CONFIG.MAX_PINNED_BOOKMARKS}</small></span><span class="foyer-eyebrow">Im Schaukasten</span></p>`;
}

/* ---- Foyer (Übersicht) ---------------------------------------------------- */

/** Knoten an einen neuen Ort hängen und sich den alten merken. */
function moveInto(node, target) {
  if (!node || !target) return;
  moved.push({ node, parent: node.parentNode, next: node.nextSibling });
  target.append(node);
}

/** Text tauschen und den alten merken. */
function swapText(el, text) {
  if (!el) return;
  swapped.push({ el, text: el.textContent });
  el.textContent = text;
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function renderBoard() {
  const board = $("#foyer-board-lines");
  if (!board || !state) return;
  const movies = state.movies || [];
  const picks = programmPicks(movies, { day: dayKey(), round: boardRound });
  const lines = boardLines({ picks, openCount: openWatchable(movies) });
  board.innerHTML = lines.map(line => `<p class="foyer-board-line">${line.tag ? `<span class="foyer-board-tag">${escapeHtml(line.tag)}</span> ` : ""}${escapeHtml(line.text)}</p>`).join("");
  const open = $("#foyer-board-open");
  if (picks[0]) {
    open.hidden = false;
    open.href = `views/movie.html?id=${encodeURIComponent(picks[0].id)}`;
    open.textContent = `${picks[0].title} öffnen`;
  } else open.hidden = true;
  $("#foyer-board-reroll").hidden = picks.length < 2 && boardRound === 0 && !movies.length;
}

function renderKasse() {
  const ticket = $("#foyer-kasse");
  if (!ticket || !state) return;
  const count = kasse(state.movies || []);
  const status = backupReminderStatus(state, Date.now());
  const backup = status.never ? "Noch keine Sicherung gespeichert." : `Letzte Sicherung: ${formatDay(state.lastBackupAt)}`;
  const n = value => value.toLocaleString("de-DE");
  ticket.innerHTML = `
    <div class="foyer-kasse-part"><span class="foyer-kasse-label">Kinothek</span><span class="foyer-kasse-value">${n(count.total)}</span><span class="foyer-kasse-note">Titel insgesamt</span></div>
    <div class="foyer-kasse-part"><span class="foyer-kasse-label">Gesehen</span><span class="foyer-kasse-value">${n(count.seen)}</span><span class="foyer-kasse-note">${count.percent} Prozent</span></div>
    <div class="foyer-kasse-part"><span class="foyer-kasse-label">Offen</span><span class="foyer-kasse-value">${n(count.open)}</span><span class="foyer-kasse-note">warten noch</span></div>
    <div class="foyer-kasse-stub"><span class="foyer-kasse-label">Abriss · Sicherung</span><span class="foyer-kasse-backup">${escapeHtml(backup)}</span>
      <button type="button" class="foyer-kasse-button" id="foyer-backup-now">Jetzt sichern</button></div>`;
  $("#foyer-backup-now").addEventListener("click", async () => {
    await downloadBackup(state);
    renderKasse();
    document.getElementById("backup-reminder-slot")?.replaceChildren();
  });
}

function mountHome() {
  const head = $(".page-head");
  if (!head) return;
  head.insertAdjacentHTML("afterend", `
    <section class="foyer-stage" id="foyer-stage" data-foyer aria-label="Programm">
      <div class="foyer-board">
        ${bulbs}
        <div class="foyer-board-face">
          <p class="foyer-eyebrow">Heute im Programm</p>
          <div id="foyer-board-lines" aria-live="polite"></div>
        </div>
        <div class="foyer-board-actions">
          <a class="foyer-button" id="foyer-board-open" href="#" hidden></a>
          <button type="button" class="foyer-pill" id="foyer-board-reroll">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>Neu stecken</button>
        </div>
        ${bulbs.replace("foyer-bulbs", "foyer-bulbs is-bottom")}
      </div>
      <aside class="foyer-aside">
        <div class="foyer-card foyer-clock" id="foyer-clock"><span class="foyer-eyebrow">Vorstellung</span></div>
        <div class="foyer-card foyer-quote" id="foyer-quote"></div>
      </aside>
    </section>`);
  moveInto($(".clock-widget"), $("#foyer-clock"));
  moveInto($("#quote-of-day"), $("#foyer-quote"));
  $("#foyer-board-reroll").addEventListener("click", () => { boardRound++; renderBoard(); });
  renderBoard();

  const favorites = $("#bookmarks-heading")?.closest("section");
  favorites?.insertAdjacentHTML("afterend", `<section class="foyer-kasse" id="foyer-kasse" data-foyer aria-label="Kasse"></section>`);
  renderKasse();

  swapText($("#bookmarks-heading"), "Schaukästen");
  swapText($("#collection-heading"), "Frisch eingetroffen");
  $("#bookmarks-heading")?.insertAdjacentHTML("afterend", `<span class="foyer-eyebrow foyer-head-eyebrow" data-foyer>Deine Favoriten</span>`);
  $("#collection-heading")?.insertAdjacentHTML("afterend", `<span class="foyer-eyebrow foyer-head-eyebrow" data-foyer>Zuletzt in die Kinothek</span>`);
}

/* ---- Spule ---------------------------------------------------------------- */

const REEL_SVG = `<svg viewBox="0 0 540 540" aria-hidden="true" focusable="false">
  <circle cx="270" cy="270" r="262" fill="#231917" stroke="#c9a45c" stroke-opacity=".7" stroke-width="2"/>
  <circle cx="270" cy="270" r="214" fill="#0b0807"/>
  <circle cx="270" cy="270" r="190" fill="none" stroke="#1d1513" stroke-width="2"/>
  <circle cx="270" cy="270" r="166" fill="none" stroke="#1d1513" stroke-width="2"/>
  <g fill="#140d0c" stroke="#c9a45c" stroke-opacity=".45" stroke-width="1.5">
    <circle cx="270" cy="130" r="46"/><circle cx="391" cy="200" r="46"/><circle cx="391" cy="340" r="46"/>
    <circle cx="270" cy="410" r="46"/><circle cx="149" cy="340" r="46"/><circle cx="149" cy="200" r="46"/>
  </g></svg>`;

/**
 * Logo für die Nabe - mit eigenen Kennungen: Die Verläufe und Masken des
 * Medaillons in der Kopfleiste sind versteckt, solange die Spule offen ist,
 * und dürfen hier nicht mitbenutzt werden.
 */
const hubLogo = (fx, tempo) => LOGO_SVG
  .replace(/id="lg-/g, 'id="hub-lg-').replace(/url\(#lg-/g, "url(#hub-lg-")
  .replace('class="brand-logo"', `class="brand-logo foyer-hub-logo once ${fx}" style="--logo-t:${tempo}"`);

const HUB = SPOOL.hub;     // Durchmesser der aufgeklappten Nabe

/** Kleine Messing-Spule für den Knopf in der Kopfleiste. */
const MINI_REEL_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <defs><radialGradient id="foyer-mini-reel" cx="40%" cy="35%" r="70%">
    <stop offset="0" stop-color="#f3d99a"/><stop offset=".55" stop-color="#c9a45c"/><stop offset="1" stop-color="#7a5a26"/></radialGradient></defs>
  <circle cx="24" cy="24" r="22.5" fill="url(#foyer-mini-reel)" stroke="#5a4018" stroke-width="1"/>
  <circle cx="24" cy="24" r="19" fill="none" stroke="#6e5022" stroke-opacity=".55" stroke-width=".8"/>
  <g fill="#1a1210" stroke="#6e5022" stroke-width=".8">
    <circle cx="24" cy="12" r="5"/><circle cx="34.4" cy="18" r="5"/><circle cx="34.4" cy="30" r="5"/>
    <circle cx="24" cy="36" r="5"/><circle cx="13.6" cy="30" r="5"/><circle cx="13.6" cy="18" r="5"/>
  </g>
  <circle cx="24" cy="24" r="3.4" fill="#1a1210" stroke="#f3d99a" stroke-width="1"/></svg>`;

const spoolButton = () => $("#foyer-spool-button");

/** Spulen-Knopf ganz rechts in der Kopfleiste (2.41.3, Nutzerwunsch). */
function renderSpoolButton() {
  const inner = $(".appbar-inner");
  if (!inner || spoolButton()) return;
  inner.insertAdjacentHTML("beforeend", `<button type="button" class="foyer-spool-button" id="foyer-spool-button" data-foyer
      aria-haspopup="dialog" aria-expanded="false" aria-label="Spule öffnen – Bereiche und Säle">
      <span class="foyer-spool-button-label" aria-hidden="true">Spule</span>
      <span class="foyer-spool-button-reel" aria-hidden="true">${MINI_REEL_SVG}</span>
    </button>`);
  spoolButton().addEventListener("click", () => { if (spool) closeSpool(); else openSpool(); });
}

/** Position einer Beschriftung; rechts verankert, wenn die Spule nach links aufgeht. */
const place = (pos, viewportWidth) => (viewportWidth ? `right:${viewportWidth - pos.x}px` : `left:${pos.x}px`) + `;top:${pos.y}px`;

function itemHtml(item, ring, pos, index, viewportWidth) {
  const tag = item.action === "settings" || item.action === "tab" ? "button" : "a";
  const attrs = tag === "a" ? `href="${escapeHtml(item.href)}"` : `type="button"`;
  return `<${tag} class="foyer-spool-item is-${ring}${item.current ? " is-current" : ""}" ${attrs}
      data-action="${item.action || ""}" data-tab="${item.tab || ""}" ${item.current ? `aria-current="page"` : ""}
      style="${place(pos, viewportWidth)};--delay:${(ring === "outer" ? 0.28 : 0.1) + index * 0.05}s">
      <span class="foyer-spool-dot" aria-hidden="true"></span>
      <span class="foyer-spool-label"><span class="foyer-spool-name">${escapeHtml(item.label)}</span>${item.sub ? `<span class="foyer-spool-sub">${escapeHtml(item.sub)}</span>` : ""}</span>
    </${tag}>`;
}

/** Klappt die Spule auf. */
export function openSpool() {
  if (spool || !mounted) return;
  const trigger = spoolButton();
  if (!trigger) return;
  returnFocus = document.activeElement;
  const rect = $(".foyer-spool-button-reel", trigger).getBoundingClientRect();
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const { inner, outer } = spoolItems({ page, tab: currentTab, base, available: page === "movies" ? availableTabs() : undefined });
  const layout = spoolLayout({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, viewport, { inner: inner.length, outer: outer.length, side: "right" });
  const vw = viewport.width;
  const { center } = layout;
  const motion = readLogoMotion(state?.logoMotion);
  const fx = motion.effects.map(effect => `fx-${effect}`).join(" ");

  spool = document.createElement("div");
  spool.className = "foyer-spool is-right";
  spool.setAttribute("role", "dialog");
  spool.setAttribute("aria-modal", "true");
  spool.setAttribute("aria-label", "Spule – wohin möchtest du?");
  spool.style.setProperty("--cx", `${center.x}px`);
  spool.style.setProperty("--cy", `${center.y}px`);
  spool.style.setProperty("--r-inner", `${layout.innerR}px`);
  spool.style.setProperty("--r-outer", `${layout.outerR}px`);
  spool.style.setProperty("--spool-scale", layout.scale);
  spool.innerHTML = `
    <div class="foyer-spool-dim" data-close></div>
    <span class="foyer-spool-ring is-inner" aria-hidden="true"></span>
    <span class="foyer-spool-ring is-outer" aria-hidden="true"></span>
    <div class="foyer-spool-reel" style="width:${layout.reel}px;height:${layout.reel}px">${REEL_SVG}</div>
    <div class="foyer-spool-hub" style="width:${HUB}px;height:${HUB}px">${hubLogo(fx, logoTempoFactor(motion))}</div>
    <nav class="foyer-spool-nav" aria-label="Bereiche und Säle">
      ${inner.map((item, i) => itemHtml(item, "inner", layout.inner[i], i, vw)).join("")}
      <span class="foyer-spool-caption" style="${place({ x: layout.caption.x, y: Math.max(16, layout.caption.y) }, vw)}" aria-hidden="true">Saal 2 · Entertainment</span>
      ${outer.map((item, i) => itemHtml(item, "outer", layout.outer[i], i, vw)).join("")}
    </nav>
    <button type="button" class="foyer-spool-close foyer-pill" data-close>Schließen
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`;
  document.body.append(spool);
  document.documentElement.classList.add("foyer-spool-open");

  // Nabe wächst aus der kleinen Spule im Knopf (FLIP)
  const hub = $(".foyer-spool-hub", spool);
  const fromScale = rect.width / HUB;
  hub.style.setProperty("--from", `translate(${rect.left + rect.width / 2 - center.x}px, ${rect.top + rect.height / 2 - center.y}px) scale(${fromScale})`);
  trigger.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => requestAnimationFrame(() => spool?.classList.add("is-open")));

  spool.addEventListener("click", onSpoolClick);
  spool.addEventListener("keydown", onSpoolKey);
  (spool.querySelector(".foyer-spool-item.is-current") || spool.querySelector(".foyer-spool-item"))?.focus({ preventScroll: true });
}

/** Klappt die Spule wieder zu. */
export function closeSpool({ restoreFocus = true } = {}) {
  if (!spool) return;
  const el = spool;
  spool = null;
  document.documentElement.classList.remove("foyer-spool-open");
  spoolButton()?.setAttribute("aria-expanded", "false");
  el.classList.remove("is-open");
  el.classList.add("is-closing");
  setTimeout(() => el.remove(), reducedMotion() ? 0 : 320);
  if (restoreFocus) (returnFocus && document.contains(returnFocus) ? returnFocus : spoolButton())?.focus({ preventScroll: true });
}

function onSpoolClick(event) {
  if (event.target.closest("[data-close]")) { closeSpool(); return; }
  const item = event.target.closest(".foyer-spool-item");
  if (!item) return;
  const action = item.dataset.action;
  if (action === "settings") { event.preventDefault(); closeSpool(); hooks.onSettings?.(); return; }
  if (action === "tab") { event.preventDefault(); closeSpool(); selectTab(item.dataset.tab); return; }
  closeSpool({ restoreFocus: false }); // Link öffnet die Seite
}

function onSpoolKey(event) {
  if (event.key === "Escape") { event.preventDefault(); closeSpool(); return; }
  const items = $$(".foyer-spool-item, .foyer-spool-close", spool);
  const index = items.indexOf(document.activeElement);
  if (event.key === "Tab") {
    event.preventDefault();
    const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  } else if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
    event.preventDefault();
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  }
}

/** Reiter unter Entertainment wechseln (js/views/movies-view.js hört zu). */
function selectTab(tab) {
  window.dispatchEvent(new CustomEvent("dashboard:select-tab", { detail: { tab } }));
}

/* ---- Auf- und Abbau ------------------------------------------------------ */

function mount() {
  if (mounted) return;
  mounted = true;
  renderSpoolButton();
  renderWhere();
  if (page === "home") mountHome();
  if (page === "movies") renderMoviesSign();
  if (page === "bookmarks") renderBookmarksSign();
}

function unmount() {
  if (!mounted) return;
  mounted = false;
  closeSpool({ restoreFocus: false });
  $$("[data-foyer]").forEach(el => el.remove());
  while (moved.length) {
    const { node, parent, next } = moved.pop();
    parent?.insertBefore(node, next && next.parentNode === parent ? next : null);
  }
  while (swapped.length) {
    const { el, text } = swapped.pop();
    el.textContent = text;
  }
}

/** Foyer an oder aus, je nach <html data-skin>. */
function sync() {
  if (document.documentElement.dataset.skin === "foyer") mount(); else unmount();
}

/**
 * Einmal je Seite (aus initAppShell). Website: nie.
 * @param {object} appState
 * @param {{onSettings?: Function}} [pageHooks]
 */
export function initFoyer(appState, pageHooks = {}) {
  if (SITE) return;
  state = appState;
  hooks = pageHooks;
  page = detectPage();
  base = location.pathname.includes("/views/") ? "../" : "";
  window.addEventListener("dashboard:skin", sync);
  window.addEventListener("dashboard:tab", event => {
    currentTab = event.detail?.tab || currentTab;
    if (!mounted) return;
    renderWhere();
    renderMoviesSign();
  });
  window.addEventListener("resize", () => { if (spool) closeSpool({ restoreFocus: false }); });
  sync();
}

/** Nach neuen Daten (Import, anderer Tab, Favoriten) die Foyer-Teile neu zeichnen. */
export function refreshFoyer(appState = state) {
  state = appState;
  if (!mounted) return;
  if (page === "home") { renderBoard(); renderKasse(); }
  if (page === "movies") renderMoviesSign();
  if (page === "bookmarks") renderBookmarksSign();
}

/** Säle (für Tests und die Spule auf anderen Seiten). */
export const FOYER_ROOMS = SAAL_ROOMS;
