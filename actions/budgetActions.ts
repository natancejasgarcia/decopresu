"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import type { Room } from "@/lib/types";

const budgetItemSchema = z.object({
  project_id: z.string().uuid(),
  concept: z.string().trim().min(2),
  notes: z.string().trim().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
  unit_price: z.coerce.number().min(0),
});

export async function createBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = budgetItemSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("budget_items").insert({
    ...parsed,
    notes: parsed.notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ status: "Presupuestado", last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
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
      concept: `${room.name} · ${room.paint_scope === "ceiling_only" ? "Solo techo" : "Techo y paredes"}`,
      notes: room.notes || `${Number(room.length)} x ${Number(room.width)} x ${Number(room.height)} m`,
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
