/*
 * Tests zu den Klick-Animationen (js/logic/link-transition-logic.js): welche
 * Klicks einen Effekt bekommen, wann navigiert wird, Ausschnitt für den Zoom.
 */
import {
  CLICK_EFFECTS, CLICK_DURATIONS, DEFAULT_CLICK_EFFECT, DEFAULT_CLICK_DURATION,
  normalizeClickEffect, normalizeClickDuration, navigationDelay, classifyLinkClick, zoomClip, monogramOf,
} from "../js/logic/link-transition-logic.js";

let ok = 0, bad = 0;
const check = (name, cond, detail = "") => { cond ? ok++ : bad++; console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail !== "" ? "  [" + JSON.stringify(detail) + "]" : "")); };

const PAGE = "chrome-extension://abcdef/index.html";
const SUB = "chrome-extension://abcdef/views/bookmarks.html";
const click = (href, extra = {}) => classifyLinkClick({ button: 0, href, ...extra }, PAGE);

console.log("Einstellungen");
check("Effekte (Zoom, „Aus“) und Dauern wie vorgegeben, Standard Zoom / 450 ms", CLICK_EFFECTS.join() === "zoom,off" && CLICK_DURATIONS.join() === "250,450,800" && DEFAULT_CLICK_EFFECT === "zoom" && DEFAULT_CLICK_DURATION === 450);
check("Unbekannte Werte → Standard", normalizeClickEffect("wipe") === "zoom" && normalizeClickEffect(undefined) === "zoom" && normalizeClickDuration(999) === 450 && normalizeClickDuration(undefined) === 450);
check("Gültige Werte bleiben, auch als Text gespeicherte Zahl; früherer Effekt „Vorhang“ → Zoom", normalizeClickEffect("curtain") === "zoom" && normalizeClickEffect("off") === "off" && normalizeClickDuration("800") === 800 && normalizeClickDuration(250) === 250);

console.log("Zeitpunkt der Navigation");
check("Erst nach der ganzen Animation (250 / 450 / 800 ms)", navigationDelay(250) === 250 && navigationDelay(450) === 450 && navigationDelay(800) === 800);

console.log("Welche Klicks bekommen einen Effekt");
check("Externer Link (Favorit) → mit Effekt, extern", JSON.stringify(click("https://de.wikipedia.org")) === JSON.stringify({ url: "https://de.wikipedia.org/", internal: false }));
check("Unterseite (relativ) → mit Effekt, intern", JSON.stringify(click("views/movies.html")) === JSON.stringify({ url: "chrome-extension://abcdef/views/movies.html", internal: true }));
check("Detailseite mit Parameter → intern", click("views/movie.html?id=m1")?.internal === true);
check("Von der Unterseite zurück zur Übersicht (../index.html) → intern", classifyLinkClick({ button: 0, href: "../index.html" }, SUB)?.url === PAGE);
check("Strg-, Cmd-, Umschalt-, Alt-Klick → Browser-Standard", ["ctrlKey", "metaKey", "shiftKey", "altKey"].every(key => click("https://x.de", { [key]: true }) === null));
check("Mittelklick / Rechtsklick → Browser-Standard", click("https://x.de", { button: 1 }) === null && click("https://x.de", { button: 2 }) === null);
check("target=\"_blank\" → Browser-Standard, target=\"_self\" → mit Effekt", click("https://x.de", { target: "_blank" }) === null && click("https://x.de", { target: "_self" }) !== null);
check("Download-Link → Browser-Standard", click("blob:abc", { download: true }) === null && click("https://x.de/a.zip", { download: true }) === null);
check("Bereits von der Seite behandelt (preventDefault) → nichts tun", click("https://x.de", { defaultPrevented: true }) === null);
check("Ausdrücklich ausgenommen (data-no-transition) → nichts tun", click("https://x.de", { optOut: true }) === null);
check("Sprungmarke auf derselben Seite (#main) → Browser-Standard", click("#main") === null && click("index.html#main") === null);
check("Andere Protokolle (mailto:, javascript:, chrome://) → Browser-Standard", click("mailto:a@b.de") === null && click("javascript:void(0)") === null && click("chrome://settings") === null);
check("Leeres oder ungültiges href → nichts tun", click("") === null && click(null) === null && click("http://[::1") === null);

console.log("Kachel-Zoom: Ausschnitt");
const clip = zoomClip({ left: 100, top: 50, right: 300, bottom: 90 }, { width: 1600, height: 900 }, 8);
check("Startet exakt auf dem Element (oben, rechts, unten, links, Radius)", clip.from === "inset(50px 1300px 810px 100px round 8px)", clip.from);
check("Endet als Vollbild ohne Rundung", clip.to === "inset(0px 0px 0px 0px round 0px)");
const off = zoomClip({ left: -20, top: 850, right: 180, bottom: 950 }, { width: 1600, height: 900 }, 0);
check("Teilweise außerhalb des Fensters: keine negativen Werte", !/-/.test(off.from), off.from);

console.log("Monogramm");
check("Erster Buchstabe, groß", monogramOf("  wikipedia") === "W" && monogramOf("Blu-ray.com") === "B");
check("Umlaut, Ziffer, Sonderzeichen davor", monogramOf("übersicht") === "Ü" && monogramOf("2001: Odyssee") === "2" && monogramOf("„Arrival“") === "A");
check("Ohne Buchstaben → Punkt", monogramOf("…") === "•" && monogramOf("") === "•");

console.log(bad ? `\n✗ ${bad} von ${ok + bad} Prüfungen fehlgeschlagen` : `\n✓ Alle ${ok} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
