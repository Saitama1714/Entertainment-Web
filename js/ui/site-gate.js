import { checkPassword } from "../logic/access-logic.js";
import { escapeHtml } from "../utils/dom.js";
import { SITE_TITLE } from "../utils/constants.js";

/*
 * „Einlass": Ist in data/sammlung.json ein Passwort hinterlegt, liegt bis
 * zur richtigen Eingabe ein Overlay über der Seite. Danach ist alles wie
 * bisher. Ein reiner Sichtschutz (siehe js/logic/access-logic.js).
 *
 * Ablauf: js/boot.js setzt auf Seiten mit Daten <html data-gate="pending">;
 * site.css hält Kopfleiste und Inhalt bis dahin unsichtbar. Sobald die Daten
 * geladen sind, ruft die Seite openGate(access):
 *   - kein Passwort, oder in diesem Browser schon freigeschaltet → frei
 *   - sonst → Overlay; nach richtiger Eingabe frei und gemerkt (localStorage)
 * Ein neues Passwort (neuer Prüfwert) fragt automatisch wieder.
 */

const KEY = "site:access";
const root = document.documentElement;

/** Merkt sich die Freischaltung für dieses Passwort (ohne Speicher: nur bis zum Neuladen). */
function remember(hash) {
  try { localStorage.setItem(KEY, hash); } catch { /* nichts zu tun */ }
}

/** Ist dieser Browser für genau diesen Prüfwert schon freigeschaltet? */
function remembered(hash) {
  try { return localStorage.getItem(KEY) === hash; } catch { return false; }
}

/** Gibt die Seite frei. */
function release() {
  delete root.dataset.gate;
}

/**
 * Entscheidet, ob die Seite frei ist, und zeigt sonst das Overlay.
 * @param {{salt: string, hash: string}|null} access - aus der Datendatei.
 * @param {{onUnlock?: () => void}} [options] - onUnlock läuft nach einer
 *   Eingabe (nicht, wenn die Seite gleich frei war) - die Hauptseite lässt
 *   dann den Kinovorhang aufgehen.
 * @returns {boolean} true, wenn die Seite sofort frei ist.
 */
export function openGate(access, { onUnlock = () => {} } = {}) {
  // Ohne Web Crypto (Seite über http statt https) lässt sich nichts prüfen
  if (!access || remembered(access.hash) || !globalThis.crypto?.subtle) {
    release();
    return true;
  }
  root.dataset.gate = "locked";

  const gate = document.createElement("div");
  gate.className = "site-gate";
  gate.innerHTML = `
    <form class="site-gate-card" role="dialog" aria-modal="true" aria-labelledby="gate-title" novalidate>
      <img class="site-gate-logo" src="assets/logo.svg" alt="" width="96" height="96" decoding="async">
      <h1 id="gate-title">${escapeHtml(SITE_TITLE)}</h1>
      <p class="meta">Bitte das Passwort eingeben.</p>
      <label class="visually-hidden" for="gate-password">Passwort</label>
      <div class="site-gate-row">
        <input id="gate-password" type="password" autocomplete="current-password" spellcheck="false">
        <button class="button" type="submit">Eintreten</button>
      </div>
      <p class="site-gate-error" id="gate-error" aria-live="polite"></p>
    </form>`;
  document.body.append(gate);

  const form = gate.querySelector("form");
  const input = gate.querySelector("#gate-password");
  const error = gate.querySelector("#gate-error");
  input.focus();
  input.addEventListener("input", () => { error.textContent = ""; gate.classList.remove("is-wrong"); });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!input.value.trim()) { error.textContent = "Bitte das Passwort eingeben."; input.focus(); return; }
    if (!(await checkPassword(input.value, access))) {
      error.textContent = "Das Passwort stimmt nicht.";
      gate.classList.remove("is-wrong");
      void gate.offsetWidth; // Wackeln neu starten
      gate.classList.add("is-wrong");
      input.select();
      return;
    }
    remember(access.hash);
    release();
    gate.classList.add("is-leaving");
    const done = () => gate.remove();
    gate.addEventListener("animationend", done, { once: true });
    setTimeout(done, 600); // Rückfall ohne Animation
    onUnlock();
  });
  return false;
}

/** Die Daten fehlen oder sind kaputt: Seite freigeben, damit die Fehlermeldung zu sehen ist. */
export const releaseGate = release;
