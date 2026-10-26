"use client";

import { prepareSalesPaymentReceiptAction } from "@/actions/salesPaymentReceiptActions";
import { expenseReceiptMetadata, type UploadedExpenseReceipt } from "@/lib/expenseReceipts";

export type SalesPaymentReceiptCache = { file: File; invoiceId: string; paymentId: string; receipt: UploadedExpenseReceipt } | null;
export async function prepareSalesPaymentSubmission(formData: FormData, invoiceId: string, paymentId: string, cached: SalesPaymentReceiptCache) {
  const file = formData.get("receipt");
  formData.delete("receipt");
  formData.set("payment_id", paymentId);
  if (!(file instanceof File) || !file.name) return { formData, cached: null };
  const metadata = expenseReceiptMetadata(file);
  if (cached?.file === file && cached.invoiceId === invoiceId && cached.paymentId === paymentId) {
    formData.set("uploaded_receipt", JSON.stringify(cached.receipt));
    return { formData, cached };
  }
  const upload = await prepareSalesPaymentReceiptAction({ ...metadata, invoice_id: invoiceId, payment_id: paymentId });
  if (!upload.ok) throw new Error(upload.error);
  const { createBrowserSupabaseClient } = await import("@/lib/supabaseClient");
  const { error } = await createBrowserSupabaseClient().storage.from("project-files")
    .uploadToSignedUrl(upload.receipt.path, upload.token, file, { contentType: metadata.type });
  if (error) throw new Error("No se pudo subir el justificante. El cobro no se ha registrado; vuelve a intentarlo.");
  formData.set("uploaded_receipt", JSON.stringify(upload.receipt));
  return { formData, cached: { file, invoiceId, paymentId, receipt: upload.receipt } };
}
