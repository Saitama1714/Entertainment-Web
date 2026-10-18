import { $, escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { upsertMovie } from "../collection.js";
import { saveDashboardData } from "../storage.js";
import { extractImdbId, fetchOmdbDetails } from "../cover.js";
import { showToast } from "../utils/toast.js";
import { CONFIG } from "../utils/constants.js";

/**
 * Öffnet das Formular zum Bearbeiten eines Eintrags als Modal (Detailseite).
 * Neue Einträge kommen ausschließlich über den IMDb-Import.
 * @param {object} state - Der aktuelle Dashboard-Zustand (wird mutiert und gespeichert).
 * @param {object} movie - Der vorhandene Eintrag (mit id).
 * @param {Function} onSaved - Callback nach erfolgreichem Speichern (zum Neu-Rendern).
 */
export function openMovieForm(state, movie, onSaved) {
  const values = { title: "", medium: "", seen: false, ...movie };
  // Nur neu laden, wenn der Link geändert wurde - sonst würde schon das
  // Durchtabben den IMDb-Titel durch den (englischen) OMDb-Titel ersetzen.
  const initialLookup = String(values.imdbUrl || values.imdbId || "").trim();
  // Sammelt Zusatzdaten aus dem IMDb-Abruf (Cover, Bewertung, Regie, ...),
  // die es im Formular nicht als eigenes Feld gibt - werden beim Speichern mitgeführt.
  let fetchedExtras = {};

  openModal("Eintrag bearbeiten", `
    <form id="movie-form">
      <div class="field full">
        <label for="imdb-lookup">IMDb-Link oder -ID <span class="meta">(optional)</span></label>
        <div class="lookup-row">
          <input id="imdb-lookup" type="text" placeholder="https://www.imdb.com/title/tt.../ oder tt1234567"
                 value="${escapeHtml(values.imdbUrl || values.imdbId || "")}">
          <button class="small-button" type="button" id="imdb-lookup-button">Daten laden</button>
        </div>
        <p class="status-line" id="imdb-lookup-status"></p>
      </div>
      <div class="form-grid">
        <label class="field full">Titel
          <input name="title" required value="${escapeHtml(values.title)}">
        </label>
        ${values.imdbId ? `
        <label class="check-row full">
          <input type="checkbox" name="syncTitle" ${values.lockedFields?.includes("title") ? "" : "checked"}>
          <span>Titel beim Import von IMDb übernehmen</span>
        </label>` : ""}
        <label class="field">Medium
          <select name="medium">
            <option value="" ${values.medium === "" ? "selected" : ""}>Kein Medium</option>
            ${CONFIG.MEDIA_TYPES.map(value =>
              `<option ${values.medium === value ? "selected" : ""}>${value}</option>`
            ).join("")}
          </select>
          ${state.collectionListName && (values.imdbLists || []).includes(state.collectionListName) ? `
            <span class="field-note">Kommt beim Import aus der Beschreibung in deiner IMDb-Liste
              „${escapeHtml(state.collectionListName)}“ – eine Änderung hier gilt nur bis zum nächsten Import.</span>` : ""}
        </label>
        <label class="field">Gesehen
          <select name="seen" id="seen-select">
            <option value="false" ${!values.seen ? "selected" : ""}>Nein</option>
            <option value="true" ${values.seen ? "selected" : ""}>Ja</option>
          </select>
        </label>
        <label class="field full"><span>Notizen <span class="meta">(optional)</span></span>
          <textarea name="notes" rows="3">${escapeHtml(values.notes || "")}</textarea>
        </label>
      </div>
      <div class="form-actions">
        <button class="button secondary" type="button" id="cancel-form">Abbrechen</button>
        <button class="button" type="submit">Speichern</button>
      </div>
    </form>`);

  $("#cancel-form").onclick = closeModal;

  const lookupInput = $("#imdb-lookup");
  const lookupButton = $("#imdb-lookup-button");
  const lookupStatus = $("#imdb-lookup-status");

  // Läuft gerade ein Abruf, wartet "Speichern" darauf (sonst gingen die Daten verloren)
  let pendingLookup = null;

  /** Lädt Eckdaten zum eingegebenen IMDb-Link bei OMDb und füllt den Titel vor. */
  async function runLookup() {
    const raw = lookupInput.value.trim();
    if (!raw) { lookupStatus.textContent = ""; return; }

    const id = extractImdbId(raw);
    if (!id) {
      lookupStatus.textContent = "Das sieht nicht nach einer IMDb-ID oder einem IMDb-Link aus.";
      return;
    }
    if (!state.omdbApiKey) {
      lookupStatus.textContent = "Dafür fehlt der OMDb-Schlüssel (Kopfleiste → Einstellungen).";
      return;
    }

    lookupButton.disabled = true;
    lookupStatus.textContent = "Daten werden geladen …";
    try {
      pendingLookup = fetchOmdbDetails(id, state.omdbApiKey);
      const details = await pendingLookup;
      if (!details) {
        lookupStatus.textContent = "Kein Treffer bei OMDb zu dieser ID.";
        return;
      }
      fetchedExtras = details;
      if (details.title) $("#movie-form [name='title']").value = details.title;
      lookupStatus.textContent = [
        details.title,
        details.year && `(${details.year})`,
        details.directors && `· Regie: ${details.directors}`,
        details.cover ? "· Cover gefunden" : "",
      ].filter(Boolean).join(" ");
    } catch (error) {
      lookupStatus.textContent = error.message || "Die Daten konnten nicht geladen werden.";
    } finally {
      pendingLookup = null;
      lookupButton.disabled = false;
    }
  }

  lookupButton.onclick = runLookup;
  lookupInput.onblur = () => { if (lookupInput.value.trim() !== initialLookup) runLookup(); };
  lookupInput.onkeydown = event => {
    if (event.key === "Enter") { event.preventDefault(); runLookup(); }
  };

  // Wer einen eigenen Titel eintippt, will ihn behalten: Häkchen automatisch lösen
  const syncTitle = $("#movie-form [name=syncTitle]");
  $("#movie-form [name=title]").addEventListener("input", () => { if (syncTitle) syncTitle.checked = false; });

  $("#movie-form").onsubmit = async event => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (pendingLookup) await pendingLookup.catch(() => {});
    if (!formElement.isConnected) return; // Dialog wurde währenddessen geschlossen
    const form = new FormData(formElement);
    const seen = form.get("seen") === "true";
    // Titel von Hand festgelegt (Häkchen aus) → der Import lässt ihn in Ruhe
    const lockedFields = (values.lockedFields || []).filter(field => field !== "title");
    if (values.imdbId && !form.get("syncTitle")) lockedFields.push("title");
    state.movies = upsertMovie(state.movies, {
      ...values,
      ...fetchedExtras,
      id: movie.id,
      title: form.get("title").trim(),
      medium: form.get("medium"),
      seen,
      notes: form.get("notes").trim(),
      lockedFields,
    });
    await saveDashboardData({ movies: state.movies });
    closeModal();
    showToast("Eintrag gespeichert.", "success");
    onSaved();
  };
}
