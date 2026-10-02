import { $, escapeHtml, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { collectionStats, pickRandomUnseen } from "../logic/stats-logic.js";
import { titleKind } from "../logic/movies-logic.js";
import { movieGridHtml, settleCachedCovers } from "./movie-card.js";

/*
 * Statistik-Kachel „Auf einen Blick": Gesamt/Gesehen/Offen und der
 * Zufallspicker „Was schauen wir heute?", wahlweise nur Filme oder Serien
 * (gilt nur für die laufende Sitzung). Zahlen und Auswahl selbst berechnet
 * logic/stats-logic.js. Registerkarte unter Entertainment (views/movies.html);
 * auch auf der Website Entertainment-Web genutzt - dort ggf. ohne
 * Gesehen-Status (dann Gesamt/Filme/Serien, Vorschläge aus allem).
 */

const PICK_COUNT = 2;

/** Knopftext, wenn es für die gewählte Art nichts Ungesehenes mehr gibt. */
const EMPTY_LABELS = { "": "Alles gesehen", film: "Alle Filme gesehen", series: "Alle Serien gesehen" };

/**
 * Rendert die Statistik-Kachel „Auf einen Blick": Gesamt/Gesehen/Offen
 * sowie einen Knopf, der zufällige noch ungesehene Titel vorschlägt.
 * @param {{movies: Array}} state
 * @param {object} [options]
 * @param {string} [options.detailHref] - Detailseite (relativ zur Seite).
 * @param {string} [options.emptyText] - Text, solange es keine Titel gibt.
 * @param {boolean} [options.withSeen] - false: Daten ohne Gesehen-Status.
 */
export function renderStats(state, {
  detailHref = "movie.html", // die Kachel lebt in views/movies.html, die Detailseite im selben Ordner
  emptyText = "Zahlen und Vorschläge gibt es, sobald deine IMDb-Listen importiert sind.",
  withSeen = true,
} = {}) {
  const numbersEl = $("#stats-numbers");
  const pickerEl = $("#stats-picker");
  if (!numbersEl || !pickerEl) return;

  const stats = collectionStats(state.movies);
  if (stats.total === 0) {
    numbersEl.innerHTML = emptyState(emptyText);
    pickerEl.hidden = true;
    return;
  }

  const kinds = kind => state.movies.filter(movie => titleKind(movie) === kind).length;
  numbersEl.innerHTML = (withSeen
    ? [["Gesamt", stats.total], ["Gesehen", stats.seen], ["Offen", stats.unseen]]
    : [["Gesamt", stats.total], ["Filme", kinds("film")], ["Serien", kinds("series")]]).map(([label, value]) => `
      <div class="stat-item">
        <span class="stat-value">${value}</span>
        <span class="stat-label">${label}</span>
      </div>`).join("");

  pickerEl.hidden = false;
  const button = $("#stats-shuffle");
  const picksEl = $("#stats-picks");
  const kindSelect = $("#stats-kind");
  let shownIds = [];

  // Knopf passend zur gewählten Art: aktiv, oder deaktiviert mit Begründung
  const resetPicker = () => {
    shownIds = [];
    picksEl.innerHTML = "";
    const kind = kindSelect.value;
    const hasUnseen = pickRandomUnseen(state.movies, 1, { kind }).length > 0;
    button.disabled = !hasUnseen;
    setButtonLabel(button, hasUnseen ? "Was schauen wir heute?" : EMPTY_LABELS[kind]);
  };

  button.onclick = () => {
    const picks = pickRandomUnseen(state.movies, PICK_COUNT, { exclude: shownIds, kind: kindSelect.value });
    shownIds = picks.map(movie => movie.id);
    picksEl.innerHTML = movieGridHtml(picks, detailHref, "");
    settleCachedCovers(picksEl);
    setButtonLabel(button, "Neu mischen");
  };
  // Andere Art gewählt: alte Vorschläge passen nicht mehr - neu beginnen
  kindSelect.onchange = resetPicker;
  resetPicker();
}

/** Setzt Symbol + Text des Knopfs (beides zusammen, weil der Text wechselt). */
function setButtonLabel(button, text) {
  button.innerHTML = `<span class="btn-icon">${icon("shuffle")}</span>${escapeHtml(text)}`;
}
