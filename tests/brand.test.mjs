/*
 * Tests zum Logo-Medaillon (js/logic/brand-logic.js): ab wann es beim
 * Scrollen klein wird und wann wieder groß.
 */
import { SHRINK_AT, GROW_BELOW, isCompact } from "../js/logic/brand-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

console.log("Medaillon beim Scrollen");
check("Ganz oben groß", isCompact(0, false) === false && isCompact(0, true) === false);
check("Ein paar Pixel gescrollt: bleibt groß", isCompact(SHRINK_AT, false) === false && isCompact(20, false) === false);
check("Weiter gescrollt: wird klein", isCompact(SHRINK_AT + 1, false) === true && isCompact(2000, false) === true);
check("Klein bleibt klein bis fast ganz oben (kein Flackern an der Grenze)", isCompact(30, true) === true && isCompact(GROW_BELOW, true) === true);
check("Fast ganz oben: wieder groß", isCompact(GROW_BELOW - 1, true) === false);
check("Ungültige Scroll-Position zählt als ganz oben", isCompact(NaN, true) === false && isCompact(undefined, false) === false);
check("Schwellen sinnvoll (Wachsen unterhalb von Schrumpfen)", GROW_BELOW < SHRINK_AT);

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
