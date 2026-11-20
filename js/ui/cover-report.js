import { coverReport } from "../logic/cover-report-logic.js";
import { openModal, closeModal } from "../utils/modal.js";
import { $, escapeHtml } from "../utils/dom.js";
import { plural } from "../utils/format.js";

/*
 * Kleines Fenster nach „Fehlende Cover laden“: oben, wie viele Cover gerade
 * geladen wurden; darunter entweder die Bestätigung, dass kein Cover fehlt,
 * oder alle Titel weiterhin ohne Cover - nach Grund gruppiert. Ein Klick auf
 * einen Titel öffnet seine Detailseite („Cover ändern“), „Alle im Raster
 * zeigen“ filtert die Titel ohne Cover.
 */

/**
 * @param {object[]} movies - Kinothek nach dem Lauf.
 * @param {object} run - { loaded, failedIds, triedIds, fatal } aus fetchMissingCovers.
 * @param {{ onShowAll?: () => void }} [options]
 */
export function openCoverReport(movies, run, { onShowAll } = {}) {
  const report = coverReport(movies, run);
  const loaded = report.loaded
    ? `<p class="cover-report-loaded"><strong>${plural(report.loaded, "Cover", "Cover")} geladen.</strong></p>`
    : `<p class="cover-report-loaded meta">Diesmal wurde kein neues Cover geladen.</p>`;
  const fatal = report.fatal ? `<p class="cover-report-fatal">Abgebrochen: ${escapeHtml(report.fatal)}</p>` : "";
  const body = report.total
    ? `<p class="meta">${plural(report.total, "Titel hat", "Titel haben")} weiterhin kein Cover:</p>
      <div class="cover-report-list">${report.groups.map(group => `
        <section class="cover-report-group">
          <h3>${escapeHtml(group.label)} <span class="meta">${group.movies.length.toLocaleString("de-DE")}</span></h3>
          <p class="meta">${escapeHtml(group.help)}</p>
          <ul>${group.movies.map(movie => `<li><a href="movie.html?id=${encodeURIComponent(movie.id)}">${escapeHtml(movie.title || "Ohne Titel")}</a>${movie.year ? ` <span class="meta">${escapeHtml(movie.year)}</span>` : ""}</li>`).join("")}</ul>
        </section>`).join("")}</div>`
    : `<p class="cover-report-ok"><span aria-hidden="true">✓</span> Alle Titel haben ein Cover.</p>`;
  openModal("Cover geprüft", `${loaded}${fatal}${body}
    <div class="form-actions">
      ${report.total ? `<button class="button secondary" type="button" id="cover-report-all">Alle im Raster zeigen</button>` : ""}
      <button class="button" type="button" id="cover-report-close">Schließen</button>
    </div>`, { small: true });
  $("#cover-report-close").onclick = closeModal;
  const all = $("#cover-report-all");
  if (all) all.onclick = () => { closeModal(); onShowAll?.(); };
}
