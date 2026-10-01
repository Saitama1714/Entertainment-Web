import { buildPublicData, summarize, defaultOptions, OPTIONAL_GROUPS } from "../tools/publish-logic.js";
import { initSiteShell } from "../ui/site-shell.js";
import { $, escapeHtml } from "../utils/dom.js";
import { formatDay } from "../utils/format.js";
import { showToast } from "../utils/toast.js";

/*
 * Werkzeug (werkzeug.html): Dashboard-Sicherung → data/sammlung.json.
 * Die eigentliche Umwandlung (Positivliste der Felder) steht in
 * js/tools/publish-logic.js. Die Seite wird mit veröffentlicht, ist aber
 * nirgends verlinkt und tut nichts ohne eine Sicherung, die man selbst wählt.
 */

let backup = null;
const options = defaultOptions();

function renderOptions() {
  $("#tool-options").insertAdjacentHTML("beforeend", OPTIONAL_GROUPS.map(group => `
    <label class="tool-option">
      <input type="checkbox" value="${group.key}" ${options[group.key] ? "checked" : ""}>
      <span>${escapeHtml(group.label)}</span>
    </label>`).join(""));
  $("#tool-options").addEventListener("change", event => {
    if (event.target.type !== "checkbox") return;
    options[event.target.value] = event.target.checked;
    updateResult();
  });
}

/** Vorschau: wie viele Titel, was kommt mit. */
function updateResult() {
  const button = $("#download-button");
  if (!backup) { button.disabled = true; return; }
  const data = buildPublicData(backup, options);
  const info = summarize(data);
  button.disabled = info.total === 0;
  $("#result-status").textContent = info.total === 0
    ? "Die Sicherung enthält keine Titel."
    : `${info.total} Titel (${info.withCover} mit Cover)${info.labels.length ? `, dazu: ${info.labels.join(", ")}` : ", ohne persönliche Angaben"}.`;
}

async function onFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    buildPublicData(parsed, options); // prüft das Format, wirft verständliche Fehler
    backup = parsed;
    const day = formatDay(parsed.exportedAt);
    $("#backup-status").textContent = `„${file.name}“ geladen${day ? ` (Sicherung vom ${day})` : ""}.`;
  } catch (error) {
    backup = null;
    $("#backup-status").textContent = error instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : error.message;
  }
  updateResult();
}

function download() {
  const data = buildPublicData(backup, options);
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "sammlung.json" });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast("sammlung.json gespeichert.", "success");
}

initSiteShell();
renderOptions();
$("#backup-input").onchange = onFile;
$("#download-button").onclick = download;
