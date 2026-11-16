/*
 * Bilder zu den Anlässen im Foyer (2.50): die Vitrine neben der Tafel, die
 * Girlande über der Tafel und die Kordeln der Oscar-Nacht. Eine Bildsprache
 * für alle: flache Formen, Messing-Konturen (#c9a45c), warmes Licht als
 * weicher Schein, Rot nur als Akzent - passend zu Programmtafel und Schaukästen.
 * Alles als SVG-Text; Bewegung (SMIL) nur, wenn `motion` an ist.
 * Die Preis-Statue der Oscar-Nacht ist eine eigene Figur (Stern auf Säule).
 */

const BRASS = "#c9a45c";
const GOLD = "#e3c27a";
const PARTY = ["#e0333a", "#e3c27a", "#4aa3c7", "#7cc06b", "#c05ab8"];

const glow = (cx, cy, r, color, opacity = 0.16) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
const animate = (motion, attr, values, dur, extra = "") => (motion ? `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite" ${extra}/>` : "");
const defs = `<defs>
  <linearGradient id="oa-gold" x1="0" x2="1"><stop offset="0" stop-color="#9c7a3a"/><stop offset=".45" stop-color="#fff1c4"/><stop offset="1" stop-color="#b8934e"/></linearGradient>
  <linearGradient id="oa-foil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset=".5" stop-color="#e3c27a"/><stop offset="1" stop-color="#9c7a3a"/></linearGradient>
  <radialGradient id="oa-flame"><stop offset="0" stop-color="#fffbe8"/><stop offset=".5" stop-color="#ffd27a"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
</defs>`;

/* ---- Bausteine ---- */
function candle(x, y, lit, motion) {
  return `<rect x="${x - 6}" y="${y - 34}" width="12" height="34" rx="2" fill="#c62a32"/><rect x="${x - 6}" y="${y - 34}" width="4" height="34" rx="2" fill="#e05a5a" opacity=".5"/>
    <line x1="${x}" y1="${y - 34}" x2="${x}" y2="${y - 39}" stroke="#2a1b10" stroke-width="1.4"/>
    ${lit ? `${glow(x, y - 46, 20, "#ffcf7a", 0.22)}<ellipse cx="${x}" cy="${y - 45}" rx="4.2" ry="8" fill="url(#oa-flame)">${animate(motion, "ry", "8;9.5;7.4;8", "1.3s")}</ellipse>` : ""}`;
}
function wreath(cx, cy, lit, motion) {
  let leaves = "";
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2, x = cx + Math.cos(a) * 74, y = cy + Math.sin(a) * 20;
    leaves += `<ellipse cx="${x}" cy="${y}" rx="15" ry="7" transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})" fill="${k % 2 ? "#245a32" : "#1d4a29"}"/>`;
  }
  const berries = [[-58, 12], [-30, 20], [4, 22], [36, 19], [62, 10], [-70, -4], [70, -5]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="4.2" fill="#c62a32"/><circle cx="${cx + dx - 1.2}" cy="${cy + dy - 1.4}" r="1.2" fill="#fff" opacity=".5"/>`).join("");
  const spots = [[-46, 4], [-16, 12], [16, 12], [46, 4]];
  return `<ellipse cx="${cx}" cy="${cy + 26}" rx="92" ry="9" fill="#000" opacity=".35"/>${leaves}
    <path d="M${cx - 18},${cy + 18} q-8,14 -18,18 M${cx + 18},${cy + 18} q8,14 18,18" stroke="#c62a32" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="${cx}" cy="${cy + 18}" r="6" fill="#c62a32"/>
    ${spots.map(([dx, dy], k) => candle(cx + dx, cy + dy, k < lit, motion)).join("")}${berries}`;
}
function gift(x, y, w, h, color, ribbon) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${color}"/><rect x="${x}" y="${y}" width="${w}" height="5" fill="#000" opacity=".12"/>
    <rect x="${x + w / 2 - 3.5}" y="${y}" width="7" height="${h}" fill="${ribbon}"/><rect x="${x}" y="${y + h / 2 - 3.5}" width="${w}" height="7" fill="${ribbon}"/>
    <path d="M${x + w / 2},${y} q-12,-14 -17,-3 q5,8 17,3 q12,-14 17,-3 q-5,8 -17,3" fill="none" stroke="${ribbon}" stroke-width="3.4" stroke-linejoin="round"/>`;
}
function santa(x, y) {
  return `<g transform="translate(${x},${y})"><ellipse cx="34" cy="96" rx="34" ry="6" fill="#000" opacity=".35"/>
    <path d="M10,52 Q34,30 58,52 L62,92 L6,92 Z" fill="#c62a32"/><rect x="6" y="84" width="56" height="9" rx="3" fill="#f1ebe2"/>
    <rect x="8" y="66" width="52" height="9" fill="#1a1110"/><rect x="27" y="65" width="14" height="11" rx="2" fill="none" stroke="${GOLD}" stroke-width="2.4"/>
    <rect x="31" y="40" width="6" height="26" fill="#f1ebe2"/>
    <circle cx="34" cy="32" r="16" fill="#f0c6a2"/>
    <path d="M16,34 Q34,64 52,34 Q46,44 34,44 Q22,44 16,34 Z" fill="#f1ebe2"/><path d="M24,38 q10,6 20,0" stroke="#e8dfd2" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M17,25 Q32,-6 56,14 L52,22 Q40,12 22,26 Z" fill="#c62a32"/><circle cx="57" cy="14" r="5.5" fill="#f1ebe2"/><rect x="16" y="20" width="37" height="8" rx="4" fill="#f1ebe2"/>
    <circle cx="28" cy="31" r="1.8" fill="#1a1110"/><circle cx="40" cy="31" r="1.8" fill="#1a1110"/><circle cx="34" cy="36" r="2.6" fill="#e08a7a"/></g>`;
}
function pumpkin(x, y, s, motion) {
  return `<g transform="translate(${x},${y}) scale(${s})">${glow(0, 4, 46, "#ff8a1a", 0.14)}
    <ellipse cx="-15" cy="6" rx="16" ry="23" fill="#c4560a"/><ellipse cx="15" cy="6" rx="16" ry="23" fill="#c4560a"/><ellipse cx="0" cy="6" rx="17" ry="24" fill="#ef7a14"/>
    <path d="M-2,-20 q2,-10 8,-12" stroke="#4a6a24" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M-13,-1 L-6,-9 L-1,-1 Z M1,-1 L6,-9 L13,-1 Z" fill="#ffd27a">${animate(motion, "opacity", "1;.65;1;.85;1", "1.8s")}</path>
    <path d="M-14,10 L-8,16 L-3,11 L2,16 L7,11 L13,16 L10,21 L-10,21 Z" fill="#ffd27a">${animate(motion, "opacity", "1;.6;1;.8;1", "1.6s")}</path></g>`;
}
function bat(x, y, s = 1) {
  return `<path transform="translate(${x},${y}) scale(${s})" d="M0,0 q7,-9 14,-2 q4,-7 8,0 q2,-4 4,0 q4,-7 8,0 q7,-7 14,2 q-9,-2 -13,5 q-5,-3 -9,2 q-4,-5 -9,-2 q-4,-7 -13,-5 Z" fill="#0b0707" stroke="#ff7a1a" stroke-width=".7"/>`;
}
function lantern(x, top, len, s, color = "#ffcf7a") {
  return `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + len}" stroke="#8a6a3a" stroke-width="1.2"/><g transform="translate(${x},${top + len}) scale(${s})">${glow(0, 24, 38, color, 0.13)}
    <path d="M-6,0 L0,-9 L6,0 Z" fill="${BRASS}"/><path d="M-10,0 L10,0 L14,11 L14,36 L10,45 L-10,45 L-14,36 L-14,11 Z" fill="#2a1b10" stroke="${BRASS}" stroke-width="1.8"/>
    <path d="M-9,13 L9,13 L9,34 L-9,34 Z" fill="${color}" opacity=".9"/><path d="M0,13 L0,34 M-9,23.5 L9,23.5 M-9,13 L9,34 M9,13 L-9,34" stroke="${BRASS}" stroke-width=".9"/>
    <path d="M-6,45 L0,54 L6,45 Z" fill="${BRASS}"/></g>`;
}
function star(x, y, s, color = GOLD) {
  return `<path transform="translate(${x},${y}) scale(${s})" d="M0,-12 L3.5,-4 L12,-4 L5,1.5 L7.5,10 L0,5 L-7.5,10 L-5,1.5 L-12,-4 L-3.5,-4 Z" fill="${color}"/>`;
}
function balloon(x, y, color, s = 1, motion, k = 0) {
  return `<g>${motion ? `<animateTransform attributeName="transform" type="translate" values="0,0;0,-5;0,0" dur="${3 + k * 0.45}s" repeatCount="indefinite"/>` : ""}
    <path d="M${x},${y + 25 * s} q-6,22 3,48" stroke="#c9b8a0" stroke-width="1" fill="none"/>
    <ellipse cx="${x}" cy="${y}" rx="${17 * s}" ry="${21 * s}" fill="${color}"/><ellipse cx="${x - 6 * s}" cy="${y - 8 * s}" rx="${4 * s}" ry="${6.5 * s}" fill="#fff" opacity=".32"/>
    <path d="M${x - 3},${y + 21 * s} L${x + 3},${y + 21 * s} L${x},${y + 26 * s} Z" fill="${color}"/></g>`;
}
/* Eigene Preis-Statue (keine Nachbildung): schlanke Figur mit erhobenem Stern auf gestuftem Sockel */
function statue(x, y, s, motion, id = "oa-st") {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#6e4f1c"/><stop offset=".3" stop-color="#d9b264"/><stop offset=".48" stop-color="#fff6d6"/><stop offset=".62" stop-color="#e3c27a"/><stop offset="1" stop-color="#6e4f1c"/></linearGradient></defs>
    <path d="M0,-118 L4.6,-104 L19,-104 L7.4,-95.5 L11.8,-81.5 L0,-90 L-11.8,-81.5 L-7.4,-95.5 L-19,-104 L-4.6,-104 Z" fill="url(#${id})"/>
    <path d="M-2.4,-82 C-3,-76 -3,-70 -3,-66 L3,-66 C3,-70 3,-76 2.4,-82 Z" fill="url(#${id})"/>
    <path d="M-9,-66 C-11,-58 -12,-46 -10,-36 C-12,-22 -11,-8 -8,4 L8,4 C11,-8 12,-22 10,-36 C12,-46 11,-58 9,-66 C6,-70 -6,-70 -9,-66 Z" fill="url(#${id})"/>
    <ellipse cx="0" cy="-71" rx="6" ry="6.5" fill="url(#${id})"/>
    <path d="M-9,-46 L9,-46 M-8.5,-22 L8.5,-22" stroke="#7a5a26" stroke-width="1" opacity=".6"/>
    <rect x="-15" y="4" width="30" height="7" fill="url(#${id})"/><rect x="-21" y="11" width="42" height="14" fill="#1a1210"/><rect x="-21" y="11" width="42" height="14" fill="none" stroke="url(#${id})" stroke-width="1.6"/>
    <rect x="-26" y="25" width="52" height="9" fill="url(#${id})"/>
    <path d="M-2,-112 L0,-118 L2,-112" fill="#fff" opacity=".7">${animate(motion, "opacity", ".2;1;.2", "2.6s")}</path></g>`;
}
function glass(x, y, rot) {
  return `<g transform="translate(${x},${y}) rotate(${rot})" stroke="#f3ead8" stroke-width="1.6" fill="rgb(255 240 200 / .14)"><path d="M0,0 L24,0 L20,30 Q12,37 4,30 Z"/><path d="M3,11 L21,11 L19,29 Q12,34 5,29 Z" fill="${GOLD}" opacity=".7" stroke="none"/><line x1="12" y1="34" x2="12" y2="56"/><line x1="3" y1="58" x2="21" y2="58"/>
    <circle cx="9" cy="20" r="1.2" fill="#fff" stroke="none"/><circle cx="14" cy="15" r="1" fill="#fff" stroke="none"/></g>`;
}

/* ---- Vitrine je Anlass (viewBox 320 × 190) ---- */
export function occasionArt(occasion, { motion = true, year = new Date().getFullYear() } = {}) {
  const m = motion;
  let body = "";
  switch (occasion.id) {
    case "advent": body = wreath(160, 120, occasion.advent || 1, m); break;
    case "xmas":
      body = `${[[30, 8], [70, 20], [120, 4], [210, 14], [270, 6]].map(([x, y]) => star(x, y + 10, 0.45, "#f1ebe2")).join("")}
        ${gift(30, 128, 50, 44, "#c62a32", "#f1ebe2")}${gift(84, 144, 36, 28, GOLD, "#c62a32")}${gift(196, 136, 42, 36, "#f1ebe2", "#c62a32")}${gift(242, 148, 32, 24, "#245a32", GOLD)}
        ${santa(126, 78)}`; break;
    case "nye":
      body = `${String(year + (occasion.newYear ? 0 : 1)).split("").map((digit, k) => `<g>${m ? `<animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="${3 + k * 0.5}s" repeatCount="indefinite"/>` : ""}<line x1="${66 + k * 52}" y1="${118 + (k % 2) * 8}" x2="${60 + k * 52}" y2="186" stroke="#b8a68a" stroke-width=".8"/><text x="${44 + k * 52}" y="${112 + (k % 2) * 8}" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="76" fill="url(#oa-foil)" stroke="#fff3cc" stroke-width=".8">${digit}</text></g>`).join("")}
        ${glass(250, 120, -12)}${glass(276, 124, 12)}`; break;
    case "oscar": // Statue im Spotlicht auf dem roten Teppich
      body = `<defs><radialGradient id="oa-spot" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff4d6" stop-opacity=".5"/><stop offset=".6" stop-color="#fff4d6" stop-opacity=".07"/><stop offset="1" stop-color="#fff4d6" stop-opacity="0"/></radialGradient>
          <radialGradient id="oa-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7b0" stop-opacity=".4"/><stop offset="1" stop-color="#ffe7b0" stop-opacity="0"/></radialGradient></defs>
        <path d="M128,-10 L192,-10 L250,172 L70,172 Z" fill="url(#oa-spot)"/>
        <path d="M-20,166 L340,166 L340,200 L-20,200 Z" fill="#4a0710"/><path d="M90,166 L230,166 L320,200 L0,200 Z" fill="#9a1520"/><path d="M90,166 L230,166" stroke="${GOLD}" stroke-width="1.2" opacity=".6"/>
        <ellipse cx="160" cy="168" rx="62" ry="8" fill="url(#oa-floor)"/>
        ${statue(160, 132, 0.95, m)}`; break;
    case "halloween":
      body = `<circle cx="252" cy="44" r="26" fill="#ffe7b0" opacity=".9"/>${glow(252, 44, 46, "#ffe7b0", 0.12)}
        ${bat(52, 40, 1.2)}${bat(206, 70, 0.9)}${bat(116, 26, 0.8)}
        ${pumpkin(86, 150, 1.15, m)}${pumpkin(166, 140, 1.5, m)}${pumpkin(240, 156, 0.95, m)}`; break;
    case "summer": {
      let bulbs = `<path d="M10,30 Q160,78 310,30" stroke="#3a2a22" stroke-width="1.6" fill="none"/>`;
      for (let k = 1; k < 9; k++) { const t = k / 9, x = 10 + 300 * t, y = 30 + 2 * 48 * t * (1 - t); bulbs += `${glow(x, y + 9, 16, "#ffd98a", 0.2)}<circle cx="${x}" cy="${y + 9}" r="6.5" fill="#ffe3a0">${animate(m, "opacity", "1;.7;1", `${2 + (k % 3)}s`)}</circle>`; }
      body = `${[[30, 90], [70, 110], [280, 96], [250, 120], [140, 100], [190, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#fff6dc" opacity=".7"/>`).join("")}${bulbs}
        <rect x="96" y="106" width="128" height="62" rx="2" fill="#efe6d8" opacity=".9"/><rect x="96" y="106" width="128" height="62" rx="2" fill="none" stroke="#8a6a3a" stroke-width="2"/><line x1="110" y1="168" x2="104" y2="188" stroke="#8a6a3a" stroke-width="2"/><line x1="210" y1="168" x2="216" y2="188" stroke="#8a6a3a" stroke-width="2"/>
        <path d="M112,152 q24,-22 48,-6 q24,-20 48,4" stroke="#4aa3c7" stroke-width="4" fill="none" opacity=".6"/>`; break;
    }
    case "ramadan":
      body = `<g transform="translate(236,52)"><circle r="30" fill="#ffe7a8"/><circle r="27" cx="13" cy="-8" fill="#1c1a2a"/>${glow(0, 0, 50, "#ffe7a8", 0.1)}</g>${star(290, 92, 0.5, "#ffe7a8")}${star(196, 30, 0.35, "#ffe7a8")}
        ${lantern(64, 0, 52, 1.2)}${lantern(126, 0, 86, 0.9)}${lantern(176, 0, 36, 0.75)}`; break;
    case "fitr":
    case "adha": {
      const c = occasion.id === "adha" ? "#f2e6c8" : GOLD;
      let chain = `<path d="M0,6 Q160,52 320,6" stroke="#8a6a3a" stroke-width="1" fill="none"/>`;
      for (let k = 1; k < 10; k++) { const t = k / 10, x = 320 * t, y = 6 + 2 * 46 * t * (1 - t); chain += star(x, y + 8, 0.5, c); }
      body = chain + lantern(40, 0, 70, 1) + lantern(280, 0, 60, 1.05);
      if (occasion.id === "adha") { // Silhouette mit Kuppeln und Minaretten in Messing
        body += `<g fill="#1d1412" stroke="${BRASS}" stroke-width="1.6">
          <path d="M70,186 L70,140 Q70,118 92,112 Q114,118 114,140 L114,186 Z"/><path d="M118,186 L118,128 Q118,92 160,82 Q202,92 202,128 L202,186 Z"/><path d="M206,186 L206,140 Q206,118 228,112 Q250,118 250,140 L250,186 Z"/>
          <rect x="52" y="96" width="10" height="90"/><path d="M50,96 L57,80 L64,96 Z"/><rect x="258" y="96" width="10" height="90"/><path d="M256,96 L263,80 L270,96 Z"/></g>
          <path d="M160,82 L160,68" stroke="${BRASS}" stroke-width="1.6"/><g transform="translate(160,62) scale(.5)"><circle r="9" fill="#f2e6c8"/><circle r="8" cx="4" cy="-3" fill="#160f0d"/></g>
          ${[[148, 150], [172, 150], [160, 132], [86, 156], [234, 156]].map(([x, y]) => `<path d="M${x - 4},${y + 10} L${x - 4},${y} Q${x},${y - 7} ${x + 4},${y} L${x + 4},${y + 10} Z" fill="#ffd27a" opacity=".85"/>`).join("")}`;
      }
      if (occasion.id === "fitr") {
        const candies = [[94, 70, "#e0333a"], [134, 82, "#4aa3c7"], [186, 82, "#7cc06b"], [226, 70, "#c05ab8"]].map(([x, y, col]) => `<line x1="${x}" y1="${y - 26}" x2="${x}" y2="${y - 8}" stroke="#8a6a3a" stroke-width=".8"/><g transform="translate(${x},${y})"><path d="M-15,-5 L-8,0 L-15,5 Z M15,-5 L8,0 L15,5 Z" fill="${col}" opacity=".8"/><ellipse rx="9" ry="6.5" fill="${col}"/><path d="M-4,-4 L4,4 M0,-6 L6,2" stroke="#fff" stroke-width="1.2" opacity=".5"/></g>`).join("");
        let pile = "";
        [[112, 150], [134, 146], [156, 144], [178, 146], [200, 150], [122, 138], [146, 134], [170, 134], [192, 139]].forEach(([x, y], k) => {
          pile += k % 3 === 2 ? `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" fill="#5a2a14"/><ellipse cx="${x - 2}" cy="${y - 2}" rx="3" ry="1.4" fill="#fff" opacity=".2"/>` : `<path d="M${x - 9},${y} L${x},${y - 7} L${x + 9},${y} L${x},${y + 7} Z" fill="#d9a04a" stroke="#7a5420"/><circle cx="${x}" cy="${y}" r="1.8" fill="#6b8a3a"/>`;
        });
        body += candies + `<ellipse cx="156" cy="182" rx="70" ry="6" fill="#000" opacity=".35"/>${pile}<path d="M96,150 Q156,196 216,150 Z" fill="url(#oa-gold)"/><rect x="146" y="170" width="20" height="8" rx="2" fill="#9c7a3a"/>`;
      }
      break;
    }
    case "bday":
      body = `${balloon(44, 52, PARTY[0], 1, m, 0)}${balloon(78, 40, PARTY[1], 1.1, m, 1)}${balloon(276, 50, PARTY[2], 1, m, 2)}${balloon(244, 38, PARTY[4], 0.9, m, 3)}
        <rect x="114" y="122" width="92" height="44" rx="4" fill="#f1ebe2"/><path d="M114,132 q11,10 23,0 q11,10 23,0 q11,10 23,0 q12,10 23,0 L206,122 L114,122 Z" fill="#c05ab8"/><rect x="108" y="164" width="104" height="8" rx="3" fill="${BRASS}"/>
        ${[132, 150, 168, 186].map((x, k) => `<rect x="${x - 2.5}" y="104" width="5" height="18" fill="${PARTY[k % 5]}"/>${glow(x, 98, 10, "#ffcf7a", 0.25)}<ellipse cx="${x}" cy="98" rx="2.8" ry="5.2" fill="url(#oa-flame)">${animate(m, "ry", "5.2;6.4;4.8;5.2", `${1.1 + k * 0.1}s`)}</ellipse>`).join("")}
        ${gift(22, 140, 44, 36, PARTY[0], GOLD)}${gift(256, 146, 40, 30, PARTY[2], "#f1ebe2")}`; break;
    case "other":
      body = `${balloon(118, 60, PARTY[0], 1.1, m, 0)}${balloon(160, 46, PARTY[1], 1.2, m, 1)}${balloon(202, 60, PARTY[2], 1.1, m, 2)}${gift(132, 140, 56, 42, PARTY[4], GOLD)}`; break;
    default: body = "";
  }
  return `<svg viewBox="0 0 320 190" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">${defs}${body}</svg>`;
}

/* ---- Girlande über der Tafel (Breite in px, Höhe 64) ---- */
export function garland(occasion, width, { motion = true } = {}) {
  const W = Math.max(200, width);
  const sag = (y, segments, depth) => Array.from({ length: segments }, (_, k) => [(W / segments) * k, (W / segments) * (k + 1)])
    .map(([x0, x1]) => ({ x0, x1, d: `M${x0},${y} Q${(x0 + x1) / 2},${y + depth * 2} ${x1},${y}` }));
  const along = (seg, t, y, depth) => ({ x: seg.x0 + (seg.x1 - seg.x0) * t, y: y + 2 * depth * t * (1 - t) });
  let out = "";
  const lights = (colors, r, segments, perSeg, y = 8, depth = 14) => {
    for (const [i, seg] of sag(y, segments, depth).entries()) {
      out += `<path d="${seg.d}" stroke="#2a1d16" stroke-width="1.6" fill="none"/>`;
      for (let j = 1; j <= perSeg; j++) {
        const p = along(seg, j / (perSeg + 1), y, depth), c = colors[(i * perSeg + j) % colors.length];
        out += `${glow(p.x, p.y + r + 2, r * 3.2, c, 0.14)}<circle cx="${p.x}" cy="${p.y + r + 2}" r="${r}" fill="${c}">${animate(motion, "opacity", "1;.5;1", `${2 + ((i + j) % 3)}s`)}</circle>`;
      }
    }
  };
  const pennants = (colors, text = "") => {
    const n = Math.max(8, Math.floor(W / 46));
    out += `<path d="M0,6 Q${W / 2},40 ${W},6" stroke="#3a2a22" stroke-width="1.2" fill="none"/>`;
    for (let k = 1; k < n; k++) {
      const t = k / n, x = W * t, y = 6 + 2 * 17 * t * (1 - t);
      out += `<path d="M${x - 12},${y} L${x + 12},${y} L${x},${y + 26} Z" fill="${colors[k % colors.length]}" stroke="#000" stroke-opacity=".25"/>`;
      const ch = text ? text[(k - 1) % (text.length + 3)] || "" : "";
      if (ch.trim()) out += `<text x="${x}" y="${y + 13}" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="10" fill="#fff">${ch}</text>`;
    }
  };
  switch (occasion.id) {
    case "advent": case "xmas": lights(["#ffcf7a", "#e0333a", "#ffcf7a", "#5fae7c", "#ffcf7a", "#4aa3c7"], 3.6, Math.max(4, Math.round(W / 220)), 6); break;
    case "summer": lights(["#ffd98a"], 6, Math.max(3, Math.round(W / 320)), 5, 6, 16); break;
    case "nye": for (const seg of sag(4, Math.max(5, Math.round(W / 180)), 12)) out += `<path d="${seg.d}" stroke="${GOLD}" stroke-width="3.4" fill="none" stroke-dasharray="1 6" stroke-linecap="round"/><path d="${seg.d}" stroke="#b8934e" stroke-width="1.2" fill="none"/>`; break;
    case "halloween": pennants(["#ff7a1a", "#121010"]); break;
    case "bday": pennants(PARTY, "HAPPY BIRTHDAY"); break;
    case "other": pennants(PARTY.slice(0, 3)); break;
    case "fitr": case "adha": case "ramadan": {
      const c = occasion.id === "adha" ? "#f2e6c8" : GOLD;
      out += `<path d="M0,4 Q${W / 2},44 ${W},4" stroke="#8a6a3a" stroke-width="1" fill="none"/>`;
      const n = Math.max(8, Math.floor(W / 70));
      for (let k = 1; k < n; k++) { const t = k / n, x = W * t, y = 4 + 2 * 20 * t * (1 - t); out += occasion.id === "ramadan" && k % 3 === 0 ? `<g transform="translate(${x},${y + 4}) scale(.55)"><circle r="9" fill="#ffe7a8"/><circle r="8" cx="4" cy="-3" fill="#1c1a2a"/></g>` : star(x, y + 8, 0.5, c); }
      break;
    }
    default: return "";
  }
  return `<svg viewBox="0 0 ${W} 64" width="${W}" height="64" aria-hidden="true" focusable="false" preserveAspectRatio="none">${defs}${out}</svg>`;
}

/** Samt-Volant mit Goldfransen über der Bühne (Oscar-Nacht), Breite in px, Höhe 110. */
export function valance(width) {
  const W = Math.max(300, width), n = Math.max(4, Math.round(W / 300));
  let out = `<defs>
    <linearGradient id="oa-vel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0509"/><stop offset=".55" stop-color="#8e121c"/><stop offset=".82" stop-color="#b8222e"/><stop offset="1" stop-color="#6e0c14"/></linearGradient>
    <linearGradient id="oa-fold" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
    <pattern id="oa-fringe" width="6" height="14" patternUnits="userSpaceOnUse"><rect width="2.2" height="14" fill="#c9a45c"/></pattern></defs>
    <rect width="${W}" height="20" fill="#2a0306"/>`;
  for (let k = 0; k < n; k++) {
    const x0 = (W / n) * k, x1 = (W / n) * (k + 1), mid = (x0 + x1) / 2;
    out += `<path d="M${x0},0 L${x1},0 L${x1},30 Q${mid},100 ${x0},30 Z" fill="url(#oa-vel)"/><path d="M${x0},0 L${x1},0 L${x1},30 Q${mid},100 ${x0},30 Z" fill="url(#oa-fold)"/>
      <path d="M${x0},30 Q${mid},100 ${x1},30 L${x1},42 Q${mid},112 ${x0},42 Z" fill="url(#oa-fringe)" opacity=".9"/>
      <path d="M${x0},30 Q${mid},100 ${x1},30" stroke="url(#oa-gold)" stroke-width="3" fill="none"/>
      <circle cx="${x1}" cy="32" r="6.5" fill="url(#oa-foil)"/><path d="M${x1 - 3.4},36 L${x1},66 L${x1 + 3.4},36 Z" fill="${BRASS}"/>`;
  }
  return `<svg viewBox="0 0 ${W} 112" width="${W}" height="112" aria-hidden="true" focusable="false" preserveAspectRatio="none">${defs}${out}</svg>`;
}

/** Roter Teppich in Perspektive mit Messingpfosten und Samtkordeln (Oscar-Nacht). */
export function carpet(width, height = 64) {
  const W = Math.max(300, width), H = height;
  const farL = W * 0.41, farR = W * 0.59, nearL = W * 0.3, nearR = W * 0.7;
  let out = `<defs>
    <linearGradient id="oa-cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a0710"/><stop offset=".5" stop-color="#8e121c"/><stop offset="1" stop-color="#b01d28"/></linearGradient>
    <linearGradient id="oa-cps" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#ffd6d0" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="oa-rope" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c22a35"/><stop offset=".5" stop-color="#7d0d16"/><stop offset="1" stop-color="#4a0710"/></linearGradient></defs>
    <path d="M${farL},0 L${farR},0 L${nearR},${H} L${nearL},${H} Z" fill="url(#oa-cp)"/><path d="M${farL},0 L${farR},0 L${nearR},${H} L${nearL},${H} Z" fill="url(#oa-cps)"/>
    <path d="M${farL + 6},0 L${nearL + 18},${H}" stroke="${GOLD}" stroke-width="1.3" opacity=".55"/><path d="M${farR - 6},0 L${nearR - 18},${H}" stroke="${GOLD}" stroke-width="1.3" opacity=".55"/>`;
  const side = (far, near) => {
    const points = [0, 0.5, 1].map(t => ({ x: far + (near - far) * t, y: (H - 4) * t, s: 0.42 + t * 0.5 }));
    let posts = "", ropesOut = "";
    points.forEach((p, k) => {
      posts += `<g transform="translate(${p.x},${p.y}) scale(${p.s})"><ellipse cx="0" cy="2" rx="13" ry="4" fill="#000" opacity=".4"/><rect x="-3" y="-38" width="6" height="38" fill="url(#oa-gold)"/><rect x="-9.5" y="-3" width="19" height="5" rx="2" fill="url(#oa-gold)"/><circle cx="0" cy="-41" r="5.4" fill="url(#oa-foil)"/></g>`;
      if (k < points.length - 1) {
        const q = points[k + 1], y1 = p.y - 32 * p.s, y2 = q.y - 32 * q.s;
        ropesOut += `<path d="M${p.x},${y1} Q${(p.x + q.x) / 2},${(y1 + y2) / 2 + 18 * (p.s + q.s) / 2} ${q.x},${y2}" stroke="url(#oa-rope)" stroke-width="${4.6 * (p.s + q.s) / 2}" fill="none" stroke-linecap="round"/>`;
      }
    });
    return ropesOut + posts;
  };
  out += side(farL - 12, nearL - 14) + side(farR + 12, nearR + 14);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false" preserveAspectRatio="none" style="overflow:visible">${defs}${out}</svg>`;
}

/** Fledermäuse, die ab und zu durchs Bild fliegen (Halloween), über die ganze Seite. */
export function batsLayer(width, height, { motion = true } = {}) {
  if (!motion) return "";
  let out = "";
  for (let k = 0; k < 4; k++) {
    const y = 90 + k * Math.max(60, height / 6), dur = 11 + k * 3;
    out += `<g opacity=".85">${bat(0, 0, 1 + (k % 2) * 0.4)}<animateTransform attributeName="transform" type="translate" values="-80,${y}; ${width * 0.5},${y - 40}; ${width + 80},${y + 10}" keyTimes="0;.5;1" dur="${dur}s" begin="${k * 3.4}s" repeatCount="indefinite"/></g>`;
  }
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${out}</svg>`;
}

/** Luftschlangen vom oberen Rand (eigener Geburtstag). */
export function streamersLayer(width, { motion = true } = {}) {
  const colors = PARTY;
  let out = "";
  [0.04, 0.16, 0.84, 0.96].forEach((f, k) => {
    const x = width * f;
    out += `<path d="M${x},0 C${x + 26},26 ${x - 26},52 ${x},80 S${x + 22},120 ${x - 4},150" stroke="${colors[k % colors.length]}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9">${motion ? `<animate attributeName="stroke-dashoffset" values="0;6;0" dur="${4 + k}s" repeatCount="indefinite"/>` : ""}</path>`;
  });
  return `<svg viewBox="0 0 ${width} 160" style="height:160px" aria-hidden="true" focusable="false" preserveAspectRatio="none">${out}</svg>`;
}
