import { $ } from "../utils/dom.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { INTRO_OPTIONS, CURTAIN_STYLES } from "../utils/constants.js";
import { normalizeCurtainStyle } from "../logic/curtain-motion.js";
import { initBrandMedallion } from "./brand-medallion.js";
import { openShortcutHelp } from "./shortcuts.js";
import { replayCurtain } from "./curtain.js";

/*
 * Kopfleiste aller Seiten: Logo-Medaillon, Design-Auswahl und der Dialog
 * „Ansicht" (Kinovorhang, Vorhang-Animation, Tastenkürzel).
 *
 * Alles hier gilt nur im Browser des jeweiligen Besuchers (localStorage) -
 * die Website selbst speichert nichts. js/boot.js liest dieselben Schlüssel
 * vor dem ersten Zeichnen.
 */

const KEYS = { theme: "site:theme", intro: "site:intro-mode", curtain: "site:curtain-style" };
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Liest eine Einstellung; ohne Speicher (privates Fenster o. Ä.) gilt der Standard. */
function read(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

/** Schreibt eine Einstellung; scheitert das, gilt sie eben nur bis zum Neuladen. */
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* nichts zu tun */ }
}

/** Setzt hell/dunkel auf das Dokument („System" folgt dem Betriebssystem). */
function applyTheme(theme) {
  const dark = theme === "dark" || (theme === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Dialog „Ansicht". Der Vorschau-Knopf erscheint nur auf der Hauptseite (mit Vorhang). */
function openViewSettings() {
  const intro = read(KEYS.intro, "visit");
  const curtain = normalizeCurtainStyle(read(KEYS.curtain, "fabric"));
  const hasCurtain = Boolean(document.querySelector(".curtain"));
  const options = (list, current) => list.map(option =>
    `<option value="${option.value}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");

  openModal("Ansicht", `
    <section class="form-section" aria-labelledby="view-curtain">
      <h2 id="view-curtain">Kinovorhang</h2>
      <label class="field">Wann er spielt
        <select id="intro-mode-select">${options(INTRO_OPTIONS, intro)}</select>
      </label>
      <div class="curtain-style-picker">
        <label class="field">Vorhang-Animation
          <select id="curtain-style-select">${options(CURTAIN_STYLES, curtain)}</select>
        </label>
        ${hasCurtain ? `<button class="small-button" type="button" id="curtain-preview-button">Vorschau abspielen</button>` : ""}
      </div>
      <p class="meta">Gilt nur in diesem Browser.</p>
    </section>
    <section class="form-section" aria-labelledby="view-keys">
      <h2 id="view-keys">Bedienung</h2>
      <button class="small-button" type="button" id="show-shortcuts">Tastenkürzel anzeigen</button>
    </section>`);

  $("#intro-mode-select").onchange = event => {
    write(KEYS.intro, event.target.value);
    showToast("Gilt ab dem nächsten Besuch.", "success");
  };
  $("#curtain-style-select").onchange = event => {
    write(KEYS.curtain, event.target.value);
    showToast("Vorhang-Animation gespeichert.", "success");
  };
  const preview = $("#curtain-preview-button");
  if (preview) preview.onclick = () => { closeModal(); replayCurtain(read(KEYS.curtain, "fabric")); };
  $("#show-shortcuts").onclick = () => { closeModal(); openShortcutHelp(); };
}

/** Verdrahtet die Kopfleiste. Einmal pro Seite aufrufen. */
export function initSiteShell() {
  initBrandMedallion();

  const select = $("#theme-select");
  if (select) {
    select.value = read(KEYS.theme, "dark");
    select.onchange = () => { write(KEYS.theme, select.value); applyTheme(select.value); };
  }
  darkQuery.addEventListener("change", () => { if (read(KEYS.theme, "dark") === "system") applyTheme("system"); });

  const settings = $("#view-button");
  if (settings) settings.onclick = openViewSettings;
}
