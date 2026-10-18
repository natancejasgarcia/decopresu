import { z } from "zod";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/types";

const money = z
  .number()
  .finite()
  .min(0)
  .max(99999999)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001,
    "Maximo dos decimales",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Fecha no valida",
  );
export const invoiceSchema = z
  .object({
    direction: z.enum(["income", "expense"]),
    project_id: z.string().uuid().nullable(),
    party_name: z.string().trim().min(1).max(200),
    tax_id: z.string().trim().max(50),
    invoice_number: z.string().trim().max(100),
    issue_date: date,
    currency: z.literal("EUR"),
    subtotal: money,
    tax: money,
    total: money.refine((v) => v > 0, "El total debe ser positivo"),
    paid_amount: money,
    payment_date: date.nullable(),
    method: z
      .string()
      .refine((v) =>
        PAYMENT_METHODS.includes(v as (typeof PAYMENT_METHODS)[number]),
      ),
    category: z
      .string()
      .refine((v) =>
        EXPENSE_CATEGORIES.includes(v as (typeof EXPENSE_CATEGORIES)[number]),
      ),
    concept: z.string().trim().min(1).max(500),
    notes: z.string().max(4000),
  })
  .superRefine((v, ctx) => {
    if (Math.abs(Math.round((v.subtotal + v.tax - v.total) * 100)) > 2)
      ctx.addIssue({
        code: "custom",
        message: "Base + impuestos no coincide con el total",
      });
    if (v.paid_amount > v.total || (v.paid_amount > 0 && !v.payment_date))
      ctx.addIssue({
        code: "custom",
        message: "Revisa el importe y la fecha de pago",
      });
  });
export type InvoiceData = z.infer<typeof invoiceSchema>;
export type FinanceDocument = {
  id: string;
  file_name: string;
  status: "draft" | "posted";
  extracted: Record<string, unknown>;
  invoice_data: Partial<InvoiceData>;
  created_at: string;
};
export const extractedInvoiceSchema = z.object({
  direction: z.enum(["income", "expense", "unknown"]),
  party_name: z.string().max(200).nullable(),
  tax_id: z.string().max(50).nullable(),
  invoice_number: z.string().max(100).nullable(),
  issue_date: z.string().max(30).nullable(),
  currency: z.string().max(10).nullable(),
  concept: z.string().max(500).nullable(),
  notes: z.string().max(4000).nullable(),
  subtotal: z.number().finite().nullable(),
  tax: z.number().finite().nullable(),
  total: z.number().finite().nullable(),
  warnings: z.array(z.string().max(500)).max(20),
});
export const invoiceExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    direction: { type: "string", enum: ["income", "expense", "unknown"] },
    ...Object.fromEntries(
      [
        "party_name",
        "tax_id",
        "invoice_number",
        "issue_date",
        "currency",
        "concept",
        "notes",
      ].map((key) => [key, { type: ["string", "null"] }]),
    ),
    ...Object.fromEntries(
      ["subtotal", "tax", "total"].map((key) => [
        key,
        { type: ["number", "null"] },
      ]),
    ),
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "direction",
    "party_name",
    "tax_id",
    "invoice_number",
    "issue_date",
    "currency",
    "concept",
    "notes",
    "subtotal",
    "tax",
    "total",
    "warnings",
  ],
};
