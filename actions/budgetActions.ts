"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import type { Room } from "@/lib/types";

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

  const { error } = await supabase.from("budget_items").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
  });

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

  const rows = (rooms ?? [])
    .filter((room) => Number(room.total_paintable_area) > 0)
    .map((room) => ({
      project_id: projectId,
      concept: `${room.name} · ${
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
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from("budget_items").insert(rows);

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
