/*
 * Startskript im <head> jeder Seite - läuft vor dem ersten Zeichnen.
 *
 * Setzt das Design (hell/dunkel) sofort, damit nichts aufblitzt, und
 * entscheidet auf der Hauptseite (Skript-Tag mit data-intro), ob der
 * Kinovorhang spielt. <html data-curtain="fabric"> heißt: der WebGL-Vorhang
 * „Lebendiger Stoff" darf übernehmen (sonst bleibt es beim CSS-Vorhang).
 *
 * Die Einstellungen liegen nur im Browser des Besuchers (localStorage,
 * geschrieben vom Dialog „Ansicht", js/ui/site-shell.js). Bewusst ein
 * klassisches Skript ohne Module, damit es sofort und blockierend läuft.
 * Fehler (z. B. gesperrter Speicher) dürfen die Seite nie verhindern - dann
 * gilt einfach der Standard: dunkel, Vorhang spielt.
 */
(function boot() {
  const root = document.documentElement;
  // Seiten mit Daten (Skript-Tag mit data-gate): Inhalt bleibt unsichtbar,
  // bis js/ui/site-gate.js weiß, ob ein Passwort nötig ist
  if (document.currentScript && document.currentScript.hasAttribute("data-gate")) root.dataset.gate = "pending";
  try {
    const theme = localStorage.getItem("site:theme") || "dark";
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "dark" : "light";

    if (!document.currentScript || !document.currentScript.hasAttribute("data-intro")) return;
    root.dataset.curtain = "fabric";

    // Gleiche Werte wie INTRO_OPTIONS in js/utils/constants.js
    const mode = localStorage.getItem("site:intro-mode") || "visit";
    const now = new Date();
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`; // lokaler Kalendertag
    if (mode === "off") {
      root.dataset.intro = "skip";
    } else if (mode === "daily") {
      if (localStorage.getItem("site:intro-day") === today) root.dataset.intro = "skip";
      else localStorage.setItem("site:intro-day", today);
    } else {
      // "visit": einmal pro Besuch - nicht erneut, wenn man von einer
      // Detailseite zurückkommt (sessionStorage gilt, bis das Fenster zu ist)
      if (sessionStorage.getItem("site:intro-seen")) root.dataset.intro = "skip";
      else sessionStorage.setItem("site:intro-seen", "1");
    }
  } catch {
    // Standard: dunkel, Vorhang spielt (CSS-Vorhang, ohne data-curtain)
  }
})();
