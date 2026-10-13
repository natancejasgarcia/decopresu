import { z } from "zod";

export const MAX_EXPENSE_RECEIPT_SIZE = 10 * 1024 * 1024;
export const EXPENSE_RECEIPT_SCHEMA_ERROR =
  "Falta activar los justificantes de gastos en Supabase. Ejecuta la actualizacion 20260601_expense_receipts.sql. No se ha registrado el gasto.";
const types = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
] as const;
export const expenseReceiptSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(types),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_EXPENSE_RECEIPT_SIZE, "El justificante supera los 10 MB."),
});
export const uploadedExpenseReceiptSchema = expenseReceiptSchema.extend({
  path: z.string().min(1).max(500),
});
export type UploadedExpenseReceipt = z.infer<
  typeof uploadedExpenseReceiptSchema
>;

export function expenseReceiptMetadata(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (!file.size) throw new Error("El justificante esta vacio. Selecciona otra foto o PDF.");
  const extensions: Record<string, (typeof types)[number]> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
  };
  const type =
    file.type === "image/jpg"
      ? "image/jpeg"
      : !file.type || file.type === "application/octet-stream"
        ? extensions[file.name.split(".").pop()?.toLowerCase() ?? ""]
        : file.type;
  const parsed = expenseReceiptSchema.safeParse({
    name: file.name,
    type,
    size: file.size,
  });
  if (!parsed.success)
    throw new Error(
      file.size > MAX_EXPENSE_RECEIPT_SIZE
        ? "El justificante supera los 10 MB."
        : "Elige un PDF o una foto JPG, PNG, WebP, GIF o HEIC.",
    );
  return parsed.data;
}

export function expenseReceiptPrefix(
  projectId: string | null,
  userId: string,
  expenseId: string,
) {
  return `${projectId ?? "finanzas-varias"}/finance-receipts/${userId}/${expenseId}/`;
}

export function validateExpenseReceiptPath(
  receipt: UploadedExpenseReceipt,
  projectId: string | null,
  userId: string,
  expenseId: string,
) {
  const prefix = expenseReceiptPrefix(projectId, userId, expenseId);
  const filename = receipt.path.slice(prefix.length);
  return (
    receipt.path.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.(pdf|jpeg|png|webp|gif|heic)$/.test(filename)
  );
}
