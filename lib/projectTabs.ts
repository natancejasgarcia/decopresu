export const PROJECT_TABS = [
  "Resumen", "Chat", "Archivos", "Cliente", "Medidas", "Presupuesto", "Gastos",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export function parseProjectTab(value?: string): ProjectTab {
  return PROJECT_TABS.find((tab) => tab === value) ?? "Resumen";
}

export function projectTabHref(projectId: string, tab: ProjectTab) {
  const base = `/projects/${encodeURIComponent(projectId)}`;
  return tab === "Resumen" ? base : `${base}?tab=${encodeURIComponent(tab)}`;
}
