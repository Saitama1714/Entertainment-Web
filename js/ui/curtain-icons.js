/**
 * Fertiges SVG-Markup je wählbarem Dekorations-Symbol (siehe CURTAIN_ICONS
 * in utils/constants.js für die Liste der Optionen inkl. "none"). Jedes
 * Symbol ist ein eigenständiges, quadratisches Icon mit eigener viewBox -
 * das haltende Element (.corner-decor) skaliert es über width:100%.
 */
export const CURTAIN_ICON_MARKUP = {
  popcorn: `
    <svg viewBox="0 0 64 84" focusable="false">
      <defs>
        <clipPath id="popcorn-box-shape">
          <polygon points="6,36 58,36 51,82 13,82"/>
        </clipPath>
      </defs>
      <g class="pop-parts" fill="#f7e9c6" stroke="#d6b86e" stroke-width="1.2">
        <circle cx="15" cy="32" r="8"/>
        <circle cx="49" cy="32" r="8"/>
        <circle cx="27" cy="26" r="9"/>
        <circle cx="39" cy="25" r="9"/>
        <circle cx="21" cy="17" r="7.5"/>
        <circle cx="44" cy="15" r="7"/>
        <circle cx="32" cy="12" r="8"/>
        <circle cx="32" cy="32" r="7.5"/>
      </g>
      <polygon points="6,36 58,36 51,82 13,82" fill="#fbf8f2"/>
      <g clip-path="url(#popcorn-box-shape)" fill="#9C0205">
        <rect x="6" y="36" width="8" height="48"/>
        <rect x="22" y="36" width="8" height="48"/>
        <rect x="38" y="36" width="8" height="48"/>
        <rect x="54" y="36" width="8" height="48"/>
      </g>
      <rect x="4" y="34" width="56" height="5" rx="1.5" fill="#c9a227"/>
      <polygon points="6,36 58,36 51,82 13,82" fill="none" stroke="#6e0103" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`,

  clapperboard: `
    <svg viewBox="0 0 64 64" focusable="false">
      <rect x="13" y="30" width="38" height="21" rx="2.5" fill="#22252b"/>
      <g transform="rotate(-16 13 30)">
        <rect x="13" y="15" width="38" height="12" fill="#22252b"/>
        <rect x="17" y="15" width="4" height="12" fill="#f4f5f6"/>
        <rect x="26" y="15" width="4" height="12" fill="#f4f5f6"/>
        <rect x="35" y="15" width="4" height="12" fill="#f4f5f6"/>
        <rect x="44" y="15" width="4" height="12" fill="#f4f5f6"/>
      </g>
      <circle cx="13" cy="30" r="2.6" fill="#9C0205"/>
    </svg>`,

  ticket: `
    <svg viewBox="0 0 64 64" focusable="false">
      <rect x="8" y="21" width="48" height="22" rx="4" fill="#fdf6e3" stroke="#9C0205" stroke-width="2"/>
      <circle cx="8" cy="32" r="5.5" fill="#f4f5f6"/>
      <circle cx="56" cy="32" r="5.5" fill="#f4f5f6"/>
      <line x1="32" y1="24" x2="32" y2="40" stroke="#9C0205" stroke-width="1.6" stroke-dasharray="3,3"/>
    </svg>`,

  watermelon: `
    <svg viewBox="0 0 64 64" focusable="false">
      <path d="M32,53 L10,24 A24,24 0 0 1 54,24 Z" fill="#e2453f"/>
      <path d="M10,24 A24,24 0 0 1 54,24" stroke="#2f8f46" stroke-width="5.5" fill="none"/>
      <g class="pop-parts" fill="#22252b">
        <ellipse cx="24" cy="34" rx="2" ry="3" transform="rotate(-20 24 34)"/>
        <ellipse cx="32" cy="41" rx="2" ry="3" transform="rotate(10 32 41)"/>
        <ellipse cx="40" cy="33" rx="2" ry="3" transform="rotate(25 40 33)"/>
        <ellipse cx="30" cy="28" rx="1.8" ry="2.6" transform="rotate(-5 30 28)"/>
      </g>
    </svg>`,
};

/**
 * SVG-Markup eines Symbols; mit idSuffix werden interne IDs (z. B. der
 * Zuschnitt der Popcornbox) umbenannt, damit dasselbe Symbol gleichzeitig an
 * zwei Stellen stehen kann (Bildschirmecke + Vorschau in den Einstellungen).
 * @param {string} name - Schlüssel aus CURTAIN_ICON_MARKUP.
 * @param {string} [idSuffix=""]
 * @returns {string} Markup oder "" für "none"/unbekannt.
 */
export function curtainIconSvg(name, idSuffix = "") {
  const markup = CURTAIN_ICON_MARKUP[name] || "";
  if (!markup || !idSuffix) return markup;
  return markup
    .replace(/id="([^"]+)"/g, `id="$1${idSuffix}"`)
    .replace(/url\(#([^)]+)\)/g, `url(#$1${idSuffix})`);
}
