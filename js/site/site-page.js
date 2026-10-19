import { $, emptyState } from "../utils/dom.js";
import { initSiteShell, projectorDustEnabled } from "./site-shell.js";
import { openGate, releaseGate } from "./site-gate.js";
import { standLabel } from "./site-data.js";
import { SITE_TITLE, CORNER_ICON } from "./site-constants.js";
import { initProjectorDust, setProjectorDust } from "../ui/projector-dust.js";
import { renderCornerDecoration, releaseCurtain } from "../ui/curtain.js";
import { renderQuoteOfDay } from "../ui/quote-of-day.js";

/*
 * Nur Website: was die Seiten des Dashboards dort zusätzlich bzw. anders tun.
 * js/views/movies-view.js (Sammlung, index.html) und js/views/movie-detail.js
 * (Detailseite, movie.html) rufen das auf, wenn SITE gilt (js/utils/host.js).
 */

/** Kopfleiste, Ansicht-Dialog, Titel der Seite - vor dem Laden der Daten. */
export function startSitePage({ title = SITE_TITLE } = {}) {
  document.title = title;
  const heading = $("#site-title");
  if (heading) heading.textContent = SITE_TITLE;
  initSiteShell();
}

/**
 * Sammlung (index.html) nach dem Laden der Daten: Filmzitat, Lichtkegel,
 * Ecken-Deko, Einlass mit Passwort (der wartende Vorhang öffnet sich danach)
 * und „Stand: …".
 * @param {object} state - aus js/site/site-data.js.
 */
export function startSiteCollection(state) {
  renderQuoteOfDay();
  initProjectorDust($(".page-head"), { enabled: projectorDustEnabled() });
  window.addEventListener("site:projector-dust", () => setProjectorDust(projectorDustEnabled()));
  renderCornerDecoration({ curtainIcon: state.decor || CORNER_ICON });
  if (openGate(state.access, { onUnlock: releaseCurtain })) releaseCurtain();
  const stand = $("#collection-stand");
  if (stand) stand.textContent = standLabel(state);
}

/**
 * Detailseite (movie.html) nach dem Laden der Daten: Einlass; `show` läuft,
 * sobald die Seite frei ist (gleich oder nach dem Passwort).
 */
export function startSiteDetail(state, show) {
  // „Zur Sammlung": kommt man von dort, zurück im Verlauf (Scroll-Position bleibt)
  const back = $("#back-link");
  if (back) back.onclick = event => {
    let fromCollection = false;
    try { fromCollection = new URL(document.referrer).origin === location.origin && !/movie\.html/.test(document.referrer); } catch { /* kein Referrer */ }
    if (fromCollection && history.length > 1) { event.preventDefault(); history.back(); }
  };
  if (openGate(state.access, { onUnlock: show })) show();
}

/** Die Datendatei fehlt oder ist kaputt: Meldung zeigen, Einlass und Vorhang freigeben. */
export function siteLoadFailed(error, target) {
  if (target) target.innerHTML = emptyState(`Die Kinothek konnte nicht geladen werden. ${error?.message || ""}`.trim());
  releaseGate();
  releaseCurtain();
  renderCornerDecoration({ curtainIcon: CORNER_ICON });
}
