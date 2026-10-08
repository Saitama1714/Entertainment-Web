import { $ } from "../utils/dom.js";
import { escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { showToast } from "../utils/toast.js";
import { INTRO_OPTIONS, CLICK_EFFECT_OPTIONS, CLICK_DURATION_OPTIONS } from "../utils/constants.js";
import { initLinkTransitions } from "./link-transition.js";
import { normalizeClickEffect, normalizeClickDuration } from "../logic/link-transition-logic.js";
import { initBrandMedallion } from "./brand-medallion.js";
import { openShortcutHelp, configureShortcutHelp } from "./shortcuts.js";
import { replayCurtain } from "./curtain.js";

/*
 * Kopfleiste aller Seiten: Logo-Medaillon, Design-Auswahl und der Dialog
 * „Ansicht" (wann der Kinovorhang spielt, Vorschau, Klick-Effekt, Tastenkürzel).
 * Schaltet außerdem den Kachel-Zoom beim Klick auf Links ein
 * (js/ui/link-transition.js, gemeinsam mit dem Dashboard).
 *
 * Alles hier gilt nur im Browser des jeweiligen Besuchers (localStorage) -
 * die Website selbst speichert nichts. js/boot.js liest dieselben Schlüssel
 * vor dem ersten Zeichnen.
 */

const KEYS = { theme: "site:theme", intro: "site:intro-mode", clickEffect: "site:click-effect", clickDuration: "site:click-duration" };
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

/**
 * Klick-Effekt des Besuchers. link-transition.js liest dieses Objekt bei
 * jedem Klick neu - Änderungen im Dialog wirken also sofort.
 */
const motion = {};
function loadMotion() {
  motion.clickEffect = normalizeClickEffect(read(KEYS.clickEffect, "zoom"));
  motion.clickDuration = normalizeClickDuration(Number(read(KEYS.clickDuration, "450")));
}

/** Dialog „Ansicht". Der Vorschau-Knopf erscheint nur auf der Hauptseite (mit Vorhang). */
function openViewSettings() {
  const intro = read(KEYS.intro, "visit");
  const hasCurtain = Boolean(document.querySelector(".curtain"));
  const options = (list, current) => list.map(option =>
    `<option value="${option.value}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");

  openModal("Ansicht", `
    <section class="form-section" aria-labelledby="view-curtain">
      <h2 id="view-curtain">Kinovorhang</h2>
      <div class="intro-picker">
        <label class="field">Wann er spielt
          <select id="intro-mode-select">${options(INTRO_OPTIONS, intro)}</select>
        </label>
        ${hasCurtain ? `<button class="small-button" type="button" id="curtain-preview-button">Vorschau abspielen</button>` : ""}
      </div>
      <p class="meta">Gilt nur in diesem Browser.</p>
    </section>
    <section class="form-section" aria-labelledby="view-motion">
      <h2 id="view-motion">Bewegung</h2>
      <fieldset class="choice-group">
        <legend>Klick-Effekt</legend>
        ${CLICK_EFFECT_OPTIONS.map(option => `
          <label class="choice">
            <input type="radio" name="click-effect" value="${option.value}" ${motion.clickEffect === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <fieldset class="choice-group" id="click-duration-group" ${motion.clickEffect === "off" ? "disabled" : ""}>
        <legend>Tempo</legend>
        ${CLICK_DURATION_OPTIONS.map(option => `
          <label class="choice">
            <input type="radio" name="click-duration" value="${option.value}" ${motion.clickDuration === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <p class="meta">Beim Öffnen eines Titels und beim Wechsel zurück zur Sammlung. Gilt nur in diesem Browser.</p>
    </section>
    <section class="form-section" aria-labelledby="view-keys">
      <h2 id="view-keys">Bedienung</h2>
      <button class="small-button" type="button" id="show-shortcuts">Tastenkürzel anzeigen</button>
    </section>`);

  $("#intro-mode-select").onchange = event => {
    write(KEYS.intro, event.target.value);
    showToast("Gilt ab dem nächsten Besuch.", "success");
  };
  const preview = $("#curtain-preview-button");
  if (preview) preview.onclick = () => { closeModal(); replayCurtain(); };
  $("#show-shortcuts").onclick = () => { closeModal(); openShortcutHelp(); };
  for (const radio of document.querySelectorAll('.modal input[name="click-effect"]')) {
    radio.onchange = () => {
      motion.clickEffect = radio.value;
      write(KEYS.clickEffect, radio.value);
      $("#click-duration-group").disabled = radio.value === "off";
      showToast(radio.value === "off" ? "Klick-Effekt ausgeschaltet." : "Klick-Effekt gespeichert.", "success");
    };
  }
  for (const radio of document.querySelectorAll('.modal input[name="click-duration"]')) {
    radio.onchange = () => {
      motion.clickDuration = Number(radio.value);
      write(KEYS.clickDuration, radio.value);
      showToast("Tempo gespeichert.", "success");
    };
  }
}

/** Verdrahtet die Kopfleiste. Einmal pro Seite aufrufen. */
export function initSiteShell() {
  initBrandMedallion();
  loadMotion();
  initLinkTransitions(motion);
  configureShortcutHelp({ list: "Sammlung", newTabNote: false });

  const select = $("#theme-select");
  if (select) {
    select.value = read(KEYS.theme, "dark");
    select.onchange = () => { write(KEYS.theme, select.value); applyTheme(select.value); };
  }
  darkQuery.addEventListener("change", () => { if (read(KEYS.theme, "dark") === "system") applyTheme("system"); });

  const settings = $("#view-button");
  if (settings) settings.onclick = openViewSettings;
}
