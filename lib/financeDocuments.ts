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
    due_date: date.nullable().optional(),
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
  file_type?: string;
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
  due_date: z.string().max(30).nullable().optional().default(null),
  payment_date: z.string().max(30).nullable().optional().default(null),
  paid_amount: z.number().finite().min(0).nullable().optional().default(null),
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
        "due_date",
        "payment_date",
        "currency",
        "concept",
        "notes",
      ].map((key) => [key, { type: ["string", "null"] }]),
    ),
    ...Object.fromEntries(
      ["subtotal", "tax", "total", "paid_amount"].map((key) => [
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
    "due_date",
    "payment_date",
    "paid_amount",
    "currency",
    "concept",
    "notes",
    "subtotal",
    "tax",
    "total",
    "warnings",
  ],
};

export function normalizeInvoiceDates(
  value: z.infer<typeof extractedInvoiceSchema>,
) {
  const result = { ...value, warnings: [...value.warnings] };
  for (const key of ["issue_date", "due_date", "payment_date"] as const) {
    const raw = result[key]?.trim();
    if (!raw) {
      result[key] = null;
      continue;
    }
    const spanish = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    const iso = spanish
      ? `${spanish[3]}-${spanish[2].padStart(2, "0")}-${spanish[1].padStart(2, "0")}`
      : raw;
    if (date.safeParse(iso).success) result[key] = iso;
    else {
      result[key] = null;
      result.warnings.push(
        `Revisa ${key === "issue_date" ? "la fecha de factura" : key === "due_date" ? "el vencimiento" : "la fecha de pago"}: no se pudo identificar una fecha completa y valida.`,
      );
    }
  }
  if (Number(result.paid_amount) > 0 && !result.payment_date) {
    result.paid_amount = null;
    result.warnings.push(
      "Se menciona un pago sin fecha confirmada. Revisa el importe y la fecha antes de registrar el cobro o pago.",
    );
  }
  return result;
}

export function invoiceMonthRange(value: string | undefined) {
  if (
    !value ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    Number(value.slice(0, 4)) < 1
  )
    return null;
  const [year, month] = value.split("-").map(Number);
  return {
    key: value,
    start: `${value}-01`,
    end:
      month === 12
        ? `${String(year + 1).padStart(4, "0")}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`,
  };
}
