/*
 * Cover-Flug, Landeplatz auf der Detailseite (views/movie.html, titel.html).
 *
 * Den Flug selbst spielt die Seite mit dem Raster (playCoverFlight in
 * js/ui/link-transition.js): Das angeklickte Cover fliegt an die Stelle, an
 * der es hier stehen wird, dann erst wird navigiert. Der Browser hält dieses
 * letzte Bild, bis die Detailseite zum ersten Mal zeichnet - und genau dann
 * muss das Cover schon im Rahmen sitzen, sonst blitzt eine Lücke auf.
 *
 * Darum dieses klassische Skript im <head> (kein Modul, das liefe womöglich zu
 * spät): Vor dem ersten Zeichnen (pagereveal) setzt es das vorgemerkte Bild
 * (sessionStorage „cover-flight") in den festen Rahmen [data-cover-landing]
 * und den Titel in [data-cover-title]. <link rel="expect"> im <head> sorgt
 * dafür, dass der Rahmen bis dahin gelesen ist. <html data-cover-landed>
 * lässt den Rest der Seite weich einblenden (css/cover-flight.css).
 *
 * Ohne passenden Merkzettel (Seite direkt geöffnet, neu geladen, geblättert)
 * passiert nichts.
 */
(function coverFlightLanding() {
  const KEY = "cover-flight";
  const MAX_AGE_MS = 10000; // so lange gilt ein vorgemerkter Klick
  let done = false;

  function land() {
    if (done) return;
    const frame = document.querySelector("[data-cover-landing]");
    if (!frame) return;
    done = true;
    let handoff = null;
    try {
      handoff = JSON.parse(sessionStorage.getItem(KEY) || "null");
      sessionStorage.removeItem(KEY);
    } catch { return; }
    const id = new URLSearchParams(location.search).get("id");
    if (!handoff || handoff.id !== id || !(Date.now() - handoff.at < MAX_AGE_MS)) return;
    if (handoff.src && !frame.querySelector("img")) {
      const img = document.createElement("img");
      img.className = "cover-image";
      img.alt = "";
      img.src = handoff.src;
      frame.prepend(img);
    }
    const heading = document.querySelector("[data-cover-title]");
    if (heading && handoff.title) heading.textContent = handoff.title;
    document.documentElement.dataset.coverLanded = "";
  }

  // Vor dem ersten Zeichnen; ältere Browser ohne pagereveal: sobald das HTML da ist
  window.addEventListener("pagereveal", land, { once: true });
  document.addEventListener("DOMContentLoaded", land, { once: true });
})();
