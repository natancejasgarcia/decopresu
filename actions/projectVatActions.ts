"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { budgetVatSchema } from "@/lib/budgetVat";

export async function saveProjectVatAction(projectId: string, rate: number) {
  const id = z.string().uuid().safeParse(projectId);
  const vat = budgetVatSchema.safeParse(rate);
  if (!id.success || !vat.success || rate == null)
    return { ok: false as const, error: "Selecciona un IVA del 10 % o del 21 %." };
  const { supabase } = await requireUserProfile();
  const { data, error } = await supabase.from("projects")
    .update({ budget_vat_rate: vat.data })
    .eq("id", id.data)
    .select("id,budget_vat_rate")
    .single();
  if (error || !data)
    return { ok: false as const, error: "No se pudo guardar el IVA de la obra. Vuelve a intentarlo." };
  revalidatePath(`/projects/${id.data}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/sales");
  revalidatePath("/validations");
  return { ok: true as const, vatRate: vat.data };
}
