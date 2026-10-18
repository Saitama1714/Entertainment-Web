import { buildCastGraph } from "../logic/cast-logic.js";

/*
 * Baut das Netz der Registerkarte „Besetzung" im Hintergrund (das Layout
 * braucht bei 1.000+ Titeln knapp eine Sekunde). Auftraggeber: js/ui/cast.js.
 * Nachricht: {gen, movies, castData, mode} → Antwort: {gen, graph}.
 * Die Titel kommen nur mit den nötigen Feldern; die Antwort nennt sie per id,
 * die Seite hängt ihre eigenen Objekte wieder an.
 */
self.onmessage = ({ data }) => {
  const { gen, movies, castData, mode } = data;
  const graph = buildCastGraph(movies, castData, { mode });
  for (const item of graph.items) item.movie = null;
  // core als Indizes (Verweise überstehen postMessage nicht als dieselben Objekte)
  self.postMessage({ gen, graph: { ...graph, core: graph.core.map(person => person.i) } });
};
