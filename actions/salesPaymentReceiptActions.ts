"use server";

import { requireUserProfile } from "@/lib/auth";
import { salesPaymentReceiptPrefix, salesPaymentReceiptSchema } from "@/lib/salesPaymentReceipts";

export async function prepareSalesPaymentReceiptAction(input: unknown) {
  const { supabase, user } = await requireUserProfile();
  const parsed = salesPaymentReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Elige una imagen o PDF de hasta 10 MB." };
  const { invoice_id, payment_id, name, type, size } = parsed.data;
  const invoice = await supabase.from("sales_documents").select("id,kind,status").eq("id", invoice_id).maybeSingle();
  if (invoice.error || invoice.data?.kind !== "invoice" || invoice.data.status !== "issued")
    return { ok: false as const, error: "Selecciona una factura emitida para guardar el justificante." };
  const extension = type === "application/pdf" ? "pdf" : type.split("/")[1];
  const path = `${salesPaymentReceiptPrefix(invoice_id, user.id, payment_id)}${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage.from("project-files").createSignedUploadUrl(path, { upsert: false });
  if (error || !data) return { ok: false as const, error: "No se pudo preparar el adjunto. El cobro no se ha registrado." };
  return { ok: true as const, token: data.token, receipt: { path, name, type, size } };
}
