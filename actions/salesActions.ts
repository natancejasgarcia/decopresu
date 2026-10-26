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
  type CompanySettings,
} from "@/lib/sales";
import { PAYMENT_METHODS } from "@/lib/types";
import { uploadedSalesPaymentReceiptSchema, validSalesPaymentReceiptPath } from "@/lib/salesPaymentReceipts";
import type { SalesPayment } from "@/lib/sales";

type Result =
  { ok: true; id?: string; number?: string; receipt?: Pick<SalesPayment, "receipt_file_name" | "receipt_file_url" | "receipt_file_type" | "receipt_signed_url"> } | { ok: false; error: string };
function failure(error: { message: string; code?: string }): Extract<Result, { ok: false }> {
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
export async function setSalesDocumentTrashedAction(id: string, trashed: boolean): Promise<Result> {
  const { supabase } = await requireUserProfile();
  if (!z.string().uuid().safeParse(id).success || typeof trashed !== "boolean")
    return { ok: false, error: "Documento no valido." };
  const { error } = await supabase.rpc("set_sales_document_trashed", { p_id: id, p_trashed: trashed });
  if (error) return failure(error);
  refresh(id);
  return { ok: true };
}
export async function recordSalesPaymentAction(
  id: string,
  formData: FormData,
): Promise<Result> {
  const { supabase, user } = await requireUserProfile();
  const parsed = z
    .object({
      id: z.string().uuid(),
      payment_id: z.string().uuid(),
      amount: z.preprocess(
        (v) => Number(String(v).replace(",", ".")),
        z.number().finite().positive().max(99999999),
      ),
      date: dateSchema,
      method: z.enum(PAYMENT_METHODS as [string, ...string[]]),
    })
    .safeParse({
      id,
      payment_id: formData.get("payment_id") ?? crypto.randomUUID(),
      amount: formData.get("amount"),
      date: formData.get("date"),
      method: formData.get("method"),
    });
  if (!parsed.success)
    return {
      ok: false,
      error: "Revisa el importe, la fecha y la forma de pago.",
    };
  let receipt = null;
  try {
    const raw = formData.get("uploaded_receipt");
    if (raw) {
      const metadata = uploadedSalesPaymentReceiptSchema.safeParse(JSON.parse(String(raw)));
      if (!metadata.success || !validSalesPaymentReceiptPath(metadata.data.path, id, user.id, parsed.data.payment_id))
        return { ok: false, error: "El justificante no pertenece a este cobro. Vuelve a seleccionarlo." };
      const stored = await supabase.storage.from("project-files").info(metadata.data.path);
      const size = Number(stored.data?.size ?? stored.data?.metadata?.size);
      const type = stored.data?.contentType ?? stored.data?.metadata?.mimetype;
      if (stored.error || !stored.data || size !== metadata.data.size || type !== metadata.data.type)
        return { ok: false, error: "No se pudo comprobar el justificante. El cobro no se ha registrado." };
      receipt = metadata.data;
    }
    const file = formData.get("receipt");
    if (file instanceof File && file.size > 0)
      return { ok: false, error: "Vuelve a seleccionar el adjunto desde el formulario para subirlo." };
  } catch {
    return { ok: false, error: "No se pudo comprobar el adjunto. El cobro no se ha registrado; vuelve a intentarlo." };
  }
  const { data, error } = await supabase.rpc("record_sales_payment_with_receipt", {
    p_id: id,
    p_payment_id: parsed.data.payment_id,
    p_amount: parsed.data.amount,
    p_date: parsed.data.date,
    p_method: parsed.data.method,
    p_receipt: receipt,
  });
  if (error) return failure(error);
  refresh(id);
  if (!receipt) return { ok: true, id: String(data) };
  let signedUrl: string | undefined;
  try {
    const signed = await supabase.storage.from("project-files").createSignedUrl(receipt.path, 3600);
    signedUrl = signed.data?.signedUrl;
  } catch { /* The payment is already committed; a refresh can renew the private link. */ }
  return { ok: true, id: String(data), receipt: {
    receipt_file_name: receipt.name, receipt_file_url: receipt.path,
    receipt_file_type: receipt.type, receipt_signed_url: signedUrl,
  } };
}
export async function saveCompanyAction(
  input: unknown,
): Promise<{ ok: true; settings: CompanySettings } | { ok: false; error: string }> {
  const { supabase } = await requireUserProfile();
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    const labels: Record<string, string> = { legal_name: "nombre fiscal", tax_id: "NIF / CIF", address: "direccion fiscal", email: "correo electronico", phone: "telefono", iban: "cuenta bancaria (IBAN)", invoice_series: "serie de facturas", delivery_series: "serie de albaranes" };
    return { ok: false, error: field.endsWith("series") ? "Las series admiten letras mayusculas y numeros, hasta 8 caracteres." : `Revisa el campo ${labels[field] ?? "de datos de empresa"}.` };
  }
  const { data, error } = await supabase
    .from("company_settings")
    .upsert({ id: 1, ...parsed.data })
    .select("*")
    .single<CompanySettings>();
  if (error?.code === "42501") return { ok: false, error: "Tu usuario no tiene permiso para guardar los datos de empresa." };
  if (error) return failure(error);
  if (!data) return { ok: false, error: "No se pudo confirmar el guardado de los datos de empresa." };
  revalidatePath("/settings");
  revalidatePath("/sales", "layout");
  return { ok: true, settings: data };
}
