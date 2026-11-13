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
import { logoMotionRowsHtml, bindLogoMotionSettings } from "./logo-motion-settings.js";
import { UNIVERSE_INTRO_OPTIONS, DEFAULT_UNIVERSE_INTRO } from "../logic/universe-logic.js";
import { DEFAULT_DUEL_INTRO } from "../logic/duel-logic.js";
import { BUILD_STYLES, BUILD_INTRO_OPTIONS, DEFAULT_BUILD_INTRO, DEFAULT_BUILD_STYLE, readBuildStyle } from "../logic/page-build-logic.js";
import { LOGO_DEFAULTS } from "../logic/logo-motion-logic.js";
import { previewPageBuild } from "./page-build.js";
import { BOOKMARK_SORT_OPTIONS } from "../logic/bookmark-groups-logic.js";
import { SHOWCASE_TAKT_OPTIONS, DEFAULT_SHOWCASE_TAKT } from "../logic/showcase-logic.js";
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
      ${row({ label: "Design", help: `Am Handy und in schmalen Fenstern (unter ${FOYER_MIN_WIDTH} px) erscheint immer Kino-Noir; wer dort die Desktop-Ansicht wählt, sieht das Foyer.`, wide: true, control: `
        <fieldset class="design-picker">
          <legend class="visually-hidden">Design</legend>
          <div class="design-options">
            ${option("noir", "Kino-Noir", "Klassisch: Kopfleiste und Reiter")}
            ${option("foyer", "Foyer", "Verspielt: Spule, Programmtafel, Säle")}
          </div>
        </fieldset>` })}
      ${row({ id: "settings-theme-field", label: "Hell oder dunkel", labelFor: "settings-theme-select",
        help: `Gilt für Kino-Noir. <span class="field-note" id="settings-theme-note" ${foyerShown(state) ? "" : "hidden"}>Das Foyer ist immer dunkel – Hell oder Dunkel gilt nur für Kino-Noir (z. B. am Handy).</span>`,
        control: `<select id="settings-theme-select" ${foyerShown(state) ? "disabled" : ""} aria-describedby="settings-theme-note">
          ${[["dark", "Dunkel"], ["light", "Hell"], ["system", "Wie das System"]].map(([value, label]) =>
            `<option value="${value}" ${state.theme === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>` })}`;
}

/*
 * Bausteine des Einstellungsfensters (2.49, Entwurf B „Seitenleiste“):
 * Bereiche links, rechts immer nur einer. Jede Einstellung ist eine Zeile –
 * Name und kurze Erklärung links, der Regler rechts. Zeilen stehen in
 * Gruppen (Karte mit Überschrift und „Zurücksetzen“).
 */
function row({ id = "", label, labelFor = "", help = "", control, wide = false, extra = "" }) {
  const name = labelFor ? `<label class="set-label" for="${labelFor}">${label}</label>` : `<span class="set-label">${label}</span>`;
  return `
        <div class="set-row${wide ? " is-wide" : ""}"${id ? ` id="${id}"` : ""}>
          <div class="set-text">${name}<span class="set-dot" aria-hidden="true" title="Geändert"></span>${help ? `<p class="set-help">${help}</p>` : ""}</div>
          <div class="set-control">${control}</div>${extra}
        </div>`;
}
const group = (title, rows, { id = "" } = {}) => `
      <div class="set-group">
        <div class="set-group-head"><h3 class="settings-subhead"${id ? ` id="${id}"` : ""}>${title}</h3><button type="button" class="set-reset" hidden>Zurücksetzen</button></div>
        <div class="set-card">${rows}</div>
      </div>`;
const page = (id, title, lead, body) => `
    <section class="form-section settings-page" id="settings-page-${id}" data-page="${id}" aria-labelledby="settings-${id}">
      <h2 id="settings-${id}">${title}</h2>
      ${lead ? `<p class="settings-lead">${lead}</p>` : ""}
      ${body}
    </section>`;
const toggle = (id, checked, label) => `<input type="checkbox" class="set-switch" role="switch" id="${id}" ${checked ? "checked" : ""} aria-label="${escapeHtml(label)}">`;

/** Zuletzt gezeigter Bereich (bleibt, solange die Seite offen ist). */
let currentPage = "look";

/**
 * Seitenleiste (2.49): ein Eintrag je Bereich, rechts steht immer nur einer.
 * Darüber die Suche über alle Einstellungen; Treffer erscheinen bereichsübergreifend.
 * Im Foyer heißen die Einstellungen „Vorführraum“ und die Einträge tragen Lampen.
 * Geänderte Werte bekommen einen Punkt, jede Gruppe ein „Zurücksetzen“.
 */
function buildSettingsNav(state, notify) {
  const modal = document.querySelector(".modal");
  if (!modal) return null;
  const foyer = document.documentElement.dataset.skin === "foyer";
  modal.classList.add("modal--settings");
  if (foyer) {
    modal.classList.add("modal--foyer");
    const heading = modal.querySelector(".modal-header h2");
    if (heading) heading.textContent = "Vorführraum";
    modal.setAttribute("aria-label", "Vorführraum – Einstellungen");
  }
  const pages = [...modal.querySelectorAll(".settings-page")];
  const content = modal.querySelector(".modal-content");
  const warn = {
    library: reminderStatus(state, Date.now()).due,
    backup: backupReminderStatus(state, Date.now()).due,
  };
  content.insertAdjacentHTML("afterbegin", `<nav class="settings-nav${foyer ? " foyer-settings-nav" : ""}" aria-label="Bereiche">
      <label class="settings-search"><span class="visually-hidden">Einstellungen durchsuchen</span>
        <input type="search" id="settings-search" placeholder="Einstellung suchen …" autocomplete="off" spellcheck="false"></label>
      ${pages.map(section => {
        const id = section.dataset.page;
        return `<button type="button" class="settings-jump${foyer ? " foyer-settings-jump" : ""}" data-jump="${id}">${foyer ? `<span class="foyer-lamp" aria-hidden="true"></span>` : ""}<span class="settings-jump-text">${escapeHtml(section.querySelector("h2").textContent)}</span>${warn[id] ? `<span class="settings-warn" title="Braucht Aufmerksamkeit"><span class="visually-hidden">(braucht Aufmerksamkeit)</span></span>` : ""}</button>`;
      }).join("")}
    </nav>
    <p class="settings-empty" id="settings-empty" hidden>Nichts gefunden.</p>`);
  const jumps = [...content.querySelectorAll(".settings-jump")];
  const nav = content.querySelector(".settings-nav");
  const search = content.querySelector("#settings-search");
  const empty = content.querySelector("#settings-empty");

  const show = id => {
    if (!pages.some(section => section.dataset.page === id)) id = pages[0].dataset.page;
    currentPage = id;
    for (const section of pages) section.hidden = section.dataset.page !== id;
    jumps.forEach(jump => {
      const on = jump.dataset.jump === id;
      jump.classList.toggle("is-current", on);
      if (on) jump.setAttribute("aria-current", "page"); else jump.removeAttribute("aria-current");
      if (on && getComputedStyle(nav).flexDirection === "row") nav.scrollLeft = Math.max(0, jump.offsetLeft - (nav.clientWidth - jump.offsetWidth) / 2);
    });
    content.scrollTop = 0;
  };

  // Suche: alle Bereiche durchsuchen, nur passende Zeilen zeigen
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase("de");
    modal.classList.toggle("is-searching", Boolean(query));
    if (!query) {
      for (const item of modal.querySelectorAll(".set-row, .set-group")) item.hidden = false;
      empty.hidden = true;
      show(currentPage);
      return;
    }
    let hits = 0;
    for (const section of pages) {
      let inPage = 0;
      const title = section.querySelector("h2").textContent.toLocaleLowerCase("de");
      for (const block of section.querySelectorAll(".set-group")) {
        const head = block.querySelector(".settings-subhead").textContent.toLocaleLowerCase("de");
        let inGroup = 0;
        for (const line of block.querySelectorAll(".set-row")) {
          const hit = `${title} ${head} ${line.textContent}`.toLocaleLowerCase("de").includes(query);
          line.hidden = !hit;
          inGroup += hit;
        }
        block.hidden = !inGroup;
        inPage += inGroup;
      }
      section.hidden = !inPage;
      hits += inPage;
    }
    jumps.forEach(jump => { jump.classList.remove("is-current"); jump.removeAttribute("aria-current"); });
    empty.hidden = Boolean(hits);
    if (!hits) empty.textContent = `Nichts gefunden für „${search.value.trim()}“.`;
  };
  search.addEventListener("input", filter);
  search.addEventListener("keydown", event => {
    if (event.key === "Escape" && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ""; filter(); }
  });

  content.addEventListener("click", event => {
    const jump = event.target.closest(".settings-jump");
    if (!jump) return;
    if (search.value) { search.value = ""; filter(); }
    show(jump.dataset.jump);
  });
  // Pfeiltasten in der Leiste
  nav.addEventListener("keydown", event => {
    const index = jumps.indexOf(event.target);
    if (index < 0 || !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = jumps[(index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : jumps.length - 1)) % jumps.length];
    next.focus();
    next.click();
  });

  // Geändert-Punkt und „Zurücksetzen“ je Gruppe
  const controls = scope => [...scope.querySelectorAll("[data-default]")];
  const differs = input => {
    if (input.type === "checkbox") return input.checked !== (input.dataset.default === "true");
    if (input.type === "radio") return input.checked && input.dataset.default !== "true";
    return String(input.value) !== input.dataset.default;
  };
  const mark = () => {
    for (const line of modal.querySelectorAll(".set-row")) line.classList.toggle("is-changed", controls(line).some(differs));
    for (const block of modal.querySelectorAll(".set-group")) block.querySelector(".set-reset").hidden = !block.querySelector(".set-row.is-changed");
  };
  modal.addEventListener("change", () => setTimeout(mark, 0));
  modal.addEventListener("click", event => {
    const reset = event.target.closest(".set-reset");
    if (!reset) return;
    const block = reset.closest(".set-group");
    notify.quiet(true);
    for (const input of controls(block).filter(differs)) {
      if (input.type === "checkbox") input.checked = input.dataset.default === "true";
      else if (input.type === "radio") { const target = [...block.querySelectorAll(`input[name="${input.name}"]`)].find(item => item.dataset.default === "true"); if (!target) continue; target.checked = true; target.dispatchEvent(new Event("change", { bubbles: true })); continue; }
      else input.value = input.dataset.default;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setTimeout(() => { notify.quiet(false); mark(); showToast(`„${block.querySelector(".settings-subhead").textContent}“ zurückgesetzt.`, "success"); }, 400);
    block.querySelector(".set-reset").hidden = true;
    (block.querySelector("[data-default]") || modal).focus();
  });

  return { show, mark };
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
 * Einstellungen-Dialog (seit 2.49 nach Entwurf B): neun Bereiche in der
 * Seitenleiste – Aussehen, Start & Foyer, Bewegung, Lesezeichen, Kinothek &
 * IMDb, Cover & Besetzung, Sicherung, Website, Hilfe –, darüber die Suche. Auf jeder Seite über
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
  // Hinweise; beim „Zurücksetzen“ einer Gruppe still (dann kommt ein Hinweis für alles)
  let quiet = false;
  const notify = (...args) => { if (!quiet) showToast(...args); };
  notify.quiet = value => { quiet = value; };
  const select = (id, options, current) => choiceSelect(id, options, current);
  const radios = (name, options, current) => options.map(option => `
          <label class="choice">
            <input type="radio" name="${name}" value="${option.value}" ${current === option.value ? "checked" : ""}>
            ${escapeHtml(option.label)}
          </label>`).join("");
  const clickOff = normalizeClickEffect(state.clickEffect) === "off";
  openModal("Einstellungen", `
    ${page("look", "Aussehen", "Wie das Dashboard aussieht.", `
      ${group("Design", `
        ${designPickerHtml(state)}
        ${row({ label: "Lichtkegel mit Staub", labelFor: "projector-dust-check", help: "Im Kopf der Übersicht.", control: toggle("projector-dust-check", state.projectorDust !== false, "Lichtkegel mit Staub") })}`)}`)}

    ${page("start", "Start & Foyer", "Was beim Öffnen eines neuen Tabs passiert.", `
      ${group("Beim Öffnen", `
        ${row({ label: "Kinovorhang", labelFor: "intro-mode-select",
          help: hasCurtain ? "Die Vorschau spielt den Vorhang hier ab; danach geht es hierher zurück." : "Eine Vorschau gibt es auf der Übersicht und unter Entertainment.",
          control: `<div class="intro-picker">${select("intro-mode-select", INTRO_OPTIONS, state.introMode)}${hasCurtain ? `<button class="small-button" type="button" id="curtain-preview-button">Vorschau</button>` : ""}</div>` })}
        ${row({ label: "Aufbau der Übersicht", labelFor: "build-style-select",
          help: "Die Übersicht baut sich Stück für Stück auf (gut 1 Sekunde): Saallicht und Neon, Lichtkegel des Projektors, Filmstreifen oder eine Kombination. Im Foyer zünden dabei die Buchstaben der Programmtafel. Ein Klick beendet ihn sofort.",
          control: `<div class="intro-picker">${select("build-style-select", BUILD_STYLES, readBuildStyle(state.buildStyle))}${onHome ? `<button class="small-button" type="button" id="build-preview-button">Vorschau</button>` : ""}</div>` })}
        ${row({ label: "Aufbau – wann", labelFor: "build-intro-select", help: `Spielt auch der Kinovorhang, folgt der Aufbau, wenn er offen ist.${onHome ? "" : " Eine Vorschau gibt es auf der Übersicht."}`,
          control: select("build-intro-select", BUILD_INTRO_OPTIONS, state.buildIntro || DEFAULT_BUILD_INTRO) })}`, { id: "settings-build" })}
      ${group("Foyer", `
        ${row({ id: "showcase-takt-field", label: "Thema der Reihe „Kinothek“ wechselt", labelFor: "showcase-takt-select",
          help: "Die Reihe unter „Heute im Programm“ zeigt ein Thema aus deiner Kinothek – ein Genre, ein Jahrzehnt, eine Regie, deine Zehner … Kein Thema kommt so schnell wieder.",
          control: select("showcase-takt-select", SHOWCASE_TAKT_OPTIONS, state.showcaseTakt || DEFAULT_SHOWCASE_TAKT) })}`)}`)}

    ${page("motion", "Bewegung", "Animationen beim Klicken, am Logo und unter Entertainment. Mit „Bewegung reduzieren“ im System bleibt alles ruhig.", `
      ${group("Klick-Effekt", `
        ${row({ label: "Klick-Effekt", help: "Beim Öffnen von Favoriten, Lesezeichen und beim Wechsel zwischen den Seiten. Mit „Aus“ öffnet ein Klick sofort.",
          control: `<fieldset class="choice-group"><legend class="visually-hidden">Klick-Effekt</legend>${radios("click-effect", CLICK_EFFECT_OPTIONS, normalizeClickEffect(state.clickEffect))}</fieldset>` })}
        ${row({ label: "Tempo", help: "Die Seite öffnet, sobald die Animation durch ist.",
          control: `<fieldset class="choice-group" id="click-duration-group" ${clickOff ? "disabled" : ""}><legend class="visually-hidden">Tempo</legend>${radios("click-duration", CLICK_DURATION_OPTIONS, normalizeClickDuration(state.clickDuration))}</fieldset>` })}`)}
      ${group("Logo", `
        ${logoMotionRowsHtml(state.logoMotion, row)}`)}
      ${group("Auftritte unter Entertainment", `
        ${row({ label: "Urknall im Filmuniversum", labelFor: "universe-intro-select", help: "Die Sterne fliegen aus der Mitte an ihren Platz.",
          control: select("universe-intro-select", UNIVERSE_INTRO_OPTIONS, state.universeIntro || DEFAULT_UNIVERSE_INTRO) })}
        ${row({ label: "Auftritt in „Du gegen IMDb“", labelFor: "duel-intro-select", help: "Die Titel fliegen aus beiden Ecken ins Feld, der Ring füllt sich, der Stempel fällt.",
          control: select("duel-intro-select", UNIVERSE_INTRO_OPTIONS, state.duelIntro || DEFAULT_DUEL_INTRO) })}`)}`)}

    ${page("marks", "Lesezeichen", "", `
      ${group("Lesezeichen", `
        ${row({ id: "bookmark-sort-field", label: "Reihenfolge", labelFor: "bookmark-sort-select",
          help: "Gilt für „Alle Lesezeichen“ in jedem Ordner. „Oft genutzt“ zählt nur, was du im Dashboard öffnest – lokal auf diesem Rechner.",
          control: select("bookmark-sort-select", BOOKMARK_SORT_OPTIONS, state.bookmarkSort === "used" ? "used" : "own") })}`)}`)}

    ${page("library", "Kinothek & IMDb", "Deine Kinothek: Daten aus IMDb und Aufräumen.", `
      ${group("IMDb-Daten", `
        ${row({ label: "Datenstand", help: `<span id="imdb-data-status">${escapeHtml(importStatusText(state))}</span>`, control: toolButton("import") })}
        ${row({ label: "An neuen Export erinnern", labelFor: "reminder-select", control: select("reminder-select", reminderOptions(state.importReminderDays), Number(state.importReminderDays)) })}
        ${row({ label: "Filter „Import“ zeigt die letzten", labelFor: "import-window-select", help: "Neu oder geändert durch einen Import.", control: select("import-window-select", IMPORT_WINDOW_OPTIONS, Number(state.importWindowDays || IMPORT_WINDOW_DAYS)) })}
        ${row({ label: "IMDb-Downloads einsortieren", labelFor: "sort-downloads-check", help: "Exporte landen beim Herunterladen im Unterordner „IMDb-Exporte“.", control: toggle("sort-downloads-check", state.sortImdbDownloads !== false, "IMDb-Downloads einsortieren") })}`)}
      ${group("Aufräumen", `
        ${row({ label: "Gesehen mit IMDb abgleichen", help: "Zeigt erst eine Liste zum Prüfen – geändert wird nur, was du bestätigst.", control: toolButton("seen") })}
        ${row({ label: "Titel ohne IMDb-Liste", help: "Ebenfalls erst eine Liste zum Prüfen.", control: toolButton("orphans") })}`)}`)}

    ${page("covers", "Cover & Besetzung", "Cover, Besetzung und weitere Angaben kommen von OMDb.", `
      ${group("OMDb", `
        ${row({ label: "OMDb-Schlüssel", labelFor: "omdb-key", help: `Kostenlos anfordern auf <a class="external-link" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">omdbapi.com</a>.`,
          control: `<form id="settings-form" class="settings-key"><div class="settings-key-row">
              <input id="omdb-key" name="omdbApiKey" type="text" autocomplete="off" value="${escapeHtml(state.omdbApiKey || "")}" placeholder="a1b2c3d4">
              <button class="small-button" type="submit">Speichern</button></div></form>` })}`)}
      ${group("Cover", `
        ${row({ label: "Titel ohne Cover", help: `<span id="cover-gaps">${coverGapsHtml(state)}</span>`, control: toolButton("covers") })}
        ${row({ label: "Cover offline", wide: true, help: `<span id="cover-store-status">Wird gezählt …</span>`, control: "" })}`)}
      ${group("Besetzung", `
        ${row({ label: "Besetzung laden", wide: true, help: "Darsteller und Drehbuch für das Filmuniversum und die Detailseite (rund 1.000 Abrufe am Tag). Der erste Durchlauf dauert bei vielen Titeln mehrere Tage und geht von selbst weiter, solange Entertainment offen ist. Cover haben Vorrang.",
          control: `<div class="cast-fetch" id="cast-fetch" aria-live="polite"></div>` })}`)}`)}

    ${page("backup", "Sicherung", "Design, Favoriten und alle Einträge unter Entertainment als Datei. Die Lesezeichen selbst bleiben in Chrome.", `
      ${group("Sicherung", `
        ${row({ label: "Letzte Sicherung", help: `<span id="backup-status">${escapeHtml(backupStatusText(state))}</span>`,
          control: `<div class="form-section-actions">
              <button class="small-button" type="button" id="export-button">Sicherung speichern</button>
              <label class="small-button import-label">Sicherung laden
                <input id="import-input" type="file" accept="application/json" aria-label="Sicherungsdatei auswählen">
              </label></div>`,
          extra: `<p class="status-line" id="settings-status" aria-live="polite"></p>` })}
        ${row({ label: "An Sicherung erinnern", labelFor: "backup-reminder-select", control: select("backup-reminder-select", reminderOptions(state.backupReminderDays), Number(state.backupReminderDays)) })}`)}
      ${group("Automatisch sichern", `
        ${row({ label: "Automatisch sichern", labelFor: "auto-backup-check", help: `Nach jedem IMDb-Import und jeder Änderung an Titeln – still im Download-Ordner unter „${AUTO_BACKUP_FOLDER}“. Die letzten ${AUTO_BACKUP_KEEP} bleiben; von Hand gespeicherte Sicherungen bleiben unberührt.`,
          control: toggle("auto-backup-check", state.autoBackup !== false, "Automatisch sichern") })}
        ${row({ label: "Jetzt automatisch sichern", control: `<button class="small-button" type="button" id="auto-backup-now">Jetzt sichern</button>` })}`)}`)}

    ${page("web", "Website", "„Meine Kinothek“: die Datei <code>sammlung.json</code> entsteht bei jeder automatischen Sicherung mit.", `
      ${group("Meine Kinothek", `
        <div id="website-file-block" class="website-file">
        ${row({ label: "<code>sammlung.json</code> mitspeichern", labelFor: "website-file-check", help: "Die Datei kopierst du danach in den Website-Ordner (<code>data/sammlung.json</code>) – oder per Doppelklick auf <code>Sammlung-holen.bat</code> dort.",
          control: toggle("website-file-check", state.websiteFile !== false, "sammlung.json mitspeichern") })}
        ${row({ label: "Auf der Website zeigen", wide: true, control: `
          <fieldset class="website-file-options" id="website-options">
            <legend class="visually-hidden">Auf der Website zeigen</legend>
            ${OPTIONAL_GROUPS.map(item => `
              <label class="check-row">
                <input type="checkbox" value="${item.key}" ${websiteOptions(state)[item.key] ? "checked" : ""}>
                ${escapeHtml(item.label)}
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
          </fieldset>` })}
        </div>`)}`)}

    ${page("help", "Hilfe", "", `
      ${group("Hilfe", `
        ${row({ label: "Tastenkürzel", help: "Überall auch mit der Taste „?“.", control: `<button class="small-button" type="button" id="show-shortcuts">Tastenkürzel anzeigen</button>` })}`)}`)}`);

  // Standardwerte für Punkt und „Zurücksetzen“
  const defaults = [
    ['input[name="design"]', "noir"], ["#settings-theme-select", "dark"], ["#projector-dust-check", true],
    ["#intro-mode-select", "hourly"], ["#build-style-select", DEFAULT_BUILD_STYLE], ["#build-intro-select", DEFAULT_BUILD_INTRO],
    ["#showcase-takt-select", DEFAULT_SHOWCASE_TAKT], ['input[name="click-effect"]', "zoom"], ['input[name="click-duration"]', "450"],
    ["#logo-mode-select", LOGO_DEFAULTS.mode], ['input[name="logo-effect"]', LOGO_DEFAULTS.effects], ['input[name="logo-tempo"]', LOGO_DEFAULTS.tempo],
    ["#universe-intro-select", DEFAULT_UNIVERSE_INTRO], ["#duel-intro-select", DEFAULT_DUEL_INTRO], ["#bookmark-sort-select", "own"],
    ["#reminder-select", "30"], ["#import-window-select", String(IMPORT_WINDOW_DAYS)], ["#sort-downloads-check", true],
    ["#backup-reminder-select", "30"], ["#auto-backup-check", true], ["#website-file-check", true],
    ...OPTIONAL_GROUPS.map(item => [`#website-options input[value="${item.key}"]`, item.standard]),
  ];
  for (const [selector, value] of defaults) {
    for (const input of document.querySelectorAll(`.modal ${selector}`)) {
      if (input.type === "radio") input.dataset.default = String(input.value === String(value));
      else if (input.type === "checkbox" && Array.isArray(value)) input.dataset.default = String(value.includes(input.value));
      else input.dataset.default = String(value);
    }
  }
  const settingsNav = buildSettingsNav(state, notify);
  settingsNav?.show(currentPage);
  settingsNav?.mark();

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
    notify(key ? "OMDb-Schlüssel gespeichert." : "OMDb-Schlüssel entfernt.", "success");
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
      notify(narrow ? "Foyer gewählt – erscheint in breiten Fenstern." : state.design === "foyer" ? "Willkommen im Foyer." : "Zurück in Kino-Noir.", "success");
    };
  }
  $("#settings-theme-select").onchange = async event => {
    state.theme = event.target.value;
    await saveDashboardData({ theme: state.theme });
    applyTheme(state);
  };

  $("#showcase-takt-select").onchange = async event => {
    state.showcaseTakt = event.target.value;
    await saveDashboardData({ showcaseTakt: state.showcaseTakt });
    notify("Gilt ab dem nächsten neuen Tab.", "success");
  };
  $("#bookmark-sort-select").onchange = async event => {
    state.bookmarkSort = event.target.value === "used" ? "used" : "own";
    await saveDashboardData({ bookmarkSort: state.bookmarkSort });
    window.dispatchEvent(new CustomEvent("dashboard:bookmark-sort", { detail: state.bookmarkSort }));
    notify("Gespeichert.", "success");
  };

  $("#intro-mode-select").onchange = async event => {
    state.introMode = event.target.value;
    await saveDashboardData({ introMode: state.introMode });
    syncBootMirror(state); // wirkt ab dem nächsten neuen Tab
    notify("Gilt ab dem nächsten neuen Tab.", "success");
  };

  // Bewegung: Klick-Effekt und Tempo (gelten sofort, auch auf dieser Seite)
  for (const radio of document.querySelectorAll('.modal input[name="click-effect"]')) {
    radio.onchange = async () => {
      state.clickEffect = radio.value;
      $("#click-duration-group").disabled = state.clickEffect === "off"; // ohne Effekt kein Tempo
      await saveDashboardData({ clickEffect: state.clickEffect });
      syncBootMirror(state); // Seitenwechsel ab der nächsten Seite (js/boot.js)
      notify(state.clickEffect === "off" ? "Klick-Effekt ausgeschaltet." : "Klick-Effekt gespeichert.", "success");
    };
  }
  // Logo-Animation: gilt sofort, Änderungen spielen gleich als Vorschau
  bindLogoMotionSettings(document.querySelector(".modal"), state.logoMotion, async (motion, { preview, what }) => {
    if (what !== "preview") {
      state.logoMotion = motion;
      saveDashboardData({ logoMotion: motion }).catch(() => notify("Die Einstellung konnte nicht gespeichert werden.", "error"));
    }
    setLogoMotion(motion, { preview });
  });
  $("#universe-intro-select").onchange = async event => {
    state.universeIntro = event.target.value;
    await saveDashboardData({ universeIntro: state.universeIntro });
    notify("Gespeichert.", "success");
  };
  $("#duel-intro-select").onchange = async event => {
    state.duelIntro = event.target.value;
    await saveDashboardData({ duelIntro: state.duelIntro });
    notify("Gespeichert.", "success");
  };

  $("#projector-dust-check").onchange = async event => {
    state.projectorDust = event.target.checked;
    await saveDashboardData({ projectorDust: state.projectorDust });
    window.dispatchEvent(new CustomEvent("dashboard:projector-dust"));
    notify(state.projectorDust ? "Lichtkegel eingeschaltet." : "Lichtkegel ausgeschaltet.", "success");
  };
  for (const radio of document.querySelectorAll('.modal input[name="click-duration"]')) {
    radio.onchange = async () => {
      state.clickDuration = Number(radio.value);
      await saveDashboardData({ clickDuration: state.clickDuration });
      notify("Tempo gespeichert.", "success");
    };
  }

  // Aufbau der Übersicht (2.44): gilt ab dem nächsten neuen Tab, Vorschau sofort
  $("#build-style-select").onchange = async event => {
    state.buildStyle = readBuildStyle(event.target.value);
    await saveDashboardData({ buildStyle: state.buildStyle });
    syncBootMirror(state);
    notify("Gilt ab dem nächsten neuen Tab.", "success");
  };
  $("#build-intro-select").onchange = async event => {
    state.buildIntro = event.target.value;
    await saveDashboardData({ buildIntro: state.buildIntro });
    syncBootMirror(state);
    notify("Gilt ab dem nächsten neuen Tab.", "success");
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
        notify("Mit „Bewegung reduzieren“ im System gibt es keinen Aufbau.", "info");
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
    notify(state.importReminderDays ? "Erinnerung gespeichert." : "Erinnerung ausgeschaltet.", "success");
  };

  $("#import-window-select").onchange = async event => {
    state.importWindowDays = Number(event.target.value);
    setImportWindowDays(state.importWindowDays);
    await saveDashboardData({ importWindowDays: state.importWindowDays });
    window.dispatchEvent(new CustomEvent("dashboard:import-window"));
    notify("Zeitraum für den Filter „Import“ gespeichert.", "success");
  };

  $("#sort-downloads-check").onchange = async event => {
    state.sortImdbDownloads = event.target.checked;
    await saveDashboardData({ sortImdbDownloads: state.sortImdbDownloads });
    notify(state.sortImdbDownloads ? "IMDb-Exporte landen künftig in „IMDb-Exporte“." : "IMDb-Exporte bleiben im Download-Ordner.", "success");
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
    if (action !== "off") notify(onEntertainment ? "Die Besetzung wird im Hintergrund geladen." : "Startet, sobald du Entertainment öffnest.", "success");
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
    notify(state.backupReminderDays ? "Erinnerung gespeichert." : "Erinnerung ausgeschaltet.", "success");
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
    notify(state.autoBackup ? "Automatische Sicherung eingeschaltet." : "Automatische Sicherung ausgeschaltet.", "success");
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
      notify("Website ohne Passwort.", "success");
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
    notify("Passwort für die Website gespeichert.", "success");
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
    notify(ok ? `Gesichert in „${AUTO_BACKUP_FOLDER}“.` : "Die Sicherung hat nicht geklappt.", ok ? "success" : "error");
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
      notify("Sicherung geladen.", "success");
      closeModal();
      onImported?.();
    } catch (error) {
      const message = error.message || "Die Datei konnte nicht gelesen werden.";
      if (status) status.textContent = message;
      notify(message, "error");
    } finally {
      event.target.value = "";
    }
  };
}
