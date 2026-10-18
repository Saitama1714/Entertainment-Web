import { bubblePath } from "../logic/constellation-logic.js";

/*
 * Rechnet Umrisse des Sternbilds (Bubble Sets) im Hintergrund, damit das
 * Antippen eines Genres sofort reagiert. Auftraggeber: js/ui/constellation.js.
 * Nachricht: {key, gen, members, others} → Antwort: {key, gen, path}.
 */
self.onmessage = ({ data }) => {
  const { key, gen, members, others } = data;
  self.postMessage({ key, gen, path: bubblePath(members, others) });
};
