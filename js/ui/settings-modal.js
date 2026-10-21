import { IMPORT_WINDOW_OPTIONS, IMPORT_WINDOW_DAYS, setImportWindowDays } from "../logic/movies-logic.js";
import { $, escapeHtml } from "../utils/dom.js";
import { openModal, closeModal } from "../utils/modal.js";
import { saveDashboardData, importDashboard, getDashboardData, syncBootMirror } from "../storage.js";
import { showToast } from "../utils/toast.js";
import { CURTAIN_ICONS, REMINDER_OPTIONS, INTRO_OPTIONS, CLICK_EFFECT_OPTIONS, CLICK_DURATION_OPTIONS } from "../utils/constants.js";
import { normalizeClickEffect, normalizeClickDuration } from "../logic/link-transition-logic.js";
import { renderImportReminder } from "./import-reminder.js";
import { formatDay, ageLabel } from "../utils/format.js";
import { reminderStatus } from "../logic/imdb-import-logic.js";
import { coverStoreStatus, requestCoverOrigins, storeMissingCovers } from "../cover-store.js";
import { renderCornerDecoration, replayCurtain } from "./curtain.js";
import { curtainIconSvg } from "./curtain-icons.js";
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
import { setLogoMotion } from "./brand-medallion.js";

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
 * Einstellungen-Dialog in vier Sektionen: Erscheinungsbild, Bewegung,
 * Entertainment (IMDb-Datenstand, Erinnerung, OMDb-Schlüssel) und Daten
 * (Sichern und Wiederherstellen). Auf jeder Seite über die Kopfleiste erreichbar.
 * @param {object} state - wird bei Änderungen mutiert.
 * @param {Function} [onImported] - Callback nach erfolgreichem Import.
 */
export function openSettingsModal(state, onImported) {
  const hasCurtain = Boolean(document.querySelector(".curtain")); // Übersicht und Entertainment
  openModal("Einstellungen", `
    <section class="form-section" aria-labelledby="settings-appearance">
      <h2 id="settings-appearance">Erscheinungsbild</h2>
      <div class="decor-picker">
        <label class="field">Dekoration am Bildschirmrand
          <select id="curtain-icon-select">
            ${CURTAIN_ICONS.map(option =>
              `<option value="${option.value}" ${state.curtainIcon === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
            ).join("")}
          </select>
        </label>
        <div class="decor-preview" id="decor-preview" aria-hidden="true"></div>
      </div>
      <p class="meta">Erscheint unten links, nachdem sich der Vorhang auf der Übersichtsseite geöffnet hat.</p>
      <div class="intro-picker">
        <label class="field intro-field">Kinovorhang
          <select id="intro-mode-select">
            ${INTRO_OPTIONS.map(option =>
              `<option value="${option.value}" ${state.introMode === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
            ).join("")}
          </select>
        </label>
        ${hasCurtain ? `<button class="small-button" type="button" id="curtain-preview-button">Vorschau abspielen</button>` : ""}
      </div>
      <p class="meta">${hasCurtain
        ? "Die Vorschau spielt den Vorhang hier auf dieser Seite ab."
        : "Eine Vorschau gibt es auf der Übersicht und unter Entertainment."}</p>
      <div class="form-section-actions">
        <button class="small-button" type="button" id="show-shortcuts">Tastenkürzel anzeigen</button>
      </div>
    </section>

    <section class="form-section" aria-labelledby="settings-motion">
      <h2 id="settings-motion">Bewegung</h2>
      <fieldset class="choice-group">
        <legend>Klick-Effekt</legend>
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
      <p class="meta">Beim Öffnen von Favoriten, Lesezeichen und beim Wechsel zwischen den Seiten; die Seite öffnet, sobald die Animation durch ist. Mit „Aus" (oder „Bewegung reduzieren" im System) öffnet ein Klick sofort. Cover fliegen beim Öffnen eines Titels direkt zur Detailseite.</p>
      <label class="check-row">
        <input type="checkbox" id="projector-dust-check" ${state.projectorDust === false ? "" : "checked"}>
        Lichtkegel mit Staub im Kopf der Übersicht
      </label>
      <label class="field intro-field">Urknall im Filmuniversum
        <select id="universe-intro-select">
          ${UNIVERSE_INTRO_OPTIONS.map(option =>
            `<option value="${option.value}" ${(state.universeIntro || DEFAULT_UNIVERSE_INTRO) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
          ).join("")}
        </select>
      </label>
      <p class="meta">Beim Öffnen von Entertainment → Filmuniversum fliegen die Sterne aus der Mitte an ihren Platz. Mit „Bewegung reduzieren“ im System nie.</p>
      ${logoMotionSettingsHtml(state.logoMotion)}
    </section>

    <section class="form-section" aria-labelledby="settings-entertainment">
      <h2 id="settings-entertainment">Entertainment</h2>
      <p class="meta" id="imdb-data-status">${escapeHtml(importStatusText(state))}</p>
      <label class="field reminder-field">An neuen Export erinnern
        <select id="reminder-select">
          ${reminderOptions(state.importReminderDays).map(option =>
            `<option value="${option.value}" ${Number(state.importReminderDays) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
          ).join("")}
        </select>
      </label>
      <label class="field reminder-field">Filter „Import" zeigt Neu/Geändert der letzten
        <select id="import-window-select">
          ${IMPORT_WINDOW_OPTIONS.map(option =>
            `<option value="${option.value}" ${Number(state.importWindowDays || IMPORT_WINDOW_DAYS) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
          ).join("")}
        </select>
      </label>
      <p class="meta">Neue Daten holst du unter Entertainment über „Mehr" → „IMDb-Listen importieren".</p>
      <label class="check-row">
        <input type="checkbox" id="sort-downloads-check" ${state.sortImdbDownloads === false ? "" : "checked"}>
        IMDb-Exporte beim Herunterladen im Unterordner „IMDb-Exporte" ablegen
      </label>
      <form id="settings-form">
        <div class="field full">
          <label for="omdb-key">OMDb-Schlüssel</label>
          <input id="omdb-key" name="omdbApiKey" type="text" autocomplete="off"
                 value="${escapeHtml(state.omdbApiKey || "")}" placeholder="a1b2c3d4">
          <p class="meta">
            Lädt die Cover und die Besetzung deiner Titel. Kostenlos anfordern auf
            <a class="external-link" href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer">omdbapi.com</a>.
          </p>
        </div>
        <div class="form-actions">
          <button class="button secondary" type="button" id="cancel-settings">Abbrechen</button>
          <button class="button" type="submit">Schlüssel speichern</button>
        </div>
      </form>

      <h3 class="settings-subhead">Besetzung</h3>
      <p class="meta">Für die Registerkarte „Besetzung“: Darsteller (die ersten drei bis vier je Titel) und Drehbuch kommen von OMDb, die Regie steht schon im IMDb-Export. OMDb erlaubt rund 1.000 Abrufe am Tag – bei vielen Titeln dauert der erste Durchlauf also mehrere Tage und geht jeweils von selbst weiter, solange Entertainment offen ist. Danach kommen nur neue Titel dazu. Cover haben Vorrang.</p>
      <div class="cast-fetch" id="cast-fetch" aria-live="polite"></div>
    </section>

    <section class="form-section" aria-labelledby="settings-data">
      <h2 id="settings-data">Daten</h2>
      <p class="meta">Sichert Design, Favoriten und alle Einträge unter Entertainment als Datei. Die Lesezeichen selbst bleiben in Chrome.</p>
      <p class="meta" id="backup-status">${escapeHtml(backupStatusText(state))}</p>
      <div class="form-section-actions">
        <button class="small-button" type="button" id="export-button">Sicherung speichern</button>
        <label class="small-button import-label">Sicherung laden
          <input id="import-input" type="file" accept="application/json" aria-label="Sicherungsdatei auswählen">
        </label>
      </div>
      <label class="field reminder-field">An Sicherung erinnern
        <select id="backup-reminder-select">
          ${reminderOptions(state.backupReminderDays).map(option =>
            `<option value="${option.value}" ${Number(state.backupReminderDays) === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
          ).join("")}
        </select>
      </label>
      <p class="status-line" id="settings-status" aria-live="polite"></p>
      <p class="meta" id="cover-store-status">Cover offline: wird gezählt …</p>

      <h3 class="settings-subhead">Automatisch sichern</h3>
      <label class="check-row">
        <input type="checkbox" id="auto-backup-check" ${state.autoBackup === false ? "" : "checked"}>
        Nach jedem IMDb-Import und jeder Änderung an Titeln
      </label>
      <p class="meta">Still im Download-Ordner unter „${AUTO_BACKUP_FOLDER}“. Die letzten ${AUTO_BACKUP_KEEP} bleiben, ältere löscht das Dashboard; von Hand gespeicherte Sicherungen bleiben unberührt.</p>
      <div class="website-file" id="website-file-block">
        <label class="check-row">
          <input type="checkbox" id="website-file-check" ${state.websiteFile === false ? "" : "checked"}>
          Dabei auch <code>sammlung.json</code> für die Website speichern
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
        <p class="meta">Die Datei kopierst du danach in den Website-Ordner (<code>data/sammlung.json</code>) – oder per Doppelklick auf <code>Sammlung-holen.bat</code> dort.</p>
      </div>
      <div class="form-section-actions">
        <button class="small-button" type="button" id="auto-backup-now">Jetzt automatisch sichern</button>
      </div>
    </section>`);

  $("#cancel-settings").onclick = closeModal;

  $("#settings-form").onsubmit = async event => {
    event.preventDefault();
    const key = new FormData(event.currentTarget).get("omdbApiKey").trim();
    state.omdbApiKey = key;
    await saveDashboardData({ omdbApiKey: key });
    showToast("OMDb-Schlüssel gespeichert.", "success");
    closeModal();
  };

  // Vorschau neben dem Auswahlfeld: zeigt das gewählte Symbol und lässt es
  // bei jedem Wechsel kurz aufspringen.
  const preview = $("#decor-preview");
  const showPreview = (name, animate) => {
    const svg = curtainIconSvg(name, "-preview");
    preview.classList.toggle("is-empty", !svg);
    preview.innerHTML = svg || "<span>Aus</span>";
    if (!animate) return;
    preview.classList.remove("is-popping");
    void preview.offsetWidth; // Reflow: Animation neu starten
    preview.classList.add("is-popping");
  };
  showPreview(state.curtainIcon, false);

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

  const previewButton = $("#curtain-preview-button");
  if (previewButton) {
    previewButton.onclick = () => {
      closeModal();
      replayCurtain();
    };
  }

  $("#curtain-icon-select").onchange = async event => {
    showPreview(event.target.value, true);
    state.curtainIcon = event.target.value;
    await saveDashboardData({ curtainIcon: state.curtainIcon });
    renderCornerDecoration(state, { instant: true });
    showToast("Dekoration aktualisiert.", "success");
  };

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
      : !fetch.enabled ? [done ? "Angehalten" : "Nicht geladen", "", done ? "Bis zum Fortsetzen bleibt es bei dem, was schon da ist." : "Bis dahin zeigt die Registerkarte „Besetzung“ nur die Regie."]
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
