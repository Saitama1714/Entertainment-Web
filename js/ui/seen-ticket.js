import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { formatDay } from "../utils/format.js";

/*
 * Eintrittskarte auf der Detailseite: zeigt, ob ein Titel gesehen ist. Noch
 * offen = ganze Karte mit Abschnitt „Einlass"; gesehen = Abschnitt
 * abgerissen, Stempel „Gesehen" und das Datum. Im Dashboard reißt
 * „Als gesehen markieren" den Abschnitt ab (playTicket), auf der Website
 * steht die Karte nur da.
 *
 * Die Karte ist ein Gegenstand mit eigenen Papierfarben (in beiden Designs
 * gleich, siehe .seen-ticket in css/app.css).
 * Gemeinsam mit der Website (gemeinsam.txt).
 */

const EASE_SPRING = "cubic-bezier(.34, 1.4, .5, 1)";

/** Text auf der Karte: das Datum - ohne Datum heißt die Karte schlicht „eingelöst". */
const stateLabel = movie => (movie.seen ? formatDay(movie.seenAt) || "Eingelöst" : "Noch offen");

/**
 * @param {{seen: boolean, seenAt?: string}} movie
 * @returns {string}
 */
export function seenTicketHtml(movie) {
  return `
    <div class="seen-ticket${movie.seen ? " is-seen" : ""}" data-seen-ticket role="img"
         aria-label="${movie.seen ? `Gesehen${movie.seenAt ? ` am ${escapeHtml(formatDay(movie.seenAt))}` : ""}` : "Noch nicht gesehen"}">
      <div class="seen-ticket-main" aria-hidden="true">
        <span class="seen-ticket-kicker">Eintrittskarte</span>
        <span class="seen-ticket-state">${escapeHtml(stateLabel(movie))}</span>
        <span class="seen-ticket-stamp">Gesehen</span>
      </div>
      <div class="seen-ticket-stub" aria-hidden="true"><span>Einlass</span></div>
    </div>`;
}

/**
 * Spielt den Wechsel auf der vorhandenen Karte: Abschnitt abreißen und
 * stempeln (gesehen) bzw. Abschnitt wieder ansetzen (doch nicht gesehen).
 * @param {Element|null} ticket - .seen-ticket
 * @param {{seen: boolean, seenAt?: string}} movie - neuer Stand.
 * @returns {Promise<void>} sobald die Karte fertig ist.
 */
export async function playTicket(ticket, movie) {
  if (!ticket) return;
  const stub = ticket.querySelector(".seen-ticket-stub");
  const stamp = ticket.querySelector(".seen-ticket-stamp");
  const label = ticket.querySelector(".seen-ticket-state");
  ticket.setAttribute("aria-label", movie.seen ? "Gesehen" : "Noch nicht gesehen");
  const quiet = reducedMotion();
  const finished = animation => animation.finished.catch(() => {});

  if (movie.seen) {
    if (!quiet) {
      await finished(stub.animate([
        { transform: "none" },
        { transform: "rotate(-5deg)", offset: .14 },
        { transform: "translate(10px, 3px) rotate(10deg)", offset: .38, opacity: 1 },
        { transform: "translate(46px, 150px) rotate(52deg)", opacity: 0 },
      ], { duration: 760, easing: "cubic-bezier(.5, 0, .75, 0)", fill: "forwards" }));
      await finished(stub.animate([{ width: `${stub.offsetWidth}px` }, { width: "0px", borderLeftWidth: "0px" }],
        { duration: 160, easing: "ease-out", fill: "forwards" }));
    }
    label.textContent = stateLabel(movie);
    ticket.classList.add("is-seen");
    stub.getAnimations().forEach(animation => animation.cancel());
    if (!quiet) {
      await finished(stamp.animate([
        { opacity: 0, transform: "scale(1.9) rotate(-4deg)" },
        { opacity: 1, offset: .6 },
        { opacity: .9, transform: "none" },
      ], { duration: 420, easing: EASE_SPRING }));
    }
    return;
  }

  ticket.classList.remove("is-seen");
  label.textContent = stateLabel(movie);
  if (!quiet) {
    await finished(stub.animate([{ opacity: 0, transform: "translateX(16px)" }, { opacity: 1, transform: "none" }],
      { duration: 340, easing: "cubic-bezier(.2, .8, .2, 1)" }));
  }
}
