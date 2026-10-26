import { z } from "zod";
import { expenseReceiptSchema, uploadedExpenseReceiptSchema } from "@/lib/expenseReceipts";

export const salesPaymentReceiptSchema = expenseReceiptSchema.extend({
  invoice_id: z.string().uuid(),
  payment_id: z.string().uuid(),
});
export const uploadedSalesPaymentReceiptSchema = uploadedExpenseReceiptSchema;
export function salesPaymentReceiptPrefix(invoiceId: string, userId: string, paymentId: string) {
  return `sales-payments/${invoiceId}/${userId}/${paymentId}/`;
}
export function validSalesPaymentReceiptPath(path: string, invoiceId: string, userId: string, paymentId: string) {
  const prefix = salesPaymentReceiptPrefix(invoiceId, userId, paymentId);
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.(pdf|jpeg|png|webp|gif|heic)$/.test(path.slice(prefix.length));
}
