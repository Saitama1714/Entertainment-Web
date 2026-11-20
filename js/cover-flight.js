/*
 * Cover-Flug, Landeplatz auf der Detailseite (views/movie.html, titel.html).
 *
 * Den Flug selbst spielt die Seite mit dem Raster (playCoverFlight in
 * js/ui/link-transition.js): Das angeklickte Cover fliegt an die Stelle, an
 * der es hier stehen wird, dann erst wird navigiert. Der Browser hält dieses
 * letzte Bild, bis die Detailseite zum ersten Mal zeichnet - und genau dann
 * muss das Cover schon im Rahmen sitzen, sonst blitzt eine Lücke auf.
 *
 * Seit 2.54 baut es auch die Bühne gleich mit auf (unscharfes Cover und
 * Lichtschein in den mitgegebenen Farben), so wie sie der Schleier des Flugs
 * zeigte, und hält den Seitenwechsel an, bis das Cover entschlüsselt ist.
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
    if (done) return null;
    const frame = document.querySelector("[data-cover-landing]");
    if (!frame) return null;
    done = true;
    let handoff = null;
    try {
      handoff = JSON.parse(sessionStorage.getItem(KEY) || "null");
      sessionStorage.removeItem(KEY);
    } catch { return null; }
    const id = new URLSearchParams(location.search).get("id");
    if (!handoff || handoff.id !== id || !(Date.now() - handoff.at < MAX_AGE_MS)) return null;
    let img = null;
    if (handoff.src && !frame.querySelector("img")) {
      img = document.createElement("img");
      img.className = "cover-image";
      img.alt = "";
      img.src = handoff.src;
      frame.prepend(img);
    }
    const heading = document.querySelector("[data-cover-title]");
    if (heading && handoff.title) heading.textContent = handoff.title;
    const root = document.documentElement;
    // Farben des Covers (vom Raster mitgegeben) - Lichtschein und Rahmen stimmen sofort
    if (Array.isArray(handoff.amb) && handoff.amb[0]) {
      root.style.setProperty("--amb-1", handoff.amb[0]);
      root.style.setProperty("--amb-2", handoff.amb[1] || handoff.amb[0]);
    }
    // Die Bühne steht schon, wie im Schleier des Flugs (js/movie-detail.js übernimmt sie)
    if (handoff.src && document.body && !document.getElementById("detail-backdrop")) {
      const backdrop = document.createElement("div");
      backdrop.id = "detail-backdrop";
      backdrop.className = `detail-backdrop is-ready${handoff.amb ? " has-ambient" : ""}`;
      backdrop.setAttribute("aria-hidden", "true");
      backdrop.innerHTML = '<img alt="" decoding="async"><span class="detail-backdrop-glow"></span>';
      const back = backdrop.querySelector("img");
      back.dataset.src = handoff.src;
      back.src = handoff.src;
      document.body.prepend(backdrop);
    }
    root.dataset.coverLanded = "";
    return img;
  }

  /*
   * Der Seitenwechsel (css/page-transition.css) zeigt bis zu seinem Ende das
   * Cover aus dem Flug. Sind Cover und Bühne hier noch nicht entschlüsselt, hält
   * er kurz an (höchstens 0,6 s) - sonst blitzte ein leerer Rahmen auf.
   */
  function holdUntilDecoded(event, img) {
    const transition = event && event.viewTransition;
    if (!transition || !img) return;
    const back = document.querySelector("#detail-backdrop img");
    // „complete" heißt nur geladen, nicht entschlüsselt - decode() wartet genau darauf (sofort, wenn schon fertig)
    const pending = [img, back].filter(Boolean);
    if (!pending.length) return;
    transition.ready.then(() => {
      const running = document.getAnimations().filter(a => String(a.effect && a.effect.pseudoElement || "").startsWith("::view-transition"));
      if (!running.length) return;
      running.forEach(a => a.pause());
      const resume = () => running.forEach(a => { try { a.play(); } catch { /* schon vorbei */ } });
      const decoded = Promise.all(pending.map(image => image.decode().catch(() => {})));
      Promise.race([decoded, new Promise(done => setTimeout(done, 600))]).then(resume);
    }, () => {});
  }

  // Vor dem ersten Zeichnen; ältere Browser ohne pagereveal: sobald das HTML da ist
  window.addEventListener("pagereveal", event => holdUntilDecoded(event, land()), { once: true });
  document.addEventListener("DOMContentLoaded", () => land(), { once: true });
})();
