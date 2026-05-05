"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const budgetItemSchema = z.object({
  project_id: z.string().uuid(),
  concept: z.string().trim().min(2),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
  unit_price: z.coerce.number().min(0),
});

export async function createBudgetItemAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = budgetItemSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("budget_items").insert(parsed);

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
