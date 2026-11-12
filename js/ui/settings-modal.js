import { IMPORT_WINDOW_OPTIONS, IMPORT_WINDOW_DAYS, setImportWindowDays, missingCovers } from "../logic/movies-logic.js";
import { $, escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { saveDashboardData, importDashboard, getDashboardData, syncBootMirror } from "../storage.js";
import { showToast } from "../utils/toast.js";
import { REMINDER_OPTIONS, INTRO_OPTIONS, CLICK_EFFECT_OPTIONS, CLICK_DURATION_OPTIONS } from "../utils/constants.js";
import { normalizeClickEffect, normalizeClickDuration } from "../logic/link-transition-logic.js";
import { renderImportReminder } from "./import-reminder.js";
import { formatDay, ageLabel } from "../utils/format.js";
import { reminderStatus } from "../logic/imdb-import-logic.js";
import { coverStoreStatus, requestCoverOrigins, storeMissingCovers } from "../cover-store.js";
import { replayCurtain } from "./curtain.js";
import { openShortcutHelp } from "./shortcuts.js";
import { downloadBackup, backupReminderStatus, renderBackupReminder } from "./backup.js";
import { runAutoBackup } from "./auto-backup.js";
import { OPTIONAL_GROUPS, defaultOptions } from "../logic/publish-logic.js";
import { createAccess, readAccess } from "../logic/access-logic.js";
import { AUTO_BACKUP_FOLDER, AUTO_BACKUP_KEEP } from "../logic/auto-backup-logic.js";
import { readCastData, castStatus, dropEmptyCast } from "../logic/cast-logic.js";
import { readCastFetch, enableCastFetch, disableCastFetch, castFetchActive } from "../cast-fetch.js";
import { logoMotionSettingsHtml, bindLogoMotionSettings } from "./logo-motion-settings.js";
import { UNIVERSE_INTRO_OPTIONS, DEFAULT_UNIVERSE_INTRO } from "../logic/universe-logic.js";
import { DEFAULT_DUEL_INTRO } from "../logic/duel-logic.js";
import { BUILD_STYLES, BUILD_INTRO_OPTIONS, DEFAULT_BUILD_INTRO, readBuildStyle } from "../logic/page-build-logic.js";
import { previewPageBuild } from "./page-build.js";
import { setLogoMotion } from "./brand-medallion.js";
import { applyTheme } from "./app-shell.js";
import { readDesign, FOYER_MIN_WIDTH } from "../logic/foyer-logic.js";

/** Ist gerade das Foyer zu sehen (gewählt und Fenster breit genug)? Dann gibt es kein Hell/Dunkel. */
const foyerShown = state => readDesign(state.design) === "foyer" && window.innerWidth >= FOYER_MIN_WIDTH;

/** Hell/Dunkel im Foyer ausgrauen, mit Hinweis (Nutzerwunsch 08.11.2026). */
function syncThemeField(state) {
  const shown = foyerShown(state);
  const select = $("#settings-theme-select");
  if (select) select.disabled = shown;
  const note = $("#settings-theme-note");
  if (note) note.hidden = !shown;
}

/** Auswahl „Design": Kino-Noir oder Foyer (2.41), mit kleinem Vorschaubild. */
function designPickerHtml(state) {
  const design = readDesign(state.design);
  const option = (value, name, desc) => `
        <label class="design-option">
          <input type="radio" name="design" value="${value}" ${design === value ? "checked" : ""}>
          <span class="design-preview is-${value}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span class="design-name">${name}</span>
          <span class="design-desc">${desc}</span>
        </label>`;
  return `
      <fieldset class="design-picker">
        <legend>Design</legend>
        <div class="design-options">
          ${option("noir", "Kino-Noir", "Klassisch: Kopfleiste und Reiter")}
          ${option("foyer", "Foyer", "Verspielt: Spule, Programmtafel, Säle")}
        </div>
      </fieldset>
      <p class="meta">Am Handy und in schmalen Fenstern (unter ${FOYER_MIN_WIDTH} px) erscheint immer Kino-Noir; wer dort die Desktop-Ansicht wählt, sieht das Foyer. Das Foyer ist immer dunkel.</p>
      <label class="field" id="settings-theme-field">Hell oder dunkel (Kino-Noir)
        <select id="settings-theme-select" ${foyerShown(state) ? "disabled" : ""} aria-describedby="settings-theme-note">
          ${[["dark", "Dunkel"], ["light", "Hell"], ["system", "Wie das System"]].map(([value, label]) =>
            `<option value="${value}" ${state.theme === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <span class="field-note" id="settings-theme-note" ${foyerShown(state) ? "" : "hidden"}>Das Foyer ist immer dunkel – Hell oder Dunkel gilt nur für Kino-Noir (z. B. am Handy).</span>
      </label>`;
}

/**
 * Sprungleiste links (beide Designs, seit 2.41.4): ein Eintrag je Abschnitt,
 * leuchtet beim Scrollen mit. Im Foyer heißen die Einstellungen „Vorführraum"
 * und die Einträge tragen Lampen.
 */
function buildSettingsNav() {
  const modal = document.querySelector(".modal");
  if (!modal) return;
  const foyer = document.documentElement.dataset.skin === "foyer";
  modal.classList.add("modal--settings");
  if (foyer) {
    modal.classList.add("modal--foyer");
    const heading = modal.querySelector(".modal-header h2");
    if (heading) heading.textContent = "Vorführraum";
    modal.setAttribute("aria-label", "Vorführraum – Einstellungen");
  }
  const sections = [...modal.querySelectorAll(".form-section > h2[id]")];
  const content = modal.querySelector(".modal-content");
  content.insertAdjacentHTML("afterbegin", `<nav class="settings-nav${foyer ? " foyer-settings-nav" : ""}" aria-label="Abschnitte">${sections.map(h2 =>
    `<button type="button" class="settings-jump${foyer ? " foyer-settings-jump" : ""}" data-jump="${h2.id}">${foyer ? `<span class="foyer-lamp" aria-hidden="true"></span>` : ""}${escapeHtml(h2.textContent)}</button>`).join("")}</nav>`);
  const jumps = [...content.querySelectorAll(".settings-jump")];
  const nav = content.querySelector(".settings-nav");
  const navIsRow = () => getComputedStyle(nav).flexDirection === "row"; // schmale Fenster: Leiste oben
  const light = id => jumps.forEach(jump => {
    const on = jump.dataset.jump === id;
    jump.classList.toggle("is-current", on);
    if (on) jump.setAttribute("aria-current", "true"); else jump.removeAttribute("aria-current");
    // Leiste als Zeile: den aktuellen Eintrag ins Bild holen (nur waagerecht)
    if (on && navIsRow()) nav.scrollLeft = Math.max(0, jump.offsetLeft - (nav.clientWidth - jump.offsetWidth) / 2);
  });
  light(sections[0]?.id);
  let jumping = 0;
  content.addEventListener("click", event => {
    const jump = event.target.closest(".settings-jump");
    if (!jump) return;
    const target = document.getElementById(jump.dataset.jump)?.closest(".form-section");
    if (!target) return;
    jumping = Date.now();
    const offset = navIsRow() ? nav.offsetHeight + 12 : 4;
    content.scrollTo({ top: target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - offset, behavior: "smooth" });
    light(jump.dataset.jump);
  });
  // Mitleuchten beim Scrollen: der Abschnitt, dessen Kopf zuletzt oben vorbeikam
  content.addEventListener("scroll", () => {
    if (Date.now() - jumping < 700) return;
    const top = content.getBoundingClientRect().top + (navIsRow() ? nav.offsetHeight : 0) + 80;
    let current = sections[0];
    for (const h2 of sections) if (h2.getBoundingClientRect().top <= top) current = h2;
    if (content.scrollTop + content.clientHeight >= content.scrollHeight - 4) current = sections[sections.length - 1];
    light(current?.id);
  }, { passive: true });
}

/** „12 Titel ohne Cover, davon 3 ohne IMDb-Kennung · Titel zeigen" (2.42.3). */
function coverGapsHtml(state) {
  const { ids, withoutImdb } = missingCovers(state.movies);
  if (!(state.movies || []).length) return "Noch keine Titel.";
  if (!ids.length) return "Alle Titel haben ein Cover.";
  const n = ids.length.toLocaleString("de-DE");
  const href = `${location.pathname.includes("/views/") ? "" : "views/"}movies.html?cover=missing`;
  const extra = withoutImdb
    ? `, davon ${withoutImdb.toLocaleString("de-DE")} ohne IMDb-Kennung (die lädt „Fehlende Cover laden“ nicht – dort hilft „Cover ändern“ auf der Detailseite)`
    : "";
  return `<strong>${n} ${ids.length === 1 ? "Titel" : "Titel"} ohne Cover</strong>${extra}. <a class="external-link" id="cover-gaps-link" href="${href}">Titel zeigen</a>`;
}

/** Werkzeuge der Kinothek: auf Entertainment direkt, sonst dorthin mit ?tool=… */
const TOOLS = [
  { key: "import", id: "imdb-import-button", label: "IMDb-Listen importieren …", primary: true },
  { key: "covers", id: "fetch-covers-button", label: "Fehlende Cover laden" },
  { key: "seen", id: "seen-cleanup-button", label: "Gesehen mit IMDb abgleichen …" },
  { key: "orphans", id: "orphan-cleanup-button", label: "Titel ohne IMDb-Liste aufräumen …" },
];
const toolButton = key => {
  const tool = TOOLS.find(item => item.key === key);
  return `<button class="${tool.primary ? "button" : "small-button"}" type="button" id="${tool.id}" data-tool="${tool.key}">${escapeHtml(tool.label)}</button>`;
};

/** "Datenstand: 22.09.2026 (vor 3 Tagen)" oder Hinweis, dass noch nichts importiert wurde. */
function importStatusText(state) {
  const { never, ageDays } = reminderStatus(state, Date.now());
  return never ? "Noch kein IMDb-Import mit Datenstand." : `Datenstand: ${formatDay(state.lastImdbImportAt)} (${ageLabel(ageDays)})`;
}

/** "Letzte Sicherung: 22.09.2026 (vor 3 Tagen)" oder Hinweis, dass es noch keine gibt. */
function backupStatusText(state) {
  const { never, ageDays } = backupReminderStatus(state, Date.now());
  return never ? "Noch keine Sicherung gespeichert." : `Letzte Sicherung: ${formatDay(state.lastBackupAt)} (${ageLabel(ageDays)})`;
}

/** Häkchen für die Website-Datei: gespeicherte Auswahl über den Standard gelegt. */
const websiteOptions = state => ({ ...defaultOptions(), ...(state.websiteOptions || {}) });

/** Optionen der Auswahl; ein gespeicherter Wert außerhalb der Liste bleibt wählbar. */
function reminderOptions(current) {
  const value = Number(current);
  if (!Number.isFinite(value) || REMINDER_OPTIONS.some(option => option.value === value)) return REMINDER_OPTIONS;
  return [...REMINDER_OPTIONS, { value, label: `Nach ${value} Tagen` }];
}

/**
 * Einstellungen-Dialog (seit 2.41.4 neu geordnet) in fünf Abschnitten mit
 * Sprungleiste: Erscheinungsbild, Bewegung, Entertainment (IMDb-Daten,
 * Aufräumen, Cover und Besetzung), Sicherung, Website. Auf jeder Seite über
 * die Kopfleiste (Foyer: Wegweiser → Vorführraum) erreichbar.
 * @param {object} state - wird bei Änderungen mutiert.
 * @param {Function} [onImported] - Callback nach erfolgreichem Laden einer Sicherung.
 * @param {Record<string, Function>} [tools] - Werkzeuge der Kinothek, wenn die
 *   Seite sie selbst ausführt (Entertainment); sonst führt ein Klick dorthin.
 */
export function openSettingsModal(state, onImported, tools = null) {
  const hasCurtain = Boolean(document.querySelector(".curtain")); // Übersicht und Entertainment
  const onHome = Boolean(document.querySelector("#movie-preview")); // Aufbau gibt es nur auf der Übersicht
  const choiceSelect = (id, options, current) => `<select id="${id}">${options.map(option =>
    `<option value="${option.value}" ${current === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select>`;
  openModal("Einstellungen", `
    <section class="form-section" aria-labelledby="settings-appearance">
      <h2 id="settings-appearance">Erscheinungsbild</h2>
      <p class="settings-lead">Wie das Dashboard aussieht.</p>
      ${designPickerHtml(state)}
      <div class="intro-picker">
        <label class="field intro-field">Kinovorhang
          ${choiceSelect("intro-mode-select", INTRO_OPTIONS, state.introMode)}
        </label>
        ${hasCurtain ? `<button class="small-button" type="button" id="curtain-preview-button">Vorschau abspielen</button>` : ""}
      </div>
      <p class="meta">${hasCurtain
        ? "Die Vorschau spielt den Vorhang hier auf dieser Seite ab; danach geht es hierher zurück."
        : "Eine Vorschau gibt es auf der Übersicht und unter Entertainment."}</p>
      <label class="check-row">
        <input type="checkbox" id="projector-dust-check" ${state.projectorDust === false ? "" : "checked"}>
        Lichtkegel mit Staub im Kopf der Übersicht
      </label>
      <div class="form-section-actions">
        <button class="small-button" type="button" id="show-shortcuts">Tastenkürzel anzeigen</button>
      </div>
    </section>

    <section class="form-section" aria-labelledby="settings-motion">
      <h2 id="settings-motion">Bewegung</h2>
      <p class="settings-lead">Animationen beim Öffnen der Übersicht, beim Klicken, am Logo und beim Öffnen einzelner Reiter. Mit „Bewegung reduzieren“ im System bleibt alles ruhig.</p>
      <h3 class="settings-subhead">Klick-Effekt</h3>
      <fieldset class="choice-group">
        <legend class="visually-hidden">Klick-Effekt</legend>
        ${CLICK_EFFECT_OPTIONS.map(option => `
          <label class="choice">
            <input type="radio" name="click-effect" value="${option.value}" ${normalizeClickEffect(state.clickEffect) === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <fieldset class="choice-group" id="click-duration-group" ${normalizeClickEffect(state.clickEffect) === "off" ? "disabled" : ""}>
        <legend>Tempo</legend>
        ${CLICK_DURATION_OPTIONS.map(option => `
          <label class="choice">
            <input type="radio" name="click-duration" value="${option.value}" ${normalizeClickDuration(state.clickDuration) === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("")}
      </fieldset>
      <p class="meta">Beim Öffnen von Favoriten, Lesezeichen und beim Wechsel zwischen den Seiten; die Seite öffnet, sobald die Animation durch ist. Mit „Aus“ öffnet ein Klick sofort. Cover fliegen beim Öffnen eines Titels direkt zur Detailseite.</p>

      <h3 class="settings-subhead" id="settings-build">Aufbau der Übersicht</h3>
      <div class="settings-pair">
        <label class="field intro-field">Stil
          ${choiceSelect("build-style-select", BUILD_STYLES, readBuildStyle(state.buildStyle))}
        </label>
        <label class="field intro-field">Wann
          ${choiceSelect("build-intro-select", BUILD_INTRO_OPTIONS, state.buildIntro || DEFAULT_BUILD_INTRO)}
        </label>
      </div>
      <div class="form-section-actions">
        ${onHome ? `<button class="small-button" type="button" id="build-preview-button">Vorschau abspielen</button>` : ""}
      </div>
      <p class="meta">Beim Öffnen baut sich die Übersicht Stück für Stück auf (gut 1 Sekunde). Saallicht und Neon: Die Lichter gehen nacheinander an, die Leuchtreklame flackert an. Lichtkegel: Der Projektor im Logo wirft die Seite auf die Leinwand. Filmstreifen: Die Bereiche laufen ein wie Bilder durchs Bildfenster. Die beiden Kombinationen verbinden Lichtkegel mit Saallicht und Filmstreifen mit Neon. Im Foyer zünden dabei die Buchstaben der Programmtafel einzeln. Spielt auch der Kinovorhang, folgt der Aufbau, wenn er offen ist; ein Klick beendet ihn sofort.${onHome ? "" : " Eine Vorschau gibt es auf der Übersicht."}</p>

      <h3 class="settings-subhead">Logo</h3>
      ${logoMotionSettingsHtml(state.logoMotion)}

      <h3 class="settings-subhead">Auftritte unter Entertainment</h3>
      <div class="settings-pair">
        <label class="field intro-field">Urknall im Filmuniversum
          ${choiceSelect("universe-intro-select", UNIVERSE_INTRO_OPTIONS, state.universeIntro || DEFAULT_UNIVERSE_INTRO)}
        </label>
        <label class="field intro-field">Auftritt in „Du gegen IMDb“
          ${choiceSelect("duel-intro-select", UNIVERSE_INTRO_OPTIONS, state.duelIntro || DEFAULT_DUEL_INTRO)}
        </label>
      </div>
      <p class="meta">Urknall: Die Sterne fliegen aus der Mitte an ihren Platz. Auftritt: Die Titel fliegen aus beiden Ecken ins Feld, der Ring füllt sich, der Stempel fällt.</p>
    </section>

    <section class="form-section" aria-labelledby="settings-entertainment">
      <h2 id="settings-entertainment">Entertainment</h2>
      <p class="settings-lead">Deine Kinothek: Daten aus IMDb, Aufräumen, Cover und Besetzung.</p>

      <h3 class="settings-subhead">IMDb-Daten</h3>
      <div class="settings-status-row">
        <p class="meta" id="imdb-data-status">${escapeHtml(importStatusText(state))}</p>
        ${toolButton("import")}
      </div>
      <div class="settings-pair">
        <label class="field reminder-field">An neuen Export erinnern
          ${choiceSelect("reminder-select", reminderOptions(state.importReminderDays), Number(state.importReminderDays))}
        </label>
        <label class="field reminder-field">Filter „Import“ zeigt die letzten
          ${choiceSelect("import-window-select", IMPORT_WINDOW_OPTIONS, Number(state.importWindowDays || IMPORT_WINDOW_DAYS))}
        </label>
      </div>
      <label class="check-row">
        <input type="checkbox" id="sort-downloads-check" ${state.sortImdbDownloads === false ? "" : "checked"}>
        IMDb-Exporte beim Herunterladen im Unterordner „IMDb-Exporte“ ablegen
      </label>

      <h3 class="settings-subhead">Aufräumen</h3>
      <p class="meta">Zeigt erst eine Liste zum Prüfen – geändert wird nur, was du bestätigst.</p>
      <div class="form-section-actions">
        ${toolButton("seen")}
        ${toolButton("orphans")}
      </div>

      <h3 class="settings-subhead">Cover und Besetzung (OMDb)</h3>
      <form id="settings-form" class="settings-key">
        <div class="field">
          <label for="omdb-key">OMDb-Schlüssel</label>
          <div class="settings-key-row">
            <input id="omdb-key" name="omdbApiKey" type="text" autocomplete="off"
                   value="${escapeHtml(state.omdbApiKey || "")}" placeholder="a1b2c3d4">
            <button class="small-button" type="submit">Speichern</button>
          </div>
          <p class="field-note">Kostenlos anfordern auf
            <a class="external-link" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">omdbapi.com</a>. Damit lädt das Dashboard Cover, Besetzung und weitere Angaben.</p>
        </div>
      </form>
      <div class="settings-status-row">
        <p class="meta" id="cover-gaps">${coverGapsHtml(state)}</p>
        ${toolButton("covers")}
      </div>
      <p class="meta" id="cover-store-status">Cover offline: wird gezählt …</p>
      <p class="meta">Besetzung für das Filmuniversum und die Detailseite: Darsteller und Drehbuch kommen von OMDb (rund 1.000 Abrufe am Tag); der erste Durchlauf dauert bei vielen Titeln mehrere Tage und geht von selbst weiter, solange Entertainment offen ist. Cover haben Vorrang.</p>
      <div class="cast-fetch" id="cast-fetch" aria-live="polite"></div>
    </section>

    <section class="form-section" aria-labelledby="settings-data">
      <h2 id="settings-data">Sicherung</h2>
      <p class="settings-lead">Design, Favoriten und alle Einträge unter Entertainment als Datei. Die Lesezeichen selbst bleiben in Chrome.</p>
      <div class="settings-status-row">
        <p class="meta" id="backup-status">${escapeHtml(backupStatusText(state))}</p>
        <div class="form-section-actions">
          <button class="small-button" type="button" id="export-button">Sicherung speichern</button>
          <label class="small-button import-label">Sicherung laden
            <input id="import-input" type="file" accept="application/json" aria-label="Sicherungsdatei auswählen">
          </label>
        </div>
      </div>
      <p class="status-line" id="settings-status" aria-live="polite"></p>
      <label class="field reminder-field">An Sicherung erinnern
        ${choiceSelect("backup-reminder-select", reminderOptions(state.backupReminderDays), Number(state.backupReminderDays))}
      </label>

      <h3 class="settings-subhead">Automatisch sichern</h3>
      <label class="check-row">
        <input type="checkbox" id="auto-backup-check" ${state.autoBackup === false ? "" : "checked"}>
        Nach jedem IMDb-Import und jeder Änderung an Titeln
      </label>
      <p class="meta">Still im Download-Ordner unter „${AUTO_BACKUP_FOLDER}“. Die letzten ${AUTO_BACKUP_KEEP} bleiben, ältere löscht das Dashboard; von Hand gespeicherte Sicherungen bleiben unberührt.</p>
      <div class="form-section-actions">
        <button class="small-button" type="button" id="auto-backup-now">Jetzt automatisch sichern</button>
      </div>
    </section>

    <section class="form-section" aria-labelledby="settings-website">
      <h2 id="settings-website">Website</h2>
      <p class="settings-lead">„Meine Kinothek“: die Datei <code>sammlung.json</code> entsteht bei jeder automatischen Sicherung mit.</p>
      <div class="website-file" id="website-file-block">
        <label class="check-row">
          <input type="checkbox" id="website-file-check" ${state.websiteFile === false ? "" : "checked"}>
          Bei der automatischen Sicherung auch <code>sammlung.json</code> für die Website speichern
        </label>
        <fieldset class="website-file-options" id="website-options">
          <legend>Auf der Website zeigen</legend>
          ${OPTIONAL_GROUPS.map(group => `
            <label class="check-row">
              <input type="checkbox" value="${group.key}" ${websiteOptions(state)[group.key] ? "checked" : ""}>
              ${escapeHtml(group.label)}
            </label>`).join("")}
          <label class="check-row">
            <input type="checkbox" id="website-password-check" ${readAccess(state.websiteAccess) ? "checked" : ""}>
            Passwort für die Website
          </label>
          <div class="field website-password" id="website-password-field">
            <label for="website-password" id="website-password-label"></label>
            <input id="website-password" type="password" autocomplete="new-password" spellcheck="false">
            <p class="field-note" id="website-password-status"></p>
          </div>
        </fieldset>
        <p class="meta" id="website-file-note">Die Datei kopierst du danach in den Website-Ordner (<code>data/sammlung.json</code>) – oder per Doppelklick auf <code>Sammlung-holen.bat</code> dort.</p>
      </div>
    </section>`);
  buildSettingsNav();

  // Werkzeuge der Kinothek: auf Entertainment gleich hier, sonst dorthin
  document.querySelector(".modal")?.addEventListener("click", event => {
    const key = event.target.closest("[data-tool]")?.dataset.tool;
    if (!key) return;
    if (tools?.[key]) {
      closeModal();
      tools[key]();
      return;
    }
    const base = location.pathname.includes("/views/") ? "" : "views/";
    location.href = `${base}movies.html?tool=${key}`;
  });

  $("#settings-form").onsubmit = async event => {
    event.preventDefault();
    const key = new FormData(event.currentTarget).get("omdbApiKey").trim();
    state.omdbApiKey = key;
    await saveDashboardData({ omdbApiKey: key });
    showToast(key ? "OMDb-Schlüssel gespeichert." : "OMDb-Schlüssel entfernt.", "success");
    showCastFetch();
  };

  // Design (Kino-Noir/Foyer) und Hell/Dunkel - gelten sofort
  for (const radio of document.querySelectorAll('.modal input[name="design"]')) {
    radio.onchange = async () => {
      state.design = readDesign(radio.value);
      await saveDashboardData({ design: state.design });
      applyTheme(state); // setzt data-skin, das Foyer baut auf bzw. ab
      syncThemeField(state);
      const narrow = state.design === "foyer" && window.innerWidth < FOYER_MIN_WIDTH;
      showToast(narrow ? "Foyer gewählt – erscheint in breiten Fenstern." : state.design === "foyer" ? "Willkommen im Foyer." : "Zurück in Kino-Noir.", "success");
    };
  }
  $("#settings-theme-select").onchange = async event => {
    state.theme = event.target.value;
    await saveDashboardData({ theme: state.theme });
    applyTheme(state);
  };

  $("#intro-mode-select").onchange = async event => {
    state.introMode = event.target.value;
    await saveDashboardData({ introMode: state.introMode });
    syncBootMirror(state); // wirkt ab dem nächsten neuen Tab
    showToast("Gilt ab dem nächsten neuen Tab.", "success");
  };

  // Bewegung: Klick-Effekt und Tempo (gelten sofort, auch auf dieser Seite)
  for (const radio of document.querySelectorAll('.modal input[name="click-effect"]')) {
    radio.onchange = async () => {
      state.clickEffect = radio.value;
      $("#click-duration-group").disabled = state.clickEffect === "off"; // ohne Effekt kein Tempo
      await saveDashboardData({ clickEffect: state.clickEffect });
      syncBootMirror(state); // Seitenwechsel ab der nächsten Seite (js/boot.js)
      showToast(state.clickEffect === "off" ? "Klick-Effekt ausgeschaltet." : "Klick-Effekt gespeichert.", "success");
    };
  }
  // Logo-Animation: gilt sofort, Änderungen spielen gleich als Vorschau
  bindLogoMotionSettings(document.querySelector(".modal"), state.logoMotion, async (motion, { preview, what }) => {
    if (what !== "preview") {
      state.logoMotion = motion;
      saveDashboardData({ logoMotion: motion }).catch(() => showToast("Die Einstellung konnte nicht gespeichert werden.", "error"));
    }
    setLogoMotion(motion, { preview });
  });
  $("#universe-intro-select").onchange = async event => {
    state.universeIntro = event.target.value;
    await saveDashboardData({ universeIntro: state.universeIntro });
    showToast("Gespeichert.", "success");
  };
  $("#duel-intro-select").onchange = async event => {
    state.duelIntro = event.target.value;
    await saveDashboardData({ duelIntro: state.duelIntro });
    showToast("Gespeichert.", "success");
  };

  $("#projector-dust-check").onchange = async event => {
    state.projectorDust = event.target.checked;
    await saveDashboardData({ projectorDust: state.projectorDust });
    window.dispatchEvent(new CustomEvent("dashboard:projector-dust"));
    showToast(state.projectorDust ? "Lichtkegel eingeschaltet." : "Lichtkegel ausgeschaltet.", "success");
  };
  for (const radio of document.querySelectorAll('.modal input[name="click-duration"]')) {
    radio.onchange = async () => {
      state.clickDuration = Number(radio.value);
      await saveDashboardData({ clickDuration: state.clickDuration });
      showToast("Tempo gespeichert.", "success");
    };
  }

  // Aufbau der Übersicht (2.44): gilt ab dem nächsten neuen Tab, Vorschau sofort
  $("#build-style-select").onchange = async event => {
    state.buildStyle = readBuildStyle(event.target.value);
    await saveDashboardData({ buildStyle: state.buildStyle });
    syncBootMirror(state);
    showToast("Gilt ab dem nächsten neuen Tab.", "success");
  };
  $("#build-intro-select").onchange = async event => {
    state.buildIntro = event.target.value;
    await saveDashboardData({ buildIntro: state.buildIntro });
    syncBootMirror(state);
    showToast("Gilt ab dem nächsten neuen Tab.", "success");
  };
  const buildPreview = $("#build-preview-button");
  if (buildPreview) {
    buildPreview.onclick = () => {
      const style = $("#build-style-select")?.value || state.buildStyle;
      closeModal();
      // Nach der Vorschau zurück in die Einstellungen, an dieselbe Stelle (2.45)
      const back = () => {
        openSettingsModal(state, onImported, tools);
        $("#settings-build")?.scrollIntoView({ block: "start" });
        $("#build-preview-button")?.focus({ preventScroll: true });
      };
      if (!previewPageBuild(style, { onDone: back })) {
        showToast("Mit „Bewegung reduzieren“ im System gibt es keinen Aufbau.", "info");
        back();
      }
    };
  }

  const previewButton = $("#curtain-preview-button");
  if (previewButton) {
    previewButton.onclick = () => {
      closeModal();
      // Nach dem Vorhang zurück in die Einstellungen, an dieselbe Stelle (2.45.1)
      const back = () => {
        openSettingsModal(state, onImported, tools);
        $("#intro-mode-select")?.closest(".intro-picker")?.scrollIntoView({ block: "center" });
        $("#curtain-preview-button")?.focus({ preventScroll: true });
      };
      if (!replayCurtain()) { back(); return; }
      const begin = performance.now();
      const wait = setInterval(() => {
        const age = performance.now() - begin;
        // Ruhestand erreicht (oder Sicherung nach 6 s, falls kein Ende gemeldet wird)
        if ((age > 300 && document.documentElement.dataset.curtainPhase === "rest") || age > 6000) {
          clearInterval(wait);
          setTimeout(back, 350);
        }
      }, 100);
    };
  }

  $("#reminder-select").onchange = async event => {
    state.importReminderDays = Number(event.target.value);
    await saveDashboardData({ importReminderDays: state.importReminderDays });
    renderImportReminder(state);
    showToast(state.importReminderDays ? "Erinnerung gespeichert." : "Erinnerung ausgeschaltet.", "success");
  };

  $("#import-window-select").onchange = async event => {
    state.importWindowDays = Number(event.target.value);
    setImportWindowDays(state.importWindowDays);
    await saveDashboardData({ importWindowDays: state.importWindowDays });
    window.dispatchEvent(new CustomEvent("dashboard:import-window"));
    showToast("Zeitraum für den Filter „Import“ gespeichert.", "success");
  };

  $("#sort-downloads-check").onchange = async event => {
    state.sortImdbDownloads = event.target.checked;
    await saveDashboardData({ sortImdbDownloads: state.sortImdbDownloads });
    showToast(state.sortImdbDownloads ? "IMDb-Exporte landen künftig in „IMDb-Exporte“." : "IMDb-Exporte bleiben im Download-Ordner.", "success");
  };

  $("#show-shortcuts").onclick = () => {
    closeModal(); // gibt den Fokus an die Kopfleiste zurück, die Übersicht übernimmt ihn
    openShortcutHelp();
  };

  // Wie viele Cover liegen schon im Dashboard (offline nutzbar)? Cover von
  // Seiten ohne Erlaubnis: Hinweis und Knopf zum Erlauben (Chrome fragt nach)
  const showCoverStatus = () => coverStoreStatus(state.movies || []).then(({ stored, total, blocked, blockedOrigins }) => {
    const line = $("#cover-store-status");
    if (!line) return;
    const n = value => value.toLocaleString("de-DE");
    const waiting = total - stored - blocked;
    line.innerHTML = total === 0
      ? "Cover offline: noch keine Cover vorhanden."
      : `Cover offline gespeichert: ${n(stored)} von ${n(total)}${waiting > 0 ? " – der Rest folgt beim nächsten Öffnen von Entertainment" : ""}.`;
    if (!blocked) return;
    const hosts = blockedOrigins.map(origin => new URL(origin).host);
    line.insertAdjacentHTML("beforeend", `<br>${n(blocked)} ${blocked === 1 ? "Cover stammt" : "Cover stammen"} von ${escapeHtml(hosts.slice(0, 3).join(", "))}${hosts.length > 3 ? " u. a." : ""}. Sie werden normal angezeigt; offline speichern geht erst mit deiner Erlaubnis.
      <button class="small-button" type="button" id="allow-cover-origins">Erlauben</button>`);
    $("#allow-cover-origins").onclick = async () => {
      if (!(await requestCoverOrigins(blockedOrigins))) return;
      line.textContent = "Erlaubt – die Cover werden jetzt gespeichert …";
      await storeMissingCovers(state.movies || []);
      showCoverStatus();
    };
  });
  showCoverStatus();

  // Besetzung: Stand und Knöpfe; aktualisiert sich, während der Dialog offen ist
  const castBox = $("#cast-fetch");
  const showCastFetch = async () => {
    if (!castBox?.isConnected) return;
    const stored = await chrome.storage.local.get(["castData", "castFetch", "movies"]);
    const data = readCastData(stored.castData);
    const fetch = readCastFetch(stored.castFetch);
    const movies = Array.isArray(stored.movies) ? stored.movies : (state.movies || []);
    const { total, done, empty, remaining } = castStatus(movies, data);
    const n = value => value.toLocaleString("de-DE");
    const pct = total ? Math.round(done / total * 1000) / 10 : 0;
    const paused = fetch.enabled && fetch.pausedUntil && Date.parse(fetch.pausedUntil) > Date.now();
    const running = fetch.enabled && castFetchActive(fetch);
    const [badge, tone, note] = !total ? ["", "", "Noch keine Titel mit IMDb-Verknüpfung."]
      : !state.omdbApiKey ? ["Ohne Schlüssel", "", "Dafür brauchst du den OMDb-Schlüssel oben."]
      : fetch.lastError ? ["Angehalten", "is-warn", fetch.lastError]
      : !remaining ? ["Vollständig", "is-done", empty ? `${n(empty)} ${empty === 1 ? "Titel kennt" : "Titel kennt"} OMDb ohne Besetzung (meist Kurzfilme und Specials). Neue Titel kommen von selbst dazu.` : "Neue Titel aus dem nächsten Import kommen von selbst dazu."]
      : !fetch.enabled ? [done ? "Angehalten" : "Nicht geladen", "", done ? "Bis zum Fortsetzen bleibt es bei dem, was schon da ist." : "Bis dahin zeigen Filmuniversum und Detailseite nur die Regie."]
      : paused ? ["Weiter morgen", "is-busy", `OMDb-Tageslimit erreicht. Morgen geht es von selbst weiter – noch ${n(remaining)} Titel. Du musst nichts tun.`]
      : running ? ["Lädt …", "is-busy", "Läuft im Hintergrund, solange Entertainment offen ist."]
      : ["Eingeschaltet", "is-busy", "Läuft beim nächsten Öffnen von Entertainment weiter."];
    const actions = [];
    if (total && state.omdbApiKey) {
      if (!fetch.enabled && remaining) actions.push(`<button class="small-button" type="button" data-cast="on">${done ? "Fortsetzen" : "Besetzung laden"} (${n(remaining)} ${remaining === 1 ? "Titel" : "Titel"})</button>`);
      if (fetch.enabled && remaining && !fetch.lastError) actions.push(`<button class="small-button" type="button" data-cast="off">Anhalten</button>`);
      if (fetch.lastError) actions.push(`<button class="small-button" type="button" data-cast="on">Erneut versuchen</button>`);
      if (!remaining && empty) actions.push(`<button class="small-button" type="button" data-cast="retry">Fehlende erneut versuchen (${n(empty)})</button>`);
    }
    castBox.innerHTML = `
      <div class="cast-fetch-head"><span>${n(done)} von ${n(total)} Titeln</span>${badge ? `<span class="cast-fetch-badge ${tone}">${escapeHtml(badge)}</span>` : ""}</div>
      <div class="cast-fetch-meter${!remaining && total ? " is-done" : ""}" role="progressbar" aria-label="Besetzung geladen" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div>
      <p class="meta">${escapeHtml(note)}</p>
      ${actions.length ? `<div class="form-section-actions">${actions.join("")}</div>` : ""}`;
  };
  castBox?.addEventListener("click", async event => {
    const action = event.target.closest("[data-cast]")?.dataset.cast;
    if (!action) return;
    if (action === "on") await enableCastFetch();
    if (action === "off") await disableCastFetch();
    if (action === "retry") {
      const { castData } = await chrome.storage.local.get("castData");
      await chrome.storage.local.set({ castData: dropEmptyCast(readCastData(castData)) });
      await enableCastFetch();
    }
    const onEntertainment = Boolean(document.querySelector("#cast-panel"));
    if (action !== "off") showToast(onEntertainment ? "Die Besetzung wird im Hintergrund geladen." : "Startet, sobald du Entertainment öffnest.", "success");
    showCastFetch();
  });
  const onCastChange = (changes, area) => {
    if (!castBox?.isConnected) { chrome.storage.onChanged.removeListener(onCastChange); return; }
    if (area === "local" && (changes.castData || changes.castFetch)) showCastFetch();
  };
  chrome.storage?.onChanged?.addListener(onCastChange);
  showCastFetch();

  $("#export-button").onclick = async () => {
    await downloadBackup(state);
    $("#backup-status").textContent = backupStatusText(state);
    renderBackupReminder(state);
  };

  $("#backup-reminder-select").onchange = async event => {
    state.backupReminderDays = Number(event.target.value);
    await saveDashboardData({ backupReminderDays: state.backupReminderDays });
    renderBackupReminder(state);
    showToast(state.backupReminderDays ? "Erinnerung gespeichert." : "Erinnerung ausgeschaltet.", "success");
  };

  // Automatisch sichern: an/aus, Website-Datei, Häkchen, Passwort
  const syncAutoBlock = () => {
    const auto = $("#auto-backup-check").checked;
    const website = $("#website-file-check").checked;
    $("#website-file-check").disabled = !auto;
    $("#website-options").disabled = !auto || !website;
    $("#website-password-field").hidden = !$("#website-password-check").checked;
    $("#auto-backup-now").disabled = !auto;
  };
  syncAutoBlock();
  $("#auto-backup-check").onchange = async event => {
    state.autoBackup = event.target.checked;
    await saveDashboardData({ autoBackup: state.autoBackup });
    syncAutoBlock();
    showToast(state.autoBackup ? "Automatische Sicherung eingeschaltet." : "Automatische Sicherung ausgeschaltet.", "success");
  };
  $("#website-file-check").onchange = async event => {
    state.websiteFile = event.target.checked;
    await saveDashboardData({ websiteFile: state.websiteFile });
    syncAutoBlock();
  };
  $("#website-options").addEventListener("change", async event => {
    const box = event.target;
    if (box.type !== "checkbox" || !box.value || box.id) return;
    state.websiteOptions = { ...websiteOptions(state), [box.value]: box.checked };
    await saveDashboardData({ websiteOptions: state.websiteOptions });
  });
  const passwordStatus = () => {
    $("#website-password-label").textContent = readAccess(state.websiteAccess) ? "Neues Passwort (leer lassen = bleibt)" : "Passwort";
    $("#website-password-status").textContent = !$("#website-password-check").checked
      ? ""
      : readAccess(state.websiteAccess) ? "Passwort ist gesetzt. Besucher, die schon drin sind, fragt die Website nach einem neuen erneut." : "Noch kein Passwort – eintippen, dann Enter oder Feld verlassen.";
  };
  passwordStatus();
  $("#website-password-check").onchange = async event => {
    syncAutoBlock();
    if (!event.target.checked && readAccess(state.websiteAccess)) {
      state.websiteAccess = null;
      await saveDashboardData({ websiteAccess: null });
      showToast("Website ohne Passwort.", "success");
    }
    if (event.target.checked) $("#website-password").focus();
    passwordStatus();
  };
  const savePassword = async () => {
    const input = $("#website-password");
    if (!input.value.trim()) return;
    state.websiteAccess = await createAccess(input.value);
    input.value = "";
    await saveDashboardData({ websiteAccess: state.websiteAccess });
    passwordStatus();
    showToast("Passwort für die Website gespeichert.", "success");
  };
  $("#website-password").addEventListener("change", savePassword);
  $("#website-password").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); savePassword(); } });
  $("#auto-backup-now").onclick = async () => {
    const button = $("#auto-backup-now");
    button.disabled = true;
    const ok = await runAutoBackup();
    button.disabled = false;
    if (ok) {
      Object.assign(state, { lastBackupAt: (await getDashboardData()).lastBackupAt, backupReminderSnoozedUntil: "" });
      $("#backup-status").textContent = backupStatusText(state);
      renderBackupReminder(state);
    }
    showToast(ok ? `Gesichert in „${AUTO_BACKUP_FOLDER}“.` : "Die Sicherung hat nicht geklappt.", ok ? "success" : "error");
  };

  $("#import-input").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const status = $("#settings-status");
    try {
      await importDashboard(JSON.parse(await file.text()));
      const fresh = await getDashboardData();
      Object.assign(state, fresh);
      syncBootMirror(state);
      showToast("Sicherung geladen.", "success");
      closeModal();
      onImported?.();
    } catch (error) {
      const message = error.message || "Die Datei konnte nicht gelesen werden.";
      if (status) status.textContent = message;
      showToast(message, "error");
    } finally {
      event.target.value = "";
    }
  };
}
