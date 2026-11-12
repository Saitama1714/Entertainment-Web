/*
 * Tastatur im Cover-Raster (2.43): welche Karte kommt nach einer Pfeiltaste?
 * Reine Rechnung auf den Positionen der Karten - so stimmt es bei jeder
 * Spaltenzahl (das Raster bricht je nach Fensterbreite anders um).
 * Getestet in tests/grid-nav.test.mjs; die Tasten fängt js/ui/grid-keys.js ab.
 */

/**
 * Zeilen bilden: Karten mit (fast) gleicher Oberkante gehören zusammen.
 * @param {{top: number, left: number}[]} boxes
 * @returns {number[][]} Indizes je Zeile, von links nach rechts.
 */
export function gridRows(boxes) {
  const rows = [];
  boxes
    .map((box, index) => ({ ...box, index }))
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .forEach(box => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.top - box.top) < 8) row.items.push(box);
      else rows.push({ top: box.top, items: [box] });
    });
  return rows.map(row => row.items.sort((a, b) => a.left - b.left).map(item => item.index));
}

/**
 * Ziel einer Taste.
 * @param {{top: number, left: number, width?: number}[]} boxes - Positionen aller Karten (Reihenfolge wie im Raster).
 * @param {number} index - die gerade fokussierte Karte.
 * @param {string} key - ArrowLeft/ArrowRight/ArrowUp/ArrowDown/Home/End/PageUp/PageDown
 * @param {{page?: number}} [options] - page: Zeilen pro Bild-Taste.
 * @returns {number} Index des Ziels (gleich index, wenn es nicht weitergeht).
 */
export function gridStep(boxes, index, key, { page = 3 } = {}) {
  if (!boxes.length || index < 0 || index >= boxes.length) return index;
  if (key === "Home") return 0;
  if (key === "End") return boxes.length - 1;
  // Links/rechts folgen der Lesereihenfolge - am Zeilenende geht es in der nächsten Zeile weiter
  if (key === "ArrowLeft") return Math.max(0, index - 1);
  if (key === "ArrowRight") return Math.min(boxes.length - 1, index + 1);
  const steps = { ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page }[key];
  if (!steps) return index;
  const rows = gridRows(boxes);
  const rowIndex = rows.findIndex(row => row.includes(index));
  const targetRow = rows[Math.max(0, Math.min(rows.length - 1, rowIndex + steps))];
  if (!targetRow || targetRow === rows[rowIndex]) return index;
  // Gleiche Spalte - oder die nächstgelegene (letzte Zeile ist oft kürzer)
  const center = box => box.left + (box.width || 0) / 2;
  const x = center(boxes[index]);
  return targetRow.reduce((best, candidate) => (Math.abs(center(boxes[candidate]) - x) < Math.abs(center(boxes[best]) - x) ? candidate : best), targetRow[0]);
}
