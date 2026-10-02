/*
 * Prüft, ob die gemeinsamen Dateien (gemeinsam.txt) noch genau so sind wie im
 * Dashboard. Läuft nur, wenn der Dashboard-Ordner erreichbar ist: direkt
 * neben diesem Projekt (..\Dashboard) oder über DASHBOARD_DIR.
 * Abweichung? → Gemeinsames-holen.bat doppelklicken.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = process.env.DASHBOARD_DIR || resolve(root, "..", "Dashboard");
const files = readFileSync(join(root, "gemeinsam.txt"), "utf8").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.replaceAll("\\", "/"));

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

console.log("Gemeinsame Dateien mit dem Dashboard");
check("Liste gemeinsam.txt vorhanden und nicht leer", files.length > 10, files.length);
check("Alle gelisteten Dateien gibt es hier", files.every(file => existsSync(join(root, file))), files.filter(file => !existsSync(join(root, file))));
if (!existsSync(join(dashboard, "manifest.json"))) {
  console.log(`  ⏭  Dashboard-Ordner nicht gefunden (${dashboard}) - Vergleich übersprungen`);
} else {
  const differ = files.filter(file => !existsSync(join(dashboard, file)) || !readFileSync(join(dashboard, file)).equals(readFileSync(join(root, file))));
  check("Alle gemeinsamen Dateien sind identisch mit dem Dashboard", differ.length === 0, differ);
}

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
