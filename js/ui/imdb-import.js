import { parseImdbExport } from "../collection.js";
import { mergeImdbLists, suggestListName, validateListNames, dataTimestamp, recognizeList } from "../logic/imdb-import-logic.js";
import { deleteImportedDownloads, canManageDownloads } from "./imdb-downloads.js";
import { listFilterOptions } from "../logic/movies-logic.js";
import { saveDashboardData } from "../storage.js";
import { openModal, closeModal } from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { $, escapeHtml } from "../utils/dom.js";
import { formatDay, plural } from "../utils/format.js";

/*
 * Dialog "IMDb-Listen importieren": mehrere CSV-Exporte auf einmal wählen,
 * jeder Datei einen Listennamen geben, alles in einem Schritt zusammenführen.
 */

const KIND_LABEL = { ratings: "Bewertungen-Export", list: "Liste oder Watchlist" };

/**
 * Öffnet den Import-Dialog.
 * @param {object} state - wird nach dem Import aktualisiert (movies, lastImdbImportAt).
 * @param {{onImported?: Function}} [hooks] - onImported(result, summary) nach Erfolg.
 */
export function openImdbImport(state, hooks = {}) {
  /** @type {Array<{key: string, fileName: string, lastModified: number, kind?: string, movies?: Array, error?: string, name: string}>} */
  let files = [];

  openModal("IMDb-Listen importieren", `
    <p class="meta import-intro">
      Bei IMDb deine Bewertungen, die Watchlist und jede eigene Liste öffnen,
      über das Menü <strong>⋯</strong> „Export" wählen und die fertigen Dateien unter
      <a class="external-link" href="https://www.imdb.com/exports/" target="_blank" rel="noreferrer">imdb.com/exports</a>
      herunterladen. Dann hier alle zusammen auswählen.
    </p>
    <label class="small-button import-label">CSV-Dateien auswählen
      <input id="imdb-files-input" type="file" accept=".csv,text/csv" multiple>
    </label>
    <datalist id="known-list-names">
      ${listFilterOptions(state.movies).map(name => `<option value="${escapeHtml(name)}">`).join("")}
    </datalist>
    <div class="import-files" id="import-files"></div>
    <p class="import-hint meta">
      Nichts wird gelöscht: Gesehen, Notizen und Cover bleiben erhalten. Das Medium
      kommt aus der Beschreibung deiner Sammlungsliste. Listen, die du diesmal nicht
      auswählst, bleiben unverändert.
    </p>
    ${canManageDownloads() ? `
      <label class="check-row import-delete-check">
        <input type="checkbox" id="delete-imported" ${state.deleteImportedFiles === false ? "" : "checked"}>
        Importierte Dateien danach aus dem Download-Ordner löschen
      </label>` : ""}
    <p class="status-line import-error" id="import-error" aria-live="polite"></p>
    <div class="form-actions">
      <button class="button secondary" type="button" id="cancel-import">Abbrechen</button>
      <button class="button" type="button" id="run-import">Importieren</button>
    </div>`);

  const list = $("#import-files");
  const errorLine = $("#import-error");

  const usable = () => files.filter(file => !file.error);

  // Wird die Bewertungsliste unter neuem Namen importiert, ersetzt sie die alte
  // (z. B. automatisch „Bewertungen" → dein „IMDB Bewertungen")
  const knownLists = new Set(state.movies.flatMap(movie => movie.imdbLists || []));
  const replacedBy = file => {
    if (file.error || file.kind !== "ratings") return [];
    const previous = state.ratingsListName || "Bewertungen";
    return previous !== file.name.trim() && knownLists.has(previous) ? [previous] : [];
  };

  const render = () => {
    list.innerHTML = files.map((file, index) => `
      <div class="import-file${file.error ? " has-error" : ""}">
        <div class="import-file-info">
          <strong>${escapeHtml(file.fileName)}</strong>
          <span class="meta">${file.error
            ? escapeHtml(file.error)
            : `${KIND_LABEL[file.kind]} · ${plural(file.movies.length, "Titel", "Titel")}`}</span>
          ${file.error ? "" : `<span class="meta import-file-preview">${escapeHtml(previewText(file.movies))}</span>`}
          ${replacedBy(file).length ? `<span class="meta import-file-recognized">Ersetzt die bisherige Liste „${escapeHtml(replacedBy(file)[0])}“</span>` : ""}
          ${file.recognized && file.name === file.recognized.name ? `<span class="meta import-file-recognized">Am Inhalt erkannt: ${Math.round(file.recognized.share * 100)} % wie „${escapeHtml(file.recognized.name)}“</span>` : ""}
        </div>
        ${file.error ? "" : `
          <label class="field import-file-name">Listenname
            <input type="text" data-index="${index}" value="${escapeHtml(file.name)}"
                   placeholder="z. B. Filmsammlung" autocomplete="off" list="known-list-names">
          </label>`}
        <button class="icon-button" type="button" data-remove="${index}"
                aria-label="${escapeHtml(file.fileName)} entfernen">×</button>
        ${!file.error && file.kind === "list" ? `
          <label class="check-row import-collection-check">
            <input type="checkbox" data-collection="${index}" ${file.isCollection ? "checked" : ""}>
            Das ist meine (physische) Sammlung: Medium kommt aus der Beschreibung
            („UHD", „Blu-ray", „DVD", „Digital"; sonst kein Medium)
          </label>` : ""}
      </div>`).join("");
    $("#run-import").textContent = usable().length > 1 ? `${usable().length} Listen importieren` : "Importieren";
  };

  // Die Sammlungsliste merkt sich das Dashboard: Häkchen automatisch setzen,
  // solange es nicht von Hand geändert wurde.
  const isKnownCollection = name =>
    Boolean(state.collectionListName) && name.trim().toLowerCase() === state.collectionListName.toLowerCase();

  list.addEventListener("input", event => {
    const nameIndex = event.target.dataset?.index;
    if (nameIndex !== undefined) {
      const file = files[Number(nameIndex)];
      file.name = event.target.value;
      if (!file.collectionTouched && file.kind === "list") {
        file.isCollection = isKnownCollection(file.name);
        const box = list.querySelector(`[data-collection="${nameIndex}"]`);
        if (box) box.checked = file.isCollection;
      }
      errorLine.textContent = "";
      return;
    }
    const collectionIndex = event.target.dataset?.collection;
    if (collectionIndex !== undefined) {
      files[Number(collectionIndex)].isCollection = event.target.checked;
      files[Number(collectionIndex)].collectionTouched = true;
    }
  });

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    files.splice(Number(button.dataset.remove), 1);
    render();
    $("#imdb-files-input").focus();
  });

  $("#imdb-files-input").onchange = async event => {
    const chosen = [...event.target.files];
    event.target.value = ""; // gleiche Datei erneut wählbar
    for (const file of chosen) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (files.some(entry => entry.key === key)) continue; // doppelt gewählt
      const entry = { key, fileName: file.name, lastModified: file.lastModified, size: file.size, name: "", isCollection: false };
      try {
        const parsed = parseImdbExport(await file.text());
        entry.kind = parsed.kind;
        entry.movies = parsed.movies;
        entry.name = suggestListName(file.name, parsed.kind);
        entry.size = file.size;
        // Bewertungen: gemerkter Name, sonst die bekannte Liste mit denselben Titeln
        if (parsed.kind === "ratings") {
          // Der automatische Name „Bewertungen" zählt dabei nicht mit - eine eigene
          // Liste mit (fast) denselben Titeln gewinnt, auch wenn ihr ein paar neue fehlen
          const withoutDefault = state.movies.map(movie => ({ ...movie, imdbLists: (movie.imdbLists || []).filter(name => name !== "Bewertungen") }));
          const match = state.ratingsListName ? null : recognizeList(parsed.movies, withoutDefault);
          entry.name = state.ratingsListName || match?.name || entry.name;
          if (match) entry.recognized = match;
        }
        // IMDb vergibt zufällige Dateinamen → Liste am Inhalt erkennen
        if (parsed.kind === "list") {
          const taken = new Set(files.map(other => other.name.trim().toLowerCase()));
          const match = recognizeList(parsed.movies, state.movies);
          if (match && !taken.has(match.name.toLowerCase())) {
            entry.name = match.name;
            entry.recognized = match;
          }
        }
        entry.isCollection = parsed.kind === "list" && isKnownCollection(entry.name);
      } catch (error) {
        entry.error = error.message || "Die Datei konnte nicht gelesen werden.";
      }
      files.push(entry);
    }
    errorLine.textContent = "";
    render();
    // Fokus in das erste leere Namensfeld, sonst bleibt er bei der Auswahl
    const empty = [...list.querySelectorAll("input[data-index]")].find(input => !input.value.trim());
    empty?.focus();
  };

  $("#cancel-import").onclick = closeModal;

  $("#run-import").onclick = async () => {
    const ready = usable();
    if (!ready.length) {
      errorLine.textContent = files.length
        ? "Keine der Dateien ist ein IMDb-Export."
        : "Bitte zuerst die CSV-Dateien auswählen.";
      return;
    }
    const problem = validateListNames(ready.map(file => file.name));
    if (problem) {
      errorLine.textContent = problem;
      const target = [...list.querySelectorAll("input[data-index]")]
        .find(input => !input.value.trim()) || list.querySelector("input[data-index]");
      target?.focus();
      return;
    }

    const button = $("#run-import");
    button.disabled = true;
    button.textContent = "Wird importiert …";
    try {
      const now = Date.now();
      const lists = ready.map(file => ({ name: file.name.trim(), movies: file.movies, isCollection: Boolean(file.isCollection), isRatings: file.kind === "ratings", replaces: replacedBy(file) }));
      const ratingsFile = ready.find(file => file.kind === "ratings");
      const result = mergeImdbLists(state.movies, lists, now);
      const dataAt = new Date(dataTimestamp(ready.map(file => file.lastModified), now)).toISOString();

      // Sammlungsliste merken (bzw. vergessen, wenn das Häkchen bewusst entfernt wurde)
      const marked = lists.find(item => item.isCollection);
      const unmarked = lists.some(item => !item.isCollection && isKnownCollection(item.name));
      const collectionListName = marked ? marked.name : unmarked ? "" : state.collectionListName || "";

      state.movies = result.movies;
      state.lastImdbImportAt = dataAt;
      state.importReminderSnoozedUntil = "";
      state.collectionListName = collectionListName;
      // Namen der Bewertungsliste merken
      if (ratingsFile) state.ratingsListName = ratingsFile.name.trim();
      await saveDashboardData({ movies: state.movies, lastImdbImportAt: dataAt, importReminderSnoozedUntil: "", collectionListName, ratingsListName: state.ratingsListName || "" });

      const rows = ready.reduce((sum, file) => sum + file.movies.length, 0);
      const parts = [
        `${plural(ready.length, "Liste", "Listen")} mit ${plural(rows, "Eintrag", "Einträgen")}`,
        `${result.added} neu`,
        `${result.updated} aktualisiert`,
        `${result.unchanged} unverändert`,
        `Datenstand ${formatDay(dataAt)}`,
      ];
      let summary = parts.join(" · ");
      if (result.detached) {
        summary += `. ${plural(result.detached, "Titel steht", "Titel stehen")} in keiner der importierten Listen mehr und ${result.detached === 1 ? "bleibt" : "bleiben"} erhalten.`;
      }
      const finish = () => {
        showToast(`Import fertig: ${result.added} neu, ${result.updated} aktualisiert.`, "success");
        hooks.onImported?.(result, summary);
      };
      const deleteFiles = $("#delete-imported")?.checked;
      closeModal();
      finish();
      if (deleteFiles !== undefined) {
        state.deleteImportedFiles = deleteFiles;
        await saveDashboardData({ deleteImportedFiles: deleteFiles });
      }
      if (deleteFiles) {
        const removed = await deleteImportedDownloads(ready.map(file => ({ name: file.fileName, size: file.size })));
        if (removed) showToast(`${plural(removed, "Exportdatei", "Exportdateien")} aus dem Download-Ordner gelöscht.`, "success");
      }
    } catch (error) {
      errorLine.textContent = error.message || "Der Import ist fehlgeschlagen.";
      button.disabled = false;
      render();
    }
  };

  render();
}

/** „Dune, Heat, Alien …" - die ersten Titel einer Datei, damit man sie ohne Namen erkennt. */
function previewText(movies) {
  const names = movies.slice(0, 3).map(movie => movie.title).filter(Boolean);
  return names.length ? `${names.join(", ")}${movies.length > names.length ? " …" : ""}` : "";
}
