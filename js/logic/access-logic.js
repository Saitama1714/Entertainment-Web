/*
 * Passwort für die Website - ein reiner Sichtschutz.
 *
 * Das Werkzeug legt in data/sammlung.json einen Prüfwert ab
 * (`access: { salt, hash }`, SHA-256 aus Salz und Passwort); das Passwort
 * selbst steht nirgends. Die Seiten zeigen bis zur richtigen Eingabe ein
 * Overlay (js/ui/site-gate.js). Wichtig: Das ist KEIN echter Schutz - die
 * Datendatei bleibt für jeden abrufbar, der ihre Adresse kennt.
 *
 * Gemeinsam mit der Website (gemeinsam.txt): Das Dashboard erzeugt den
 * Prüfwert für die automatisch gespeicherte sammlung.json (Einstellungen →
 * Daten), die Website prüft die Eingabe. Getestet in der Website
 * (tests/access.test.mjs) und in tests/publish.test.mjs.
 */

const HEX = /^[0-9a-f]{64}$/;
const SALT = /^[0-9a-f]{32}$/;

/** Wandelt Bytes in Kleinbuchstaben-Hex um. */
const toHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");

/**
 * Prüfwert eines Passworts: SHA-256 über „Salz:Passwort" (UTF-8), als Hex.
 * Braucht Web Crypto (crypto.subtle) - im Browser nur über https oder
 * localhost, in Node ab Version 19.
 * @param {string} password
 * @param {string} salt - 32 Hex-Zeichen.
 * @returns {Promise<string>}
 */
export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

/** Neues zufälliges Salz (16 Byte, als Hex). */
export const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

/**
 * Prüfwert für ein neues Passwort (mit neuem Salz).
 * @param {string} password - darf nicht leer sein.
 * @returns {Promise<{salt: string, hash: string}>}
 */
export async function createAccess(password) {
  if (!String(password || "").trim()) throw new Error("Bitte ein Passwort eingeben.");
  const salt = newSalt();
  return { salt, hash: await hashPassword(String(password).trim(), salt) };
}

/**
 * Liest `access` aus der Datendatei. Alles, was nicht genau so aussieht wie
 * vom Werkzeug geschrieben, gilt als „kein Passwort".
 * @param {*} value
 * @returns {{salt: string, hash: string}|null}
 */
export function readAccess(value) {
  if (!value || typeof value !== "object") return null;
  const { salt, hash } = value;
  return typeof salt === "string" && typeof hash === "string" && SALT.test(salt) && HEX.test(hash) ? { salt, hash } : null;
}

/**
 * Stimmt das eingegebene Passwort? Führende/folgende Leerzeichen zählen
 * nicht (häufiger Tippfehler auf dem Handy).
 * @param {string} input
 * @param {{salt: string, hash: string}} access
 * @returns {Promise<boolean>}
 */
export async function checkPassword(input, access) {
  return (await hashPassword(String(input || "").trim(), access.salt)) === access.hash;
}
