import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetItem, Project, Room } from "@/lib/types";

export async function loadProjectBudget(
  supabase: SupabaseClient,
  projectId: string,
) {
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single<Project>();
  if (!project)
    return { error: "Proyecto no encontrado", status: 404 } as const;

  const [items, rooms] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .returns<BudgetItem[]>(),
    supabase
      .from("rooms")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .returns<Room[]>(),
  ]);
  if (items.error || rooms.error)
    return {
      error: "No se pudo leer el presupuesto. Intentalo de nuevo.",
      status: 500,
    } as const;
  return { project, items: items.data ?? [], rooms: rooms.data ?? [] };
}
