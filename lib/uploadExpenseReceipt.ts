"use client";

import { prepareExpenseReceiptAction } from "@/actions/expenseReceiptActions";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";
import { expenseReceiptMetadata } from "@/lib/expenseReceipts";
import type { UploadedExpenseReceipt } from "@/lib/expenseReceipts";

export type ExpenseReceiptCache = {
  file: File;
  projectId: string | null;
  receipt: UploadedExpenseReceipt;
} | null;

export async function prepareExpenseSubmission(
  formData: FormData,
  expenseId: string,
  cached: ExpenseReceiptCache,
) {
  const file = formData.get("receipt");
  // Only metadata travels through the Server Action. Photos go straight to private Storage.
  formData.delete("receipt");
  formData.set("expense_id", expenseId);
  if (!(file instanceof File) || !file.name) return { formData, cached: null };
  const metadata = expenseReceiptMetadata(file);
  const projectId = String(formData.get("project_id") ?? "") || null;
  if (cached?.file === file && cached.projectId === projectId) {
    formData.set("uploaded_receipt", JSON.stringify(cached.receipt));
    return { formData, cached };
  }
  const upload = await prepareExpenseReceiptAction({
    ...metadata,
    expense_id: expenseId,
    project_id: projectId,
  });
  if (!upload.ok) throw new Error(upload.error);
  const { error } = await createBrowserSupabaseClient()
    .storage.from("project-files")
    .uploadToSignedUrl(upload.receipt.path, upload.token, file, {
      contentType: metadata.type,
    });
  if (error)
    throw new Error(
      "No se pudo subir el justificante. El gasto no se ha registrado; conserva el formulario y vuelve a intentarlo.",
    );
  formData.set("uploaded_receipt", JSON.stringify(upload.receipt));
  return { formData, cached: { file, projectId, receipt: upload.receipt } };
}
