/*
 * Tests zum Passwort-Einlass der Website (js/logic/access-logic.js) und
 * dazu, dass das Werkzeug nur den Prüfwert veröffentlicht.
 */
import { hashPassword, createAccess, readAccess, checkPassword } from "../js/logic/access-logic.js";
import { buildPublicData } from "../js/logic/publish-logic.js";
import { parseCollection } from "../js/data-source.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };
const rejects = async fn => { try { await fn(); return ""; } catch (error) { return error.message; } };

console.log("Prüfwert");
const salt = "0123456789abcdef0123456789abcdef";
const known = await hashPassword("kino", salt);
check("SHA-256 über „Salz:Passwort\" als Hex (64 Zeichen)", /^[0-9a-f]{64}$/.test(known) && known === await hashPassword("kino", salt));
check("Anderes Salz → anderer Prüfwert", known !== await hashPassword("kino", "f".repeat(32)));
const access = await createAccess("  Popcorn 2026 ");
check("Neues Passwort: zufälliges Salz, Prüfwert passt", /^[0-9a-f]{32}$/.test(access.salt) && await checkPassword("Popcorn 2026", access));
check("Leerzeichen am Rand zählen nicht, Groß-/Kleinschreibung schon", await checkPassword(" Popcorn 2026  ", access) && !(await checkPassword("popcorn 2026", access)));
check("Falsches oder leeres Passwort → nein", !(await checkPassword("Popcorn", access)) && !(await checkPassword("", access)));
check("Leeres Passwort lässt sich nicht setzen", (await rejects(() => createAccess("   "))).includes("Passwort"));
check("Zwei Mal dasselbe Passwort → verschiedene Salze", (await createAccess("x")).salt !== (await createAccess("x")).salt);

console.log("Datendatei");
check("Gültiger Prüfwert wird gelesen", JSON.stringify(readAccess(access)) === JSON.stringify(access));
check("Kaputt oder fremd → kein Passwort", [null, "x", {}, { salt, hash: "kurz" }, { salt: "zz", hash: known }, { salt, hash: known.toUpperCase() }].every(value => readAccess(value) === null));
const backup = { version: 1, exportedAt: "2026-10-01T00:00:00Z", data: { movies: [{ id: "a", title: "Arrival" }] } };
const withAccess = buildPublicData(backup, undefined, { access: { ...access, password: "Popcorn 2026" } });
const raw = JSON.stringify(withAccess);
check("Werkzeug schreibt nur Salz und Prüfwert, nie das Passwort", raw.includes(access.hash) && !raw.includes("Popcorn") && Object.keys(withAccess.access).join() === "salt,hash");
check("Ohne Passwort: kein Feld access", !("access" in buildPublicData(backup)));
check("Website liest den Prüfwert aus der Datei", parseCollection(JSON.parse(raw)).access?.hash === access.hash && parseCollection(buildPublicData(backup)).access === null);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
