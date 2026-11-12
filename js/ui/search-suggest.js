import { suggestions, matchSegments, peopleIndex, SUGGEST_MIN } from "../logic/suggest-logic.js";
import { escapeHtml } from "../utils/dom.js";

/*
 * Suchvorschläge (2.43): Unter dem Suchfeld klappt beim Tippen eine Liste
 * auf - Titel mit Cover, Personen und Genres, der Treffer hervorgehoben.
 * Pfeiltasten wählen, Enter nimmt: ein Titel öffnet seine Detailseite, eine
 * Person oder ein Genre wird zum Filter. Ohne gewählten Vorschlag bleibt
 * Enter, was es war (im Filmuniversum: zum ersten Treffer fliegen); Esc
 * klappt die Liste zu und leert wie gewohnt die Suche.
 * Die Rechnung steckt in js/logic/suggest-logic.js.
 */

const mark = (text, query) => matchSegments(text, query)
  .map(part => (part.hit ? `<mark>${escapeHtml(part.text)}</mark>` : escapeHtml(part.text))).join("");

const plural = (n, one, many) => `${n.toLocaleString("de-DE")} ${n === 1 ? one : many}`;

/**
 * @param {HTMLInputElement} input
 * @param {object} options
 * @param {() => Array} options.movies
 * @param {() => object} options.castData
 * @param {(id: string) => string} options.detailHref
 * @param {(person: {name: string, ids: string[]}) => void} options.onPerson
 * @param {(genre: string) => void} options.onGenre
 */
export function initSearchSuggest(input, { movies, castData, detailHref, onPerson, onGenre }) {
  if (!input) return;
  const box = document.createElement("div");
  box.className = "search-suggest";
  box.id = "search-suggest";
  box.setAttribute("role", "listbox");
  box.setAttribute("aria-label", "Vorschläge");
  box.hidden = true;
  input.parentElement.classList.add("has-suggest");
  input.after(box);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", box.id);
  input.setAttribute("aria-expanded", "false");
  input.autocomplete = "off";

  let options = [];   // [{kind, run}]
  let active = -1;
  let cache = { movies: null, cast: null, size: -1, index: null };

  const people = () => {
    const list = movies(), cast = castData();
    if (cache.movies !== list || cache.cast !== cast || cache.size !== list.length) {
      cache = { movies: list, cast, size: list.length, index: peopleIndex(list, cast) };
    }
    return cache.index;
  };

  const close = () => {
    box.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  };

  const highlight = index => {
    active = index;
    [...box.querySelectorAll(".suggest-option")].forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    const current = box.querySelector(`#suggest-${index}`);
    if (current) { input.setAttribute("aria-activedescendant", current.id); current.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };

  const render = () => {
    const query = input.value;
    if (query.trim().length < SUGGEST_MIN || document.activeElement !== input) { close(); return; }
    const found = suggestions(movies(), query, { people: people() });
    options = [];
    const option = (html, run, extra = "") => {
      const id = options.length;
      options.push(run);
      return `<div class="suggest-option${extra}" id="suggest-${id}" role="option" aria-selected="false" data-index="${id}">${html}</div>`;
    };
    const group = (label, items) => (items.length ? `<div class="suggest-group" role="presentation"><p class="suggest-label" role="presentation">${label}</p>${items.join("")}</div>` : "");
    const html = [
      group("Titel", found.titles.map(({ movie }) => option(`
        ${movie.cover ? `<img class="suggest-cover" src="${escapeHtml(movie.cover)}" alt="" loading="lazy">` : `<span class="suggest-cover is-empty"></span>`}
        <span class="suggest-text"><span class="suggest-title">${mark(movie.title, query)}</span>${movie.year ? `<span class="suggest-meta">${escapeHtml(movie.year)}</span>` : ""}</span>`,
        () => { location.href = detailHref(movie.id); }, " is-title"))),
      group("Personen", found.people.map(person => option(`
        <span class="suggest-text"><span class="suggest-title">${mark(person.name, query)}</span><span class="suggest-meta">${plural(person.ids.length, "Titel", "Titel")}</span></span>`,
        () => onPerson(person)))),
      group("Genres", found.genres.map(genre => option(`
        <span class="suggest-text"><span class="suggest-title">${mark(genre.name, query)}</span><span class="suggest-meta">${plural(genre.count, "Titel", "Titel")}</span></span>`,
        () => onGenre(genre.name)))),
    ].join("");
    if (!options.length) { close(); return; }
    box.innerHTML = html;
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight(-1);
  };

  const choose = index => {
    const run = options[index];
    if (!run) return;
    close();
    run();
  };

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) close(); }, 120));
  box.addEventListener("mousedown", event => event.preventDefault()); // Fokus bleibt im Feld
  box.addEventListener("click", event => {
    const option = event.target.closest(".suggest-option");
    if (option) choose(Number(option.dataset.index));
  });
  box.addEventListener("mousemove", event => {
    const option = event.target.closest(".suggest-option");
    if (option && Number(option.dataset.index) !== active) highlight(Number(option.dataset.index));
  });
  input.addEventListener("keydown", event => {
    if (box.hidden || event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      highlight(active + step < -1 ? options.length - 1 : active + step >= options.length ? -1 : active + step);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      event.stopImmediatePropagation(); // nicht noch zum ersten Treffer fliegen
      choose(active);
    } else if (event.key === "Escape") {
      close(); // und wie gewohnt: Esc leert die Suche (js/ui/shortcuts.js)
    } else if (event.key === "Enter") {
      close();
    }
  });
  return { close, refresh: render };
}
