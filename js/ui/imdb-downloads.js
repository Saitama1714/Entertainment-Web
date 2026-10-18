/*
 * Aufräumen im Download-Ordner nach dem IMDb-Import (Berechtigung
 * "downloads"): Die gerade importierten Dateien werden über Chromes
 * Download-Liste gefunden - gleicher Dateiname und gleiche Größe - und
 * gelöscht. Gelöscht wird nur, was Chrome selbst heruntergeladen hat.
 */

/** True, wenn die Erweiterung Downloads verwalten darf. */
export const canManageDownloads = () => Boolean(globalThis.chrome?.downloads?.search);

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {Array<{name: string, size: number}>} files - importierte Dateien.
 * @returns {Promise<number>} Anzahl gelöschter Dateien.
 */
export async function deleteImportedDownloads(files) {
  if (!canManageDownloads()) return 0;
  let removed = 0;
  for (const file of files) {
    try {
      const items = await chrome.downloads.search({ filenameRegex: `(^|[\\\\/])${escapeRegex(file.name)}$`, state: "complete", exists: true });
      const match = items.find(item => item.fileSize === file.size || item.totalBytes === file.size);
      if (!match) continue;
      await chrome.downloads.removeFile(match.id);
      await chrome.downloads.erase({ id: match.id });
      removed++;
    } catch {
      // Datei schon weg oder gesperrt - nicht schlimm, der Import ist ja fertig
    }
  }
  return removed;
}
