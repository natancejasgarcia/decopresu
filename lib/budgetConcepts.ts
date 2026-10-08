export type BudgetConceptSuggestion = { concept: string; notes: string };

export const DEFAULT_BUDGET_CONCEPTS: BudgetConceptSuggestion[] = [
  {
    concept: "Pintura paredes",
    notes:
      "Preparacion de paredes interiores, proteccion de las zonas de trabajo, reparacion de pequenas imperfecciones y aplicacion de pintura de acabado. Color y acabado a concretar con el cliente. Limpieza de la zona al finalizar.",
  },
  {
    concept: "Pintura techos",
    notes:
      "Proteccion de mobiliario y pavimentos, preparacion de techos, reparacion de pequenas imperfecciones y aplicacion de pintura de acabado. Limpieza de la zona al finalizar.",
  },
  {
    concept: "Pintura de fachada",
    notes:
      "Limpieza y preparacion de la fachada, reparacion de las zonas deterioradas indicadas y aplicacion de revestimiento para exteriores. Color y acabado a concretar con el cliente.",
  },
  {
    concept: "Esmalte",
    notes:
      "Limpieza, lijado y preparacion de la superficie, imprimacion adecuada al soporte cuando proceda y aplicacion de esmalte de acabado. Color y acabado a concretar con el cliente.",
  },
  {
    concept: "Lacado de puertas",
    notes:
      "Preparacion de las puertas, limpieza, lijado, reparacion de pequenas imperfecciones y aplicacion de fondo y laca de acabado. Color y acabado a concretar con el cliente.",
  },
  {
    concept: "Lacado de muebles",
    notes:
      "Limpieza y preparacion del mobiliario, lijado, reparacion de pequenas imperfecciones y aplicacion de fondo y laca de acabado. Color y acabado a concretar con el cliente.",
  },
  {
    concept: "Barnizado de madera",
    notes:
      "Limpieza y lijado de la madera, preparacion de las zonas deterioradas y aplicacion de barniz protector. Tono y acabado a concretar con el cliente.",
  },
  {
    concept: "Pintado de rejas",
    notes:
      "Limpieza, lijado y preparacion de rejas, eliminacion de oxido superficial, imprimacion antioxidante y aplicacion de esmalte de acabado.",
  },
  {
    concept: "Colocacion de papel pintado",
    notes:
      "Preparacion del soporte, replanteo y colocacion de papel pintado, con ajuste de juntas y remates. Modelo y zonas de aplicacion a concretar con el cliente.",
  },
  {
    concept: "Reparaciones",
    notes:
      "Reparacion de las zonas indicadas, saneado de partes deterioradas, relleno de pequenas grietas y regularizacion de la superficie para su posterior acabado.",
  },
  {
    concept: "Materiales",
    notes:
      "Suministro de los materiales especificados para la realizacion de los trabajos presupuestados.",
  },
  {
    concept: "Mano de obra",
    notes:
      "Mano de obra para la realizacion de los trabajos descritos en esta partida, con preparacion de la zona y limpieza al finalizar.",
  },
];

function searchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Historical rows arrive newest first; keep the latest non-empty description.
export function buildBudgetConceptCatalog(
  history: readonly BudgetConceptSuggestion[],
) {
  const catalog = new Map<string, BudgetConceptSuggestion>();
  for (const item of [...history, ...DEFAULT_BUDGET_CONCEPTS]) {
    const concept = item.concept.trim();
    const notes = (item.notes ?? "").trim();
    if (!concept || !notes) continue;
    const key = searchKey(concept);
    if (!catalog.has(key)) catalog.set(key, { concept, notes });
  }
  return [...catalog.values()];
}

export function findBudgetConceptSuggestions(
  catalog: readonly BudgetConceptSuggestion[],
  query: string,
) {
  const key = searchKey(query);
  const words = key.split(" ").filter(Boolean);
  return catalog
    .map((item, index) => ({ item, index, key: searchKey(item.concept) }))
    .filter((entry) => words.every((word) => entry.key.includes(word)))
    .sort((a, b) => {
      const rank = (value: string) =>
        value === key ? 0 : value.startsWith(key) ? 1 : 2;
      return rank(a.key) - rank(b.key) || a.index - b.index;
    })
    .slice(0, 8)
    .map((entry) => entry.item);
}
