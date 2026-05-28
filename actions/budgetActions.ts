"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { formatCurrency } from "@/lib/calculations";
import type { Room, RoomModule } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof requireUserProfile>>["supabase"];

const budgetItemSchema = z.object({
  project_id: z.string().uuid(),
  concept: z.string().trim().min(2),
  notes: z.string().trim().optional(),
  quantity: z.preprocess((value) => (value === "" || value === null ? 1 : normalizeDecimalInput(value)), z.coerce.number().positive()),
  unit: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
  unit_price: z.preprocess(normalizeDecimalInput, z.coerce.number().min(0)),
});

export async function createBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: "Revisa concepto, cantidad y precio. Puedes usar coma o punto en los decimales." };
  }

  const sortOrder = await getNextBudgetSortOrder(supabase, parsed.data.project_id);
  const { error } = await insertBudgetRows(supabase, [
    {
      ...parsed.data,
      notes: parsed.data.notes || null,
      sort_order: sortOrder,
    },
  ]);

  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", parsed.data.project_id);

  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const itemId = z.string().uuid().parse(formData.get("item_id"));
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const { error } = await supabase
    .from("budget_items")
    .update({
      concept: parsed.data.concept,
      notes: parsed.data.notes || null,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      unit_price: parsed.data.unit_price,
    })
    .eq("id", itemId)
    .eq("project_id", parsed.data.project_id);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.data.project_id);

  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath("/dashboard");
}

export async function reorderBudgetItemsAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const itemIds = z.array(z.string().uuid()).parse(JSON.parse(String(formData.get("item_ids") ?? "[]")));

  const updates = await Promise.all(
    itemIds.map((itemId, index) =>
      supabase
        .from("budget_items")
        .update({ sort_order: index + 1 })
        .eq("id", itemId)
        .eq("project_id", projectId),
    ),
  );
  const error = updates.find((result) => result.error)?.error;

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const itemId = z.string().uuid().parse(formData.get("item_id"));

  const { error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function createBudgetItemsFromRoomsAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<Room[]>();

  const { data: modules, error: modulesError } = await supabase
    .from("room_modules")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .returns<RoomModule[]>();

  if (roomsError) {
    throw new Error(roomsError.message);
  }

  const roomModules = isOptionalRoomModulesError(modulesError) ? [] : (modules ?? []);
  if (modulesError && !isOptionalRoomModulesError(modulesError)) {
    throw new Error(modulesError.message);
  }

  const modulesByRoom = new Map<string, RoomModule[]>();
  for (const module of roomModules) {
    modulesByRoom.set(module.room_id, [...(modulesByRoom.get(module.room_id) ?? []), module]);
  }

  const firstSortOrder = await getNextBudgetSortOrder(supabase, projectId);
  const rows = (rooms ?? [])
    .filter((room) => {
      const modulesTotal = (modulesByRoom.get(room.id) ?? []).reduce((sum, module) => sum + Number(module.total), 0);
      return Number(room.total_paintable_area) > 0 || modulesTotal > 0;
    })
    .map((room, index) => ({
      project_id: projectId,
      concept: room.name,
      notes: buildRoomBudgetNotes(room, modulesByRoom.get(room.id) ?? []),
      quantity: 1,
      unit: "",
      unit_price: getRoomBudgetTotal(room, modulesByRoom.get(room.id) ?? []),
      sort_order: firstSortOrder + index,
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await insertBudgetRows(supabase, rows);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

function getRoomBudgetTotal(room: Room, modules: RoomModule[]) {
  const baseTotal = Number(room.total_paintable_area) * Number(room.unit_price ?? 0);
  const modulesTotal = modules.reduce((sum, module) => sum + Number(module.total), 0);
  return baseTotal + modulesTotal;
}

function buildRoomBudgetNotes(room: Room, modules: RoomModule[]) {
  const baseLabel =
    room.paint_scope === "manual_area"
      ? "Metro cuadrado"
      : room.paint_scope === "ceiling_only"
        ? "Solo techo"
        : room.paint_scope === "walls_only"
          ? "Solo paredes"
          : "Techo y paredes";
  const lines =
    Number(room.total_paintable_area) > 0
      ? [
          `${baseLabel}: ${Number(room.total_paintable_area).toFixed(2)} m2 x ${formatCurrency(Number(room.unit_price ?? 0))} = ${formatCurrency(Number(room.total_paintable_area) * Number(room.unit_price ?? 0))}`,
        ]
      : [];

  if (room.notes) {
    lines.push(`Notas de la zona: ${room.notes}`);
  }

  for (const module of modules) {
    const label = module.module_type === "free" ? module.concept : `${getModuleTypeLabel(module.module_type)} - ${module.concept}`;
    const unit = module.unit ? ` ${module.unit}` : "";
    lines.push(`${label}: ${Number(module.quantity)}${unit} x ${formatCurrency(Number(module.unit_price))} = ${formatCurrency(Number(module.total))}`);
    if (module.notes) {
      lines.push(`Notas: ${module.notes}`);
    }
  }

  return lines.join("\n");
}

function getModuleTypeLabel(moduleType: RoomModule["module_type"]) {
  if (moduleType === "ceiling_only") return "Solo techo";
  if (moduleType === "walls_only") return "Solo paredes";
  if (moduleType === "manual_area") return "Metro cuadrado";
  return "Libre";
}

function isOptionalRoomModulesError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501" || error.code === "PGRST205";
}

function normalizeDecimalInput(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(",")) {
    return trimmed.replace(/\./g, "").replace(",", ".");
  }
  return trimmed;
}

async function getNextBudgetSortOrder(supabase: Supabase, projectId: string) {
  const { data } = await supabase
    .from("budget_items")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number | null }>();

  return Number(data?.sort_order ?? 0) + 1;
}

async function insertBudgetRows(supabase: Supabase, rows: Array<Record<string, unknown>>) {
  const result = await supabase.from("budget_items").insert(rows);

  if (result.error?.code === "PGRST204" || result.error?.code === "42703") {
    const rowsWithoutOrder = rows.map(({ sort_order: _sortOrder, ...row }) => row);
    return supabase.from("budget_items").insert(rowsWithoutOrder);
  }

  return result;
}
