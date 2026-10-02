/**
 * Medientypen und ihre Abzeichen auf den Karten. Eigene Datei, weil Dashboard
 * und Website (Entertainment-Web) sie gemeinsam nutzen - siehe
 * docs/ENTWICKLUNG.md, „Gemeinsamer Code mit der Website".
 */

/** Wählbare Medien (Bearbeiten-Formular, Filter-Chips). */
export const MEDIA_TYPES = ["DVD", "Blu-ray", "UHD Blu-ray", "Digital", "Sonstiges"];

/**
 * Anzeige-Infos je Medientyp für den Karten-Badge: entweder ein kurzes Kürzel
 * (label) oder ein Icon (siehe utils/icons.js), plus Farbton (tone).
 */
export const MEDIA_BADGES = {
  "DVD": { label: "DVD", tone: "gray" },
  "Blu-ray": { label: "BD", tone: "blue" },
  "UHD Blu-ray": { label: "4K", tone: "green" },
  "Digital": { icon: "cloud", tone: "gray" },
  "Sonstiges": { label: "—", tone: "gray" },
};
