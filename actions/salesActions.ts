"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import {
  companySchema,
  dateSchema,
  salesDraftSchema,
  salesUnavailable,
  type SalesDraftInput,
  type SalesKind,
} from "@/lib/sales";
import { PAYMENT_METHODS } from "@/lib/types";

type Result =
  { ok: true; id?: string; number?: string } | { ok: false; error: string };
function failure(error: { message: string; code?: string }): Result {
  console.error("[Decoralia sales]", error.code, error.message);
  if (salesUnavailable(error) || error.code === "PGRST202")
    return {
      ok: false,
      error:
        "El módulo de ventas todavía no está activado en la base de datos.",
    };
  return {
    ok: false,
    error:
      error.code === "P0001"
        ? error.message
        : "No se pudo guardar. Inténtalo de nuevo; tus datos siguen en pantalla.",
  };
}
function refresh(id?: string) {
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  if (id) revalidatePath(`/sales/${id}`);
  revalidatePath("/projects", "layout");
}
export async function createSalesDocumentAction(
  kind: SalesKind,
  projectId?: string,
  sourceId?: string,
): Promise<Result> {
  const { supabase } = await requireUserProfile();
  if (
    !z.enum(["invoice", "delivery_note"]).safeParse(kind).success ||
    (projectId && !z.string().uuid().safeParse(projectId).success) ||
    (sourceId && !z.string().uuid().safeParse(sourceId).success)
  ) {
    return { ok: false, error: "Selecciona una obra válida." };
  }
  const { data, error } = await supabase.rpc("create_sales_document", {
    p_kind: kind,
    p_project_id: projectId ?? null,
    p_source_id: sourceId ?? null,
  });
  if (error) return failure(error);
  refresh();
  return { ok: true, id: String(data) };
}
export async function saveSalesDocumentAction(
  id: string,
  input: SalesDraftInput,
): Promise<Result> {
  const { supabase } = await requireUserProfile();
  const parsed = salesDraftSchema.safeParse(input);
  if (!z.string().uuid().safeParse(id).success || !parsed.success)
    return {
      ok: false,
      error: parsed.success
        ? "Documento no válido."
        : parsed.error.issues[0].message,
    };
  const { error } = await supabase.rpc("save_sales_document", {
    p_id: id,
    p_data: parsed.data,
  });
  if (error) return failure(error);
  refresh(id);
  return { ok: true };
}
export async function issueSalesDocumentAction(id: string): Promise<Result> {
  const { supabase } = await requireUserProfile();
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, error: "Documento no válido." };
  const { data, error } = await supabase.rpc("issue_sales_document", {
    p_id: id,
  });
  if (error) return failure(error);
  refresh(id);
  return { ok: true, number: String(data) };
}
export async function deleteSalesDraftAction(id: string): Promise<Result> {
  const { supabase } = await requireUserProfile();
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, error: "Documento no válido." };
  const { error } = await supabase.rpc("delete_sales_draft", { p_id: id });
  if (error) return failure(error);
  refresh();
  return { ok: true };
}
export async function recordSalesPaymentAction(
  id: string,
  formData: FormData,
): Promise<Result> {
  const { supabase } = await requireUserProfile();
  const parsed = z
    .object({
      id: z.string().uuid(),
      amount: z.preprocess(
        (v) => Number(String(v).replace(",", ".")),
        z.number().finite().positive().max(99999999),
      ),
      date: dateSchema,
      method: z.enum(PAYMENT_METHODS as [string, ...string[]]),
    })
    .safeParse({
      id,
      amount: formData.get("amount"),
      date: formData.get("date"),
      method: formData.get("method"),
    });
  if (!parsed.success)
    return {
      ok: false,
      error: "Revisa el importe, la fecha y la forma de pago.",
    };
  const { data, error } = await supabase.rpc("record_sales_payment", {
    p_id: id,
    p_amount: parsed.data.amount,
    p_date: parsed.data.date,
    p_method: parsed.data.method,
  });
  if (error) return failure(error);
  refresh(id);
  return { ok: true, id: String(data) };
}
export async function saveCompanyAction(
  input: z.infer<typeof companySchema>,
): Promise<Result> {
  const { supabase } = await requireUserProfile();
  const parsed = companySchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Revisa los datos. Las series admiten letras mayúsculas y números, hasta 8 caracteres.",
    };
  const { error } = await supabase
    .from("company_settings")
    .upsert({ id: 1, ...parsed.data });
  if (error) return failure(error);
  revalidatePath("/settings");
  revalidatePath("/sales", "layout");
  return { ok: true };
}
