"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import type { Room } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof requireUserProfile>>["supabase"];

const budgetItemSchema = z.object({
  project_id: z.string().uuid(),
  concept: z.string().trim().min(2),
  notes: z.string().trim().optional(),
  quantity: z.preprocess((value) => (value === "" || value === null ? 1 : value), z.coerce.number().positive()),
  unit: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
  unit_price: z.coerce.number().min(0),
});

export async function createBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = budgetItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
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
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", parsed.data.project_id);

  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath("/dashboard");
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

  if (roomsError) {
    throw new Error(roomsError.message);
  }

  const firstSortOrder = await getNextBudgetSortOrder(supabase, projectId);
  const rows = (rooms ?? [])
    .filter((room) => Number(room.total_paintable_area) > 0)
    .map((room, index) => ({
      project_id: projectId,
      concept: `${room.name} - ${
        room.paint_scope === "manual_area"
          ? "Metro cuadrado"
          : room.paint_scope === "ceiling_only"
            ? "Solo techo"
            : room.paint_scope === "walls_only"
              ? "Solo paredes"
              : "Techo y paredes"
      }`,
      notes:
        room.notes ||
        (room.paint_scope === "manual_area"
          ? `${Number(room.manual_area ?? room.total_paintable_area)} m2`
          : `${Number(room.length)} x ${Number(room.width)} x ${Number(room.height)} m`),
      quantity: Number(room.total_paintable_area),
      unit: "m2",
      unit_price: Number(room.unit_price ?? 0),
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
