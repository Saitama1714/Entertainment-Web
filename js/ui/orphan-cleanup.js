import { moviesWithoutList, removeMovies } from "../logic/imdb-import-logic.js";
import { saveDashboardData } from "../storage.js";
import { openModal, closeModal } from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { $, $$, escapeHtml } from "../utils/dom.js";
import { plural } from "../utils/format.js";

/*
 * Menü "Mehr" → "Titel ohne IMDb-Liste aufräumen": zeigt alle Titel, die in
 * keiner IMDb-Liste mehr stehen. Nichts ist vorab angehakt - angehakte
 * werden gelöscht (samt Notizen und Cover).
 */

/**
 * @param {object} state - state.movies wird aktualisiert und gespeichert.
 * @param {Function} onChanged - nach dem Speichern (Raster/Statistik neu zeichnen).
 */
export function openOrphanCleanup(state, onChanged) {
  const titles = moviesWithoutList(state.movies);
  if (!titles.length) {
    showToast("Alles stimmt: Jeder Titel steht in mindestens einer IMDb-Liste.", "success");
    return;
  }
  openModal("Titel ohne IMDb-Liste", `
    <p class="meta">${plural(titles.length, "Titel steht", "Titel stehen")} in keiner IMDb-Liste mehr. Angehakte werden
      gelöscht – samt Notizen und Cover. Sie kommen beim nächsten Import nicht zurück.</p>
    <div class="seen-ask-list">
      ${titles.map(movie => `
        <label class="check-row seen-ask-item">
          <input type="checkbox" value="${escapeHtml(movie.id)}">
          <span>${escapeHtml(movie.title || "Ohne Titel")}${movie.year ? ` <span class="meta">${escapeHtml(movie.year)}</span>` : ""}${movie.imdbId ? "" : ` <span class="meta">(ohne IMDb-Verknüpfung)</span>`}</span>
        </label>`).join("")}
    </div>
    <div class="form-actions">
      <button class="button secondary" type="button" id="orphan-cleanup-cancel">Abbrechen</button>
      <button class="button" type="button" id="orphan-cleanup-ok" disabled></button>
    </div>`, { small: true });

  const checked = () => $$(".seen-ask-list input:checked").map(input => input.value);
  const updateButton = () => {
    const count = checked().length;
    const button = $("#orphan-cleanup-ok");
    button.disabled = count === 0;
    button.textContent = count ? `${plural(count, "Titel", "Titel")} löschen` : "Nichts ausgewählt";
  };
  updateButton();
  $(".seen-ask-list").addEventListener("change", updateButton);
  $("#orphan-cleanup-cancel").onclick = closeModal;
  $("#orphan-cleanup-ok").onclick = async () => {
    const ids = checked();
    closeModal();
    if (!ids.length) return;
    state.movies = removeMovies(state.movies, ids);
    await saveDashboardData({ movies: state.movies });
    showToast(`${plural(ids.length, "Titel", "Titel")} gelöscht.`, "success");
    onChanged?.();
  };
}
