import { seenWithoutRating, markUnseen } from "../logic/imdb-import-logic.js";
import { saveDashboardData } from "../storage.js";
import { openModal, closeModal } from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { $, $$, escapeHtml } from "../utils/dom.js";
import { plural } from "../utils/format.js";

/*
 * Menü "Mehr" → "Gesehen mit IMDb abgleichen": zeigt alle Titel, die als
 * gesehen markiert sind, aber keine eigene IMDb-Bewertung haben. Alle sind
 * vorab angehakt; was angehakt bleibt, wird auf ungesehen gesetzt.
 */

/**
 * @param {object} state - state.movies wird aktualisiert und gespeichert.
 * @param {Function} onChanged - nach dem Speichern (Raster/Statistik neu zeichnen).
 */
export function openSeenCleanup(state, onChanged) {
  const titles = seenWithoutRating(state.movies).sort((a, b) => (a.title || "").localeCompare(b.title || "", "de"));
  if (!titles.length) {
    showToast("Alles stimmt: Jeder gesehene Titel hat eine IMDb-Bewertung.", "success");
    return;
  }
  openModal("Gesehen mit IMDb abgleichen", `
    <p class="meta">${plural(titles.length, "Titel ist", "Titel sind")} als gesehen markiert, haben auf IMDb aber
      keine Bewertung. Angehakte werden auf ungesehen gesetzt – nimm das Häkchen weg, wenn du einen doch gesehen hast.</p>
    <div class="seen-ask-list">
      ${titles.map(movie => `
        <label class="check-row seen-ask-item">
          <input type="checkbox" value="${escapeHtml(movie.id)}" checked>
          <span>${escapeHtml(movie.title || "Ohne Titel")}${movie.year ? ` <span class="meta">${escapeHtml(movie.year)}</span>` : ""}</span>
        </label>`).join("")}
    </div>
    <div class="form-actions">
      <button class="button secondary" type="button" id="seen-cleanup-cancel">Abbrechen</button>
      <button class="button" type="button" id="seen-cleanup-ok"></button>
    </div>`, { small: true });

  const checked = () => $$(".seen-ask-list input:checked").map(input => input.value);
  const updateButton = () => {
    const count = checked().length;
    const button = $("#seen-cleanup-ok");
    button.textContent = count ? `${plural(count, "Titel", "Titel")} auf ungesehen setzen` : "Nichts ändern";
  };
  updateButton();
  $(".seen-ask-list").addEventListener("change", updateButton);
  $("#seen-cleanup-cancel").onclick = closeModal;
  $("#seen-cleanup-ok").onclick = async () => {
    const ids = checked();
    closeModal();
    if (!ids.length) return;
    state.movies = markUnseen(state.movies, ids);
    await saveDashboardData({ movies: state.movies });
    showToast(`${plural(ids.length, "Titel", "Titel")} auf ungesehen gesetzt.`, "success");
    onChanged?.();
  };
}
