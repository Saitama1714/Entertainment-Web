import { escapeHtml } from "../utils/dom.js";
import { formatDay } from "../utils/format.js";

/*
 * Kinoticket auf der Detailseite (Entwurf „Goldprägung, Chamois"): zeigt, ob
 * ein Titel gesehen ist. Gesehen = „Bewertet am" und das Bewertungsdatum von
 * IMDb in Gold (wann wirklich gesehen wurde, weiß IMDb nicht), der Abschnitt
 * „Einlass" liegt abgerissen daneben (ohne Bewertungsdatum nur „Gesehen");
 * noch offen = „Eintrittskarte / Noch offen", der Abschnitt hängt noch dran.
 * Reine Anzeige - ob ein Titel gesehen ist, kommt aus dem IMDb-Import.
 *
 * Aussehen: .seen-ticket in css/detail.css, Schrift Cinzel aus assets/fonts.
 */

/**
 * @param {{seen: boolean, dateRated?: string}} movie
 * @returns {string}
 */
export function seenTicketHtml(movie) {
  const date = movie.seen ? formatDay(movie.dateRated) : "";
  const label = movie.seen ? `Gesehen${date ? `, bewertet am ${date}` : ""}` : "Noch nicht gesehen";
  const lines = movie.seen
    ? (date
      ? `<span class="seen-ticket-kicker">Bewertet am</span><span class="seen-ticket-value">${escapeHtml(date)}</span>`
      : `<span class="seen-ticket-value">Gesehen</span>`)
    : `<span class="seen-ticket-kicker">Eintrittskarte</span><span class="seen-ticket-value">Noch offen</span>`;
  return `
    <div class="seen-ticket ${movie.seen ? "is-seen" : "is-open"}" data-seen-ticket role="img" aria-label="${escapeHtml(label)}">
      <div class="seen-ticket-card" aria-hidden="true">${lines}</div>
      <div class="seen-ticket-stub" aria-hidden="true"><span>Einlass</span></div>
    </div>`;
}
