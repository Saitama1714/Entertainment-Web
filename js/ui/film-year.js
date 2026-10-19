import { escapeHtml, reducedMotion } from "../utils/dom.js";
import { own, has } from "../utils/host.js";
import { ratedYears, defaultYear, yearRecap, WEEKDAYS, MONTHS } from "../logic/film-year-logic.js";
import { runtimeLabel } from "../logic/tonight-logic.js";
import { votesLabel } from "../logic/detail-logic.js";

/*
 * Registerkarte „Filmjahr" unter Entertainment: „Dein Filmjahr" als Karten
 * zum Durchblättern, in fünf Akten (wie ein Jahresrückblick à la „Wrapped").
 * Oben die Jahre (das laufende vorne, „bis heute"), links die Akte, in der
 * Mitte die Karte mit Filmstreifen als Fortschritt, rechts das Jahr in Zahlen.
 * Blättern: Pfeile, Pfeiltasten, Wischen, Filmstreifen, Akte - oder
 * „Automatisch weiter". Die Zahlen kommen aus js/logic/film-year-logic.js,
 * hier entstehen nur Texte und Bild. Dashboard spricht mit „du", die
 * Website mit „ich" (own aus js/utils/host.js).
 */

const ACTS = [
  { num: "I", name: own("Dein Jahr", "Mein Jahr"), ids: ["opening", "numbers"] },
  { num: "II", name: "Gewohnheiten", ids: ["weekday", "month", "streak", "longest"] },
  { num: "III", name: "Geschmack", ids: ["genre", "decades", "world", "people", "series"] },
  { num: "IV", name: "Höhepunkte", ids: ["surprise", "letdown", "gem", "shelf", "top"] },
  { num: "V", name: "Abspann", ids: ["type", "poster"] },
];
const actOf = id => ACTS.find(act => act.ids.includes(id));
const AUTO_MS = 6000;

const e = escapeHtml;
const n = value => Number(value).toLocaleString("de-DE");
const dec = value => Number(value).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = value => `${value > 0 ? "+" : "−"}${dec(Math.abs(value))}`;
const hours = minutes => Math.round(minutes / 60);
const href = item => `movie.html?id=${encodeURIComponent(item.id)}`;
const titleLink = item => `<a class="fy-link" href="${href(item)}">${e(item.title)}</a>`;
const listJoin = items => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`);
const dayLabel = date => `${WEEKDAYS[date.weekday].slice(0, 2)} · ${date.d}. ${MONTHS[date.m - 1]}`;
const decadeShort = d => `${String(d).slice(2)}er`;
const decadeLong = d => (d >= 2000 ? `${d}ern` : `${String(d).slice(2)}ern`);
const mediumLabel = name => (name === "UHD Blu-ray" ? "4K" : name);
const bar = (pct, i, label, hi = false) => `<span class="fy-bar${hi ? " is-hi" : ""}" style="--h:${Math.max(pct, 1.5)}%;--i:${i}"><i></i>${label !== undefined ? `<small>${label}</small>` : ""}</span>`;
const hbar = (pct, i, label, value, hi = false) => `<span class="fy-hbar${hi ? " is-hi" : ""}" style="--w:${Math.max(pct, 2)}%;--i:${i}"><span>${label}</span><i></i><b>${value}</b></span>`;

const POSTER_COLORS = [["#7a2e24", "#3b1d1a"], ["#2f5464", "#16242e"], ["#4b6236", "#1f2a1c"], ["#5d3f73", "#2b1f33"], ["#7a5c1c", "#2e2412"], ["#4a4a58", "#1a1a1f"], ["#2d6b66", "#122a2a"]];
const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function posterHtml(item, extra = "") {
  const [light, dark] = POSTER_COLORS[hash(item.title) % POSTER_COLORS.length];
  return `<a class="fy-poster ${extra}" href="${href(item)}" style="--p1:${light};--p2:${dark}">
    <span class="fy-poster-name">${e(item.title)}</span>
    ${item.cover ? `<img src="${e(item.cover)}" alt="${e(item.title)}" loading="lazy" decoding="async">` : ""}
  </a>`;
}

/* Kleine Augenzwinkern-Sätze */
const GENRE_WINK = {
  Drama: "Taschentücher: aufgebraucht.", Horror: "Das Licht im Flur bleibt an.", Komödie: "Lachmuskeln: bestens trainiert.",
  Thriller: "Fingernägel: kürzer als im Januar.", Action: "Explosionen: zahlreich. Physik: optional.", "Science-Fiction": "Lichtgeschwindigkeit: erreicht.",
  Fantasy: "Drachen gesichtet: mehrere.", Krimi: "Fall gelöst – meistens vor dem Kommissar.", Mystery: "Rätsel gelöst: fast alle.",
  Liebesfilm: "Herz: mehrfach erweicht.", Animation: "Gezeichnet, aber nicht weniger echt.", Familienfilm: "Popcorn: brüderlich geteilt.",
  Abenteuer: "Reisepass: voll gestempelt, Sofa: nie verlassen.", Dokumentarfilm: "Klugscheißer-Level: gestiegen.", Western: "Yeehaw.",
};
const GENRE_AT = {
  Drama: "beim Drama", Thriller: "beim Thriller", Komödie: "bei der Komödie", Action: "bei der Action", Abenteuer: "beim Abenteuer",
  Krimi: "beim Krimi", "Science-Fiction": "bei der Science-Fiction", Mystery: "beim Mystery", Fantasy: "bei der Fantasy",
  Familienfilm: "beim Familienfilm", Horror: "beim Horror", Liebesfilm: "beim Liebesfilm", Animation: "beim Trickfilm",
  Biografie: "bei Biografien", Kriegsfilm: "beim Kriegsfilm", Musical: "beim Musical", Geschichte: "bei der Geschichte",
  Sportfilm: "beim Sportfilm", Musikfilm: "beim Musikfilm", Dokumentarfilm: "bei Dokus", Western: "beim Western",
};

/* ---------------------------------------------------------------- Karten */

const CARDS = {
  opening(card, recap) {
    const day = card.topWeekday;
    const tail = day !== null && day !== undefined
      ? own(` und ein ${WEEKDAYS[day]}, der fast immer dir gehörte.`, ` und ein ${WEEKDAYS[day]}, der fast immer mir gehörte.`)
      : ". Popcorn bereit?";
    return `<div class="fy-curtain" aria-hidden="true"></div>
      <div class="fy-ticket fy-rise" style="--d:.9s"><small>Saison</small><b>${recap.year}</b>${recap.partial ? "<small>bis heute</small>" : ""}</div>
      <h2 class="fy-title fy-title--xl fy-rise" style="--d:1s">${own("Dein", "Mein")}<br><em>Filmjahr</em></h2>
      <p class="fy-lead fy-rise" style="--d:1.15s">${recap.partial ? own("Das Jahr läuft noch – bisher ", "Das Jahr läuft noch – bisher ") : ""}<b>${n(card.count)} Titel</b>${card.filmMinutes ? `, gut <b>${n(hours(card.filmMinutes))} Stunden</b> Film` : ""}${tail} Vorhang auf.</p>`;
  },

  numbers(card, recap) {
    const max = Math.max(...card.distribution);
    const kinds = card.other ? `${n(card.films)} · ${n(card.series)} · ${n(card.other)}` : `${n(card.films)} · ${n(card.series)}`;
    const days = card.filmMinutes / 1440;
    return `<div class="fy-big fy-rise">${n(card.count)}</div>
      <h2 class="fy-title fy-title--m fy-rise" style="--d:.15s">${own("Titel hast du bewertet.", "Titel habe ich bewertet.")}</h2>
      <div class="fy-stats">
        <p class="fy-stat fy-rise" style="--d:.3s"><b>${kinds}</b><span>${card.other ? "Filme · Serien · Sonstiges" : "Filme · Serien"}</span></p>
        <p class="fy-stat fy-rise" style="--d:.4s"><b>${n(hours(card.filmMinutes))} Std.</b><span>${days >= 1 ? `Filmzeit – ${dec(days)} Tage am Stück` : "Filmzeit, ohne Serien"}</span></p>
        <p class="fy-stat fy-rise" style="--d:.5s"><b>${dec(card.average)}</b><span>Ø Bewertung${card.previous !== null ? ` · ${recap.year - 1}: ${dec(card.previous)}` : ""}</span></p>
        <div class="fy-stat fy-rise" style="--d:.6s">
          <span class="fy-bars fy-bars--mini" role="img" aria-label="Verteilung der Noten: ${card.distribution.map((c, i) => `${i + 1}: ${c}`).join(", ")}">${card.distribution.map((c, i) => bar(max ? (c / max) * 100 : 0, i + 6, i + 1, i + 1 === card.mode)).join("")}</span>
          <span>Am häufigsten: die ${card.mode}</span>
        </div>
      </div>`;
  },

  weekday(card) {
    const max = card.topCount;
    const day = WEEKDAYS[card.top];
    const times = card.workdayAverage ? card.topCount / card.workdayAverage : 0;
    const compare = card.top < 5 ? ""
      : card.topCount > card.workdayAverage * 5 ? " – mehr als an allen Werktagen zusammen"
      : times >= 1.5 ? ` – ${dec(times)}-mal so viele wie an einem durchschnittlichen Werktag` : "";
    const lowDay = `${WEEKDAYS[card.low]}s`;
    const wink = card.low === 4 || card.low === 5
      ? `${lowDay}: ${card.lowCount === 0 ? "kein einziger" : `nur ${n(card.lowCount)}`}. ${own("Da warst du wohl unterwegs.", "Da war ich wohl unterwegs.")}`
      : `${lowDay}: ${card.lowCount === 0 ? "kein einziger" : `nur ${n(card.lowCount)}`}. Irgendwann muss man ja auch schlafen.`;
    return `<h2 class="fy-title fy-rise"><em>${day}</em><br>ist Kinotag.</h2>
      <p class="fy-lead fy-rise" style="--d:.15s"><b>${n(card.topCount)} von ${n(card.count)}</b> Bewertungen fielen auf einen ${day}${compare}.</p>
      <span class="fy-bars fy-bars--tall" role="img" aria-label="Bewertungen je Wochentag: ${card.counts.map((c, i) => `${WEEKDAYS[i]} ${c}`).join(", ")}">${card.counts.map((c, i) => bar((c / max) * 100, i, i === card.top ? `${WEEKDAYS[i].slice(0, 2)} · ${c}` : WEEKDAYS[i].slice(0, 2), i === card.top)).join("")}</span>
      <p class="fy-wink fy-rise" style="--d:.9s">${wink}</p>`;
  },

  month(card, recap) {
    const max = card.topCount;
    const days = new Date(recap.year, card.top + 1, 0).getDate();
    const quiet = card.quiet.map(i => MONTHS[i]);
    const summer = card.quiet.some(i => i >= 5 && i <= 7);
    const quietText = card.quietCount === 0
      ? `${listJoin(quiet)} ${quiet.length > 1 ? "blieben" : "blieb"} ganz ohne Film`
      : `Ruhigster Monat: ${listJoin(quiet)} mit ${quiet.length > 1 ? "je " : ""}${card.quietCount === 1 ? "einem" : n(card.quietCount)}`;
    const span = card.topCount > 1 ? ` – von <b>${titleLink(card.first)}</b> bis <b>${titleLink(card.last)}</b>` : "";
    return `<h2 class="fy-title fy-rise">Der <em>${MONTHS[card.top]}</em><br>war ${own("dein", "mein")} Monat.</h2>
      <p class="fy-lead fy-rise" style="--d:.15s"><b>${n(card.topCount)} Titel</b> in ${days} Tagen${span}.</p>
      <span class="fy-bars fy-bars--tall fy-bars--months" role="img" aria-label="Bewertungen je Monat: ${card.counts.slice(0, card.months).map((c, i) => `${MONTHS[i]} ${c}`).join(", ")}">${card.counts.map((c, i) => (i < card.months ? bar((c / max) * 100, i, MONTHS[i][0], i === card.top) : `<span class="fy-bar is-future"><i></i><small>${MONTHS[i][0]}</small></span>`)).join("")}</span>
      <p class="fy-wink fy-rise" style="--d:.9s">${quietText}${summer ? " – vermutlich war draußen Sommer." : "."}</p>`;
  },

  streak(card) {
    const more = card.times === 2 ? ` – und noch einmal im ${MONTHS[card.otherMonths[0] - 1]}` : card.times > 2 ? ` – und noch ${card.times - 1}-mal danach` : "";
    return `<h2 class="fy-title fy-rise"><em>${card.length} Abende</em><br>am Stück.</h2>
      <p class="fy-lead fy-rise" style="--d:.15s">${own("Deine", "Meine")} längste Strecke ohne Pause, geschafft im ${MONTHS[card.days[0].date.m - 1]}${more}. ${own("Das Sofa hat inzwischen deine Form.", "Das Sofa hat inzwischen meine Form.")}</p>
      <div class="fy-stubs">${card.days.map((day, i) => `<a class="fy-stub fy-rise" href="${href(day)}" style="--d:${.3 + i * .15}s;--r:${[-2, 1.5, -1, 2, -1.5][i]}deg;--x:${[0, 26, 8, 30, 4][i]}px"><small>${dayLabel(day.date)}</small><span>${e(day.title)}</span></a>`).join("")}${card.length > card.days.length ? `<p class="fy-wink">… und so weiter, ${card.length - card.days.length} weitere Abende.</p>` : ""}</div>`;
  },

  longest(card) {
    const { longest, shortest } = card;
    const ratio = longest.minutes / shortest.minutes;
    return `<h2 class="fy-title fy-rise">${own("Dein", "Mein")} längster<br>Abend: <em>${e(longest.title)}</em>.</h2>
      <p class="fy-lead fy-rise" style="--d:.15s"><b>${runtimeLabel(longest.minutes)}</b>${ratio >= 1.2 ? ` – ${dec(ratio)}-mal so lang wie ${own("dein", "mein")} kürzester Film des Jahres` : ""}. Pinkelpausen nicht eingerechnet.</p>
      <div class="fy-duel">
        <div class="fy-duel-row is-hi fy-rise" style="--d:.3s"><span>${titleLink(longest)} · ${e(longest.year)}</span><b>${n(longest.minutes)} Min.</b><i style="--w:100%"></i></div>
        <div class="fy-duel-row fy-rise" style="--d:.45s"><span>${titleLink(shortest)} · ${e(shortest.year)}</span><b>${n(shortest.minutes)} Min.</b><i style="--w:${(shortest.minutes / longest.minutes) * 100}%"></i></div>
        <p class="fy-wink">Ø Filmlänge ${runtimeLabel(Math.round(card.average))}</p>
      </div>`;
  },

  genre(card) {
    const [top, ...rest] = card.list;
    const max = top.count;
    const followers = rest.length ? ` – dicht gefolgt von ${listJoin(rest.slice(0, 2).map(g => e(g.name)))}` : "";
    const wink = GENRE_WINK[top.name] || "";
    return `<p class="fy-lead fy-rise">${own("Dein", "Mein")} Genre des Jahres</p>
      <h2 class="fy-title fy-title--xl fy-rise" style="--d:.1s"><em>${e(top.name)}</em></h2>
      <p class="fy-lead fy-rise" style="--d:.2s">In <b>${n(top.count)} von ${n(card.count)}</b> Titeln${followers}.${wink ? ` ${wink}` : ""}</p>
      <div class="fy-hbars">${card.list.map((g, i) => hbar((g.count / max) * 100, i, e(g.name), n(g.count), i === 0)).join("")}</div>`;
  },

  decades(card, recap) {
    const max = card.top.count;
    const recent = card.top.decade === Math.floor(recap.year / 10) * 10;
    const head = recent ? own("Du lebst<br>im <em>Jetzt</em>.", "Ich lebe<br>im <em>Jetzt</em>.")
      : `${own("Dein", "Mein")} Herz schlägt<br>für die <em>${decadeShort(card.top.decade)}</em>.`;
    return `<h2 class="fy-title fy-rise">${head}</h2>
      <p class="fy-lead fy-rise" style="--d:.15s"><b>${n(card.top.count)} von ${n(card.total)}</b> Titeln stammen aus den ${decadeLong(card.top.decade)}. Weitester Sprung zurück: <b>${titleLink(card.oldest)}</b>, ${card.oldest.made}.</p>
      <span class="fy-bars fy-bars--tall" role="img" aria-label="Titel je Jahrzehnt: ${card.list.map(d => `${decadeShort(d.decade)} ${d.count}`).join(", ")}">${card.list.map((d, i) => bar((d.count / max) * 100, i, d.decade === card.top.decade ? `${decadeShort(d.decade)} · ${d.count}` : decadeShort(d.decade), d.decade === card.top.decade)).join("")}</span>`;
  },

  world(card) {
    const max = card.countries[0].count;
    return `<h2 class="fy-title fy-rise">${own("Deine", "Meine")}<br><em>Weltreise</em>.</h2>
      <p class="fy-lead fy-rise" style="--d:.15s">Filme aus <b>${n(card.countryCount)} ${card.countryCount === 1 ? "Land" : "Ländern"}</b>${card.languageCount ? ` in <b>${n(card.languageCount)} ${card.languageCount === 1 ? "Sprache" : "Sprachen"}</b>` : ""}.${card.once && card.countryCount > 2 ? ` Kurzer Zwischenstopp: ${e(card.once)}.` : ""} Ohne Reisepass, mit Untertiteln.</p>
      <div class="fy-hbars">${card.countries.map((c, i) => hbar((c.count / max) * 100, i, e(c.name), n(c.count), i === 0)).join("")}</div>
      ${card.languages.length ? `<p class="fy-pills fy-rise" style="--d:.7s">${card.languages.map(l => `<span class="fy-pill">${e(l.name)}</span>`).join("")}</p>` : ""}`;
  },

  people(card) {
    const row = (label, person, i) => (person ? `<p class="fy-stat fy-rise" style="--d:${.2 + i * .15}s"><span>${label}</span><b><a class="fy-link" href="movies.html?person=${encodeURIComponent(person.name)}">${e(person.name)}</a></b><span>${n(person.titles.length)} Titel · ${e(listJoin(person.titles.slice(0, 2)))}${person.titles.length > 2 ? " …" : ""}</span></p>` : "");
    return `<h2 class="fy-title fy-rise">${own("Deine", "Meine")}<br><em>Stammbesetzung</em>.</h2>
      <div class="fy-stats fy-stats--rows">
        ${row("Regie, am häufigsten", card.dir, 0)}${row("Vor der Kamera, am häufigsten", card.act, 1)}${row("Am Drehbuch, am häufigsten", card.wri, 2)}
      </div>`;
  },

  series(card) {
    const perfect = card.best.score === 10;
    const head = card.count === 1 ? `Eine Serie:<br><em>${e(card.best.title)}</em>.`
      : perfect ? `<em>${n(card.count)} Serien</em>,<br>eine davon perfekt.`
      : `<em>${n(card.count)} Serien</em>,<br>vorn: ${e(card.best.title)}.`;
    return `<h2 class="fy-title fy-rise">${head}</h2>
      <ol class="fy-ranks">${card.list.map((s, i) => `<li class="fy-rise${i === 0 ? " is-hi" : ""}" style="--d:${.2 + i * .1}s">${titleLink(s)}<b>${s.score}</b></li>`).join("")}</ol>
      <p class="fy-wink fy-rise" style="--d:.8s">„Nur noch eine Folge …“ – ${own("hast du", "habe ich")} bestimmt nie gesagt.</p>`;
  },

  surprise(card) {
    const t = card.title;
    return `<p class="fy-lead fy-rise">Größte Überraschung</p>
      <h2 class="fy-title fy-rise" style="--d:.1s"><em>${titleLink(t)}</em></h2>
      <p class="fy-lead fy-rise" style="--d:.2s">IMDb sagt ${dec(t.imdb)}. ${own(`Du sagst ${t.score} – und du hattest recht.`, `Ich sage ${t.score} – und ich hatte recht.`)}</p>
      <div class="fy-versus">
        <div class="fy-rise" style="--d:.3s">${posterHtml(t, "fy-cover")}</div>
        <p class="fy-rise" style="--d:.35s"><span>${own("Du", "Ich")}</span><b class="fy-big fy-big--m">${t.score}</b></p>
        <p class="fy-rise" style="--d:.5s"><span>IMDb</span><b class="fy-versus-other">${dec(t.imdb)}</b></p>
      </div>
      <p class="fy-pills"><span class="fy-pill is-brass">${signed(t.diff)} über IMDb${card.next ? ` · gleichauf: ${e(card.next.title)}` : ""}</span></p>`;
  },

  letdown(card) {
    const t = card.title;
    const close = t.diff > -1.5;
    const verdict = card.critic === "mild" ? own("Ein milder Kritiker.", "Ein milder Kritiker, ich weiß.")
      : card.critic === "strict" ? own("Ein strenger Kritiker – die Welt war meist begeisterter als du.", "Ein strenger Kritiker – die Welt war meist begeisterter als ich.")
      : "Ein fairer Richter – mal drüber, mal drunter.";
    return `<p class="fy-lead fy-rise">Größte Enttäuschung</p>
      <h2 class="fy-title fy-rise" style="--d:.1s"><em>${titleLink(t)}</em></h2>
      <p class="fy-lead fy-rise" style="--d:.2s">Hier ${own("lagst du", "lag ich")} am deutlichsten unter IMDb${close ? " – und selbst das nur knapp" : ""}. Insgesamt <b>${n(card.below)} von ${n(card.compared)}</b> unter IMDb. ${verdict}</p>
      <div class="fy-versus">
        <div class="fy-rise" style="--d:.3s">${posterHtml(t, "fy-cover")}</div>
        <p class="fy-rise" style="--d:.35s"><span>${own("Du", "Ich")}</span><b class="fy-big fy-big--m is-low">${t.score}</b></p>
        <p class="fy-rise" style="--d:.5s"><span>IMDb</span><b class="fy-versus-other">${dec(t.imdb)}</b></p>
      </div>
      <p class="fy-pills"><span class="fy-pill">${signed(t.diff)} unter IMDb${card.next ? ` · danach: ${e(card.next.title)} (${signed(card.next.diff)})` : ""}</span></p>`;
  },

  gem(card) {
    const t = card.title;
    return `<p class="fy-lead fy-rise">Geheimtipp des Jahres</p>
      <h2 class="fy-title fy-title--l fy-rise" style="--d:.1s"><em>${titleLink(t)}</em></h2>
      <p class="fy-lead fy-rise" style="--d:.2s">${own("Du gibst", "Ich gebe")} eine <b>${t.score}</b> – auf IMDb haben erst <b>${n(t.votes)} ${t.votes === 1 ? "Mensch" : "Menschen"}</b> abgestimmt. Kaum jemand kennt ${own("den Titel, du schon", "den Titel, ich schon")}. Hipster-Punkte: verdient.</p>
      <div class="fy-gem fy-rise" style="--d:.3s">${posterHtml(t, "fy-cover")}<div class="fy-crowd" aria-hidden="true">${"<i></i>".repeat(59)}<i class="is-you"></i></div></div>
      ${card.famous ? `<p class="fy-wink">Zum Vergleich: ${e(card.famous.title)} hat ${votesLabel(card.famous.votes)}.</p>` : ""}`;
  },

  shelf(card) {
    const all = card.count === card.total;
    const head = all ? "<em>Alle</em><br>stehen im Regal." : `<em>${n(card.count)} davon</em><br>${card.count === 1 ? "steht" : "stehen"} im Regal.`;
    const media = card.media.length === 1 ? `${card.count === 1 ? "Auf" : "Alle auf"} ${e(mediumLabel(card.media[0].name))}` : listJoin(card.media.map(m => `${n(m.count)} auf ${e(mediumLabel(m.name))}`));
    const names = card.titles.slice(0, 3).map(t => `<b>${titleLink(t)}</b>`);
    return `<h2 class="fy-title fy-rise">${head}</h2>
      <p class="fy-lead fy-rise" style="--d:.15s">${media}${card.count > 1 ? ` – darunter ${listJoin(names)}` : ` – ${names[0]}`}. Staubwischen inklusive.</p>
      <div class="fy-shelf fy-rise" style="--d:.3s">
        <div class="fy-spines">${card.titles.map((t, i) => `<a class="fy-spine fy-spine--${mediumLabel(t.medium).toLowerCase().replace(/[^a-z0-9]/g, "")}" href="${href(t)}" style="--hgt:${[92, 86, 90, 84, 92, 88][i % 6]}%" title="${e(t.title)}">${e(t.title)}</a>`).join("")}</div>
        <div class="fy-board"></div>
      </div>`;
  },

  top(card) {
    const perfect = card.score === 10;
    const kicker = perfect
      ? (card.titles.length + card.more === 1 ? "Nur ein Titel bekam die volle Punktzahl" : `${n(card.titles.length + card.more)} Titel bekamen die volle Punktzahl`)
      : `${own("Deine", "Meine")} Höchstnote: ${card.score}`;
    const names = card.titles.map(titleLink).join(" · ");
    return `<p class="fy-lead fy-rise">${kicker}</p>
      <h2 class="fy-title ${card.titles.length > 1 ? "fy-title--m" : "fy-title--l"} fy-rise" style="--d:.1s"><em>${names}</em>${card.more ? ` <small>und ${card.more} weitere</small>` : ""}</h2>
      ${card.titles.length === 1 ? `<div class="fy-rise" style="--d:.2s">${posterHtml(card.titles[0], "fy-cover")}</div>` : ""}
      <div class="fy-marquee fy-rise" style="--d:.25s" role="img" aria-label="${own("Deine", "Meine")} Bewertung: ${card.score} von 10">
        <span class="fy-marquee-num">${card.score}</span>
        <span class="fy-marquee-side"><small>${own("Deine", "Meine")} Bewertung</small><span class="fy-bulbs">${Array.from({ length: 10 }, (_, i) => `<i class="${i < card.score ? "is-on" : ""}" style="--i:${i}"></i>`).join("")}</span></span>
      </div>
      ${card.runnersUp.length ? `<div class="fy-runners fy-rise" style="--d:.5s"><p class="fy-wink">Knapp dahinter, ${card.runnersUpCount > 1 ? "alle " : ""}mit ${card.nextScore}</p>
        <p class="fy-pills">${card.runnersUp.map(t => `<a class="fy-pill" href="${href(t)}">${e(t.title)}</a>`).join("")}${card.runnersUpCount > card.runnersUp.length ? `<span class="fy-pill">+ ${card.runnersUpCount - card.runnersUp.length}</span>` : ""}</p></div>` : ""}`;
  },

  type(card, recap) {
    const { traits } = card;
    const { prefix, noun } = card;
    const decadeText = traits.recent ? "Neues zuerst" : traits.decade !== null ? `mit Faible für die ${decadeShort(traits.decade)}` : "quer durch die Jahrzehnte";
    const genreText = traits.genre ? `das Herz ${GENRE_AT[traits.genre] || `bei ${traits.genre}`}` : "";
    const dayText = traits.day !== null ? `und wenn es ernst wird, dann ${WEEKDAYS[traits.day].toLowerCase()}s` : prefix === "Feierabend-" ? "am liebsten nach Feierabend" : "";
    const first = [decadeText, genreText, dayText].filter(Boolean).join(", ");
    const critic = { mild: "Gnädig im Urteil – nur selten unter IMDb.", strict: "Streng im Urteil – IMDb war meist begeisterter.", fair: "Fair im Urteil – mal drüber, mal drunter." }[traits.critic] || "";
    const pills = [traits.day !== null ? WEEKDAYS[traits.day] : prefix === "Feierabend-" ? "Feierabend" : "", traits.genre, traits.decade !== null ? decadeShort(traits.decade) : "", { mild: "mild", strict: "streng", fair: "fair" }[traits.critic] || ""].filter(Boolean);
    const intro = recap.partial ? own("Bisher bist du", "Bisher bin ich") : own(`${recap.year} warst du`, `${recap.year} war ich`);
    return `<p class="fy-lead fy-rise">${intro}</p>
      <span class="fy-medal fy-rise" style="--d:.15s" aria-hidden="true"><svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.5" r="1.6"/><circle cx="12" cy="16.5" r="1.6"/><circle cx="7.5" cy="12" r="1.6"/><circle cx="16.5" cy="12" r="1.6"/></svg></span>
      <h2 class="fy-title fy-title--l fy-rise" style="--d:.3s">Der ${prefix ? `<em>${e(prefix)}<br>${e(noun)}</em>` : `<em>${e(noun)}</em>`}</h2>
      <p class="fy-lead fy-rise" style="--d:.45s">${e(first.charAt(0).toUpperCase() + first.slice(1))}.${critic ? ` ${critic}` : ""}</p>
      <p class="fy-pills fy-rise" style="--d:.6s">${pills.map(p => `<span class="fy-pill">${e(p)}</span>`).join("")}</p>`;
  },

  poster(card, recap) {
    const [lead, ...rest] = card.stars;
    return `<div class="fy-collage fy-rise">${lead ? posterHtml(lead, "is-lead") : ""}${rest.map(item => posterHtml(item)).join("")}</div>
      <div class="fy-credits-head fy-rise" style="--d:.25s"><small>Eine Produktion ${own("deines", "meines")} Sofas</small><h2 class="fy-title fy-title--m">${own("Dein", "Mein")} Filmjahr <em>${recap.year}</em></h2></div>
      <dl class="fy-credits fy-rise" style="--d:.4s">
        <dt>In den Hauptrollen</dt><dd>${card.stars.map(t => e(t.title)).join(" · ")}</dd>
        <dt>Laufzeit</dt><dd>${n(card.count)} Titel${card.filmMinutes ? ` · ${n(hours(card.filmMinutes))} Stunden` : ""}</dd>
        <dt>Regie</dt><dd>${own("Du", "Ich")}</dd>
      </dl>
      <button class="fy-again fy-rise" style="--d:.6s" type="button" data-fy-again>Noch einmal von vorn</button>`;
  },
};

/* --------------------------------------------------------- Registerkarte */

const ARROW = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/**
 * Baut die Registerkarte in `panel` auf.
 * @param {HTMLElement} panel
 * @returns {{update(movies: Array, castData: object): void, show(): void}}
 */
export function initFilmYear(panel) {
  let movies = [], castData = {};
  let years = [], year = null, recap = null, index = 0, stale = true;
  let auto = false, timer = 0, direction = 1;

  panel.innerHTML = `
    <div class="fy-years" role="group" aria-label="Jahr"></div>
    <div class="fy-layout">
      <nav class="fy-acts" aria-label="Akte"></nav>
      <div class="fy-main">
        <div class="fy-strip" role="group" aria-label="Karten"></div>
        <div class="fy-stage-row">
          <button class="fy-nav" type="button" data-fy-step="-1" aria-label="Vorige Karte">${ARROW("M15 5l-7 7 7 7")}</button>
          <div class="fy-stage" tabindex="0" role="group" aria-roledescription="Karte" aria-live="polite"></div>
          <button class="fy-nav" type="button" data-fy-step="1" aria-label="Nächste Karte">${ARROW("M9 5l7 7-7 7")}</button>
        </div>
        <div class="fy-foot">
          <span class="fy-help">Pfeiltasten oder Wischen zum Blättern</span>
          <button class="fy-auto" type="button" aria-pressed="false"><i aria-hidden="true"></i>Automatisch weiter</button>
        </div>
      </div>
      <aside class="fy-aside" aria-label="Das Jahr in Zahlen"></aside>
    </div>`;
  const $ = selector => panel.querySelector(selector);
  const stage = $(".fy-stage");

  const cards = () => recap?.cards || [];
  const stopAuto = () => { auto = false; clearInterval(timer); $(".fy-auto").setAttribute("aria-pressed", "false"); };
  const restartAuto = () => {
    clearInterval(timer);
    if (!auto) return;
    timer = setInterval(() => {
      if (panel.hidden || !panel.isConnected) { stopAuto(); return; }
      go(index + 1, { fromAuto: true });
      if (index >= cards().length - 1) stopAuto(); // am Plakat ist Schluss
    }, AUTO_MS);
  };

  function renderYears() {
    $(".fy-years").innerHTML = years.map(entry => `<button class="fy-year" type="button" data-fy-year="${entry.year}" aria-pressed="${entry.year === year}">${entry.year}${entry.year === new Date().getFullYear() ? "<small>bis heute</small>" : ""}</button>`).join("");
  }

  function renderAside() {
    const opening = cards().find(card => card.id === "numbers");
    $(".fy-aside").innerHTML = opening ? `<p class="fy-aside-kicker">${recap.year}${recap.partial ? " bis heute" : ""} in Zahlen</p>
      <p class="fy-stat"><b>${n(opening.count)}</b><span>Titel bewertet</span></p>
      ${opening.filmMinutes ? `<p class="fy-stat"><b>${n(hours(opening.filmMinutes))} Std.</b><span>Filmzeit</span></p>` : ""}
      <p class="fy-stat"><b>${dec(opening.average)}</b><span>Ø Bewertung</span></p>` : "";
  }

  function renderCard() {
    const list = cards();
    const card = list[index];
    const act = actOf(card.id);
    const actIndex = ACTS.indexOf(act);
    $(".fy-acts").innerHTML = ACTS.map((a, i) => {
      const first = list.findIndex(c => a.ids.includes(c.id));
      return first < 0 ? "" : `<button class="fy-act" type="button" data-fy-go="${first}" aria-current="${i === actIndex ? "step" : "false"}"><b>Akt ${a.num}</b><span>${e(a.name)}</span></button>`;
    }).join("");
    $(".fy-strip").innerHTML = list.map((c, i) => `<button class="fy-seg${i === index ? " is-now" : i < index ? " is-done" : ""}" type="button" data-fy-go="${i}" aria-label="Karte ${i + 1} von ${list.length}"${i === index ? ' aria-current="step"' : ""}></button>`).join("");
    stage.innerHTML = `<article class="fy-card fy-card--${card.id}${direction < 0 ? " is-back" : ""}" data-card="${card.id}" aria-label="Karte ${index + 1} von ${list.length}">
      <p class="fy-kick"><span>Akt ${act.num} · ${e(act.name)}</span><i>${String(index + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}</i></p>
      ${CARDS[card.id](card, recap)}
    </article>`;
    stage.querySelectorAll(".fy-poster img").forEach(img => img.addEventListener("error", () => img.remove(), { once: true }));
    $('[data-fy-step="-1"]').disabled = index === 0;
    $('[data-fy-step="1"]').disabled = index === list.length - 1;
  }

  function render() {
    years = ratedYears(movies);
    if (!years.some(entry => entry.year === year)) year = defaultYear(years);
    if (year === null) {
      stopAuto();
      panel.classList.add("is-empty");
      $(".fy-stage").innerHTML = `<div class="empty-state"><p>${own("Sobald du Titel auf IMDb bewertest und importierst, entsteht hier dein Filmjahr.", "Hier entsteht mein Filmjahr, sobald ich Titel bewertet habe.")}</p></div>`;
      $(".fy-years").innerHTML = ""; $(".fy-acts").innerHTML = ""; $(".fy-strip").innerHTML = ""; $(".fy-aside").innerHTML = "";
      return;
    }
    panel.classList.remove("is-empty");
    recap = yearRecap(movies, castData, year, { media: has("medium") });
    index = Math.min(index, recap.cards.length - 1);
    renderYears();
    renderAside();
    renderCard();
    stale = false;
  }

  function go(next, { fromAuto = false } = {}) {
    const list = cards();
    const target = Math.max(0, Math.min(list.length - 1, next));
    if (target === index) return;
    direction = target > index ? 1 : -1;
    index = target;
    renderCard();
    if (!fromAuto) restartAuto();
  }

  panel.addEventListener("click", event => {
    const yearButton = event.target.closest("[data-fy-year]");
    if (yearButton) {
      year = Number(yearButton.dataset.fyYear);
      index = 0; direction = 1;
      render();
      panel.querySelector(`[data-fy-year="${year}"]`)?.focus();
      restartAuto();
      return;
    }
    const step = event.target.closest("[data-fy-step]");
    if (step) { go(index + Number(step.dataset.fyStep)); return; }
    const jump = event.target.closest("[data-fy-go]");
    if (jump) { go(Number(jump.dataset.fyGo)); return; }
    if (event.target.closest("[data-fy-again]")) { stopAuto(); go(0); stage.focus(); return; }
    if (event.target.closest(".fy-auto")) {
      auto = !auto;
      $(".fy-auto").setAttribute("aria-pressed", String(auto));
      if (auto && index >= cards().length - 1) go(0, { fromAuto: true });
      restartAuto();
    }
  });
  panel.addEventListener("keydown", event => {
    if (event.target.closest(".fy-years") || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = { ArrowLeft: -1, ArrowRight: 1, PageUp: -1, PageDown: 1 }[event.key];
    if (key !== undefined) { event.preventDefault(); go(index + key); return; }
    if (event.key === "Home" && event.target === stage) { event.preventDefault(); go(0); }
    if (event.key === "End" && event.target === stage) { event.preventDefault(); go(cards().length - 1); }
  });
  // Wischen (Touch und Maus): waagerecht mindestens 40 px
  let startX = null, startY = 0;
  stage.addEventListener("pointerdown", event => { if (event.pointerType !== "mouse" || event.button === 0) { startX = event.clientX; startY = event.clientY; } });
  stage.addEventListener("pointerup", event => {
    if (startX === null) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    startX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener("pointercancel", () => { startX = null; });

  return {
    update(nextMovies, nextCastData) {
      movies = nextMovies || [];
      castData = nextCastData || {};
      stale = true;
      if (panel.hidden) return;
      // Läuft nebenher der Besetzungs-Abruf, ändert sich oft nichts Sichtbares: dann nicht neu zeichnen
      const before = JSON.stringify(recap);
      const keep = { year, index };
      if (year !== null && JSON.stringify(yearRecap(movies, castData, year, { media: has("medium") })) === before) { stale = false; return; }
      ({ year, index } = keep);
      render();
    },
    show() {
      if (stale || !recap) render();
      else if (!reducedMotion()) renderCard(); // Karte spielt ihren Auftritt beim Zurückkommen erneut
    },
  };
}
