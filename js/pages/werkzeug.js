import { buildPublicData, summarize, defaultOptions, OPTIONAL_GROUPS } from "../tools/publish-logic.js";
import { createAccess, readAccess } from "../tools/access-logic.js";
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

/*
 * Passwort: Das Werkzeug merkt sich in diesem Browser den letzten Prüfwert
 * (nie das Passwort), damit man es nicht bei jeder neuen Datei wieder
 * eingeben muss. Leeres Feld = bisheriges Passwort behalten.
 */
const ACCESS_KEY = "tool:access";
let storedAccess = null;
try { storedAccess = readAccess(JSON.parse(localStorage.getItem(ACCESS_KEY) || "null")); } catch { /* ohne Speicher */ }

/** Was mit dem Passwort passiert - und ob gespeichert werden kann. */
function accessState() {
  const enabled = $("#access-enabled").checked;
  const typed = $("#access-password").value.trim();
  if (!enabled) return { ready: true, text: "Ohne Passwort – die Sammlung ist sofort sichtbar." };
  if (typed) return { ready: true, text: storedAccess ? "Das neue Passwort ersetzt das bisherige." : "Die Website bekommt dieses Passwort." };
  if (storedAccess) return { ready: true, text: "Es bleibt beim bisherigen Passwort. Für ein neues hier eintippen." };
  return { ready: false, text: "Bitte ein Passwort eingeben." };
}

function renderAccess() {
  $("#access-field").hidden = !$("#access-enabled").checked;
  $("#access-status").textContent = accessState().text;
  updateResult();
}

/** Prüfwert für die Datei: neu aus dem Feld, sonst der gemerkte, oder keiner. */
async function currentAccess() {
  if (!$("#access-enabled").checked) return null;
  const typed = $("#access-password").value.trim();
  if (!typed) return storedAccess;
  storedAccess = await createAccess(typed);
  try { localStorage.setItem(ACCESS_KEY, JSON.stringify(storedAccess)); } catch { /* nur für diese Sitzung */ }
  $("#access-password").value = "";
  renderAccess();
  return storedAccess;
}

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
  const access = accessState();
  button.disabled = info.total === 0 || !access.ready;
  $("#result-status").textContent = info.total === 0
    ? "Die Sicherung enthält keine Titel."
    : `${info.total} Titel (${info.withCover} mit Cover)${info.labels.length ? `, dazu: ${info.labels.join(", ")}` : ", ohne persönliche Angaben"}${$("#access-enabled").checked ? ", mit Passwort" : ""}.`;
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

async function download() {
  let access;
  try {
    access = await currentAccess();
  } catch (error) {
    showToast(error.message || "Das Passwort konnte nicht verarbeitet werden.", "error");
    return;
  }
  const data = buildPublicData(backup, options, { access });
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
$("#access-enabled").checked = Boolean(storedAccess);
$("#access-enabled").onchange = renderAccess;
$("#access-password").oninput = renderAccess;
renderAccess();
$("#backup-input").onchange = onFile;
$("#download-button").onclick = download;
