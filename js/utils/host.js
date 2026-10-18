/*
 * Wo läuft der Code gerade: im Dashboard (Chrome-Erweiterung) oder auf der
 * Website Entertainment-Web? Die Website entsteht auf Anfrage mit
 * `npm run build:site` aus genau diesem Code (tools/build-site.mjs) - ihre
 * Seiten tragen <html data-site>.
 *
 * Auf der Website ist alles nur zum Anschauen: Daten kommen aus
 * data/sammlung.json (js/site/site-data.js), der Besitzer spricht („Meine
 * Bewertung" statt „Deine Bewertung"), und Angaben, die nicht veröffentlicht
 * sind (include in der Datendatei), fallen samt Filtern und Ansichten weg.
 */

const root = globalThis.document?.documentElement;

/** true auf der Website (<html data-site>), sonst false - auch in Node-Tests. */
export const SITE = Boolean(root?.hasAttribute?.("data-site"));

/** Text je Ort: own("Deine Bewertung", "Meine Bewertung"). */
export const own = (dashboard, site) => (SITE ? site : dashboard);

/** Veröffentlichte wahlweise Angaben (Website); null = alles da (Dashboard). */
let included = null;

/** Setzt die veröffentlichten Angaben (js/site/site-data.js). null = alles. */
export function setIncluded(keys) {
  included = keys ? new Set(keys) : null;
}

/**
 * Gibt es diese wahlweise Angabe? "medium", "seen", "rating", "lists", "notes"
 * (Gruppen aus js/logic/publish-logic.js). Im Dashboard immer ja.
 */
export const has = key => !included || included.has(key);
