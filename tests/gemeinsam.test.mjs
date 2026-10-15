/*
 * Prüft, ob die gemeinsamen Dateien (gemeinsam.txt) noch genau so sind wie im
 * Dashboard. Der Dashboard-Ordner muss erreichbar sein: direkt neben diesem
 * Projekt (..\Dashboard) oder über DASHBOARD_DIR - sonst schlägt der Test fehl.
 * Die Logik-Tests für diese Dateien laufen nur im Dashboard; dieser Abgleich
 * stellt sicher, dass hier genau derselbe (dort geprüfte) Code liegt.
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
const dashboardFound = existsSync(join(dashboard, "manifest.json"));
check("Dashboard-Ordner gefunden (neben diesem Ordner oder über DASHBOARD_DIR)", dashboardFound, dashboardFound ? "" : `nicht gefunden: ${dashboard} - ohne ihn lässt sich der gemeinsame Code nicht abgleichen`);
if (dashboardFound) {
  const differ = files.filter(file => !existsSync(join(dashboard, file)) || !readFileSync(join(dashboard, file)).equals(readFileSync(join(root, file))));
  check("Alle gemeinsamen Dateien sind identisch mit dem Dashboard", differ.length === 0, differ);
}

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
