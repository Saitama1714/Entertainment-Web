/**
 * Kleine, abhängigkeitsfreie SVG-Icons für Badges und Platzhalter.
 * Bewusst inline statt Icon-Font: keine zusätzliche Datei, kein Nachladen.
 */
const ICONS = {
  disc: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 18a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17.2 9.1 4 4 0 0 1 17 18H7z"/></svg>',
  category: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" opacity=".55"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" opacity=".55"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" opacity=".3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5a7 7 0 1 0 6.32 4H16.1A5 5 0 1 1 12 7V4l4 3-4 3z"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/><path fill="currentColor" d="m5 18 5-5.5 3.2 3.4L16 12l3 4.5V18z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.3L15 17h5.5M3 17h3.3l2.4-2.7M14 7h6.5"/><path d="m17.5 4 3 3-3 3M17.5 14l3 3-3 3"/></svg>',
};

/** Gibt das rohe SVG-Markup für einen Icon-Namen zurück (leer, falls unbekannt). */
export function icon(name) {
  return ICONS[name] || "";
}
