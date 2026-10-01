/*
 * Führt alle Logik-Tests nacheinander aus (ohne Browser, reines Node).
 * Aufruf: npm test   (oder: node tests/run-all.mjs)
 * Jede Datei beendet sich mit Code 1, sobald eine Prüfung fehlschlägt.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(name => name.endsWith(".test.mjs")).sort();
let failed = 0;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const result = spawnSync(process.execPath, [join(here, file)], { stdio: "inherit", cwd: here });
  if (result.status !== 0) failed++;
}
console.log(failed ? `\n✗ ${failed} von ${files.length} Testdateien fehlgeschlagen` : `\n✓ Alle ${files.length} Testdateien bestanden`);
process.exit(failed ? 1 : 0);
