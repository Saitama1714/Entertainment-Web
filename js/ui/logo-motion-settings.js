import { escapeHtml } from "../utils/dom.js";
import { LOGO_MODES, LOGO_EFFECTS, LOGO_TEMPOS, readLogoMotion } from "../logic/logo-motion-logic.js";

/*
 * Block „Logo-Animation" - im Dashboard unter Einstellungen → Bewegung
 * (js/ui/settings-modal.js), auf der Website im Dialog „Ansicht"
 * (js/site/site-shell.js). Wann, was sich bewegt, Tempo, Vorschau.
 */

/** Markup des Blocks. */
export function logoMotionSettingsHtml(value) {
  const motion = readLogoMotion(value);
  const off = motion.mode === "off";
  return `
    <div class="logo-motion" id="logo-motion">
      <div class="intro-picker">
        <label class="field">Logo-Animation
          <select id="logo-mode-select">
            ${LOGO_MODES.map(option => `<option value="${option.value}" ${motion.mode === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
          </select>
        </label>
        <button class="small-button" type="button" id="logo-preview-button" ${off ? "disabled" : ""}>Vorschau abspielen</button>
      </div>
      <fieldset class="choice-group" id="logo-effects-group" ${off ? "disabled" : ""}>
        <legend>Was sich bewegt</legend>
        ${LOGO_EFFECTS.map(option => `
          <label class="choice" title="${escapeHtml(option.note)}">
            <input type="checkbox" name="logo-effect" value="${option.value}" ${motion.effects.includes(option.value) ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <fieldset class="choice-group" id="logo-tempo-group" ${off ? "disabled" : ""}>
        <legend>Tempo</legend>
        ${LOGO_TEMPOS.map(option => `
          <label class="choice">
            <input type="radio" name="logo-tempo" value="${option.value}" ${motion.tempo === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <p class="meta">Das Medaillon oben links: Filmrollen, Projektorlicht und Messing-Glanz. „Beim Öffnen" spielt auf jeder Seite einmal. Mit „Bewegung reduzieren" im System bleibt es ruhig.</p>
    </div>`;
}

/**
 * Verdrahtet den Block.
 * @param {HTMLElement} root - enthält #logo-motion.
 * @param {*} value - aktuelle Einstellung.
 * @param {(motion: object, info: {preview: boolean, what: string}) => void} onChange
 *   - nach jeder Änderung (gespeichert wird dort); preview: gleich zeigen.
 */
export function bindLogoMotionSettings(root, value, onChange) {
  let motion = readLogoMotion(value);
  const block = root.querySelector("#logo-motion");
  const sync = () => {
    const off = motion.mode === "off";
    block.querySelector("#logo-effects-group").disabled = off;
    block.querySelector("#logo-tempo-group").disabled = off;
    block.querySelector("#logo-preview-button").disabled = off || !motion.effects.length;
  };
  const change = (patch, what) => {
    motion = readLogoMotion({ ...motion, ...patch });
    sync();
    onChange(motion, { preview: motion.mode !== "off", what });
  };
  block.querySelector("#logo-mode-select").addEventListener("change", event => change({ mode: event.target.value }, "mode"));
  for (const box of block.querySelectorAll('input[name="logo-effect"]')) {
    box.addEventListener("change", () => change({ effects: [...block.querySelectorAll('input[name="logo-effect"]:checked')].map(input => input.value) }, "effects"));
  }
  for (const radio of block.querySelectorAll('input[name="logo-tempo"]')) {
    radio.addEventListener("change", () => change({ tempo: radio.value }, "tempo"));
  }
  block.querySelector("#logo-preview-button").addEventListener("click", () => onChange(motion, { preview: true, what: "preview" }));
  sync();
}
