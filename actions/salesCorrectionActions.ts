"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserProfile } from "@/lib/auth";
import { correctionSchema, type CorrectionInput } from "@/lib/salesCorrections";

type Result = { ok: true; id?: string; number?: string } | { ok: false; error: string; uncertain?: boolean };
export async function saveSalesCorrectionAction(originalId: string, input: CorrectionInput): Promise<Result> {
  const { supabase } = await requireUserProfile();
  const parsed = correctionSchema.safeParse(input);
  if (!z.string().uuid().safeParse(originalId).success || !parsed.success)
    return { ok: false, error: parsed.success ? "Factura no valida." : parsed.error.issues[0].message };
  const { data, error } = await supabase.rpc("save_sales_data_correction", { p_original: originalId, p_data: parsed.data });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "No se pudo guardar la rectificativa." };
  revalidatePath(`/sales/${originalId}/correction`);
  return { ok: true, id: String(data) };
}
export async function issueSalesCorrectionAction(id: string): Promise<Result> {
  const { supabase } = await requireUserProfile();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Rectificativa no valida." };
  const { data, error } = await supabase.rpc("issue_sales_data_correction", { p_id: id });
  if (error) return { ok: false, uncertain: error.code !== "P0001", error: error.code === "P0001" ? error.message : "No se pudo confirmar la emision. Revisa el historial antes de repetir." };
  revalidatePath("/sales", "layout");
  return { ok: true, number: String(data) };
}
