import { z } from "zod";

export type SalesKind = "delivery_note" | "invoice";
export type SalesLine = {
  concept: string;
  notes: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: 0 | 10 | 21;
};
export type CompanySettings = {
  id: number;
  legal_name: string;
  tax_id: string;
  address: string;
  email: string;
  phone: string;
  iban: string;
  invoice_series: string;
  delivery_series: string;
};
export type SalesDocument = {
  id: string;
  kind: SalesKind;
  status: "draft" | "issued";
  number: string | null;
  project_id: string | null;
  source_document_id: string | null;
  source_label: string;
  client_name: string;
  client_tax_id: string;
  client_address: string;
  client_email: string;
  issue_date: string;
  due_date: string | null;
  notes: string;
  lines: SalesLine[];
  subtotal: number;
  tax_total: number;
  total: number;
  issuer: CompanySettings | null;
  created_at: string;
  issued_at: string | null;
};
export type SalesPayment = {
  id: string;
  sales_document_id: string;
  amount: number;
  payment_date: string;
  method: string;
};
export const DEFAULT_COMPANY: CompanySettings = {
  id: 1,
  legal_name: "Decoralia Pintores",
  tax_id: "",
  address: "",
  email: "",
  phone: "",
  iban: "",
  invoice_series: "F",
  delivery_series: "A",
};
export const SALES_LABELS: Record<SalesKind, string> = {
  delivery_note: "Albarán",
  invoice: "Factura",
};

const numeric = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v),
  z.number().finite().nonnegative().max(9999999),
);
export const salesLineSchema = z.object({
  concept: z.string().trim().min(1, "Escribe el concepto.").max(200),
  notes: z.string().max(4000).default(""),
  quantity: numeric.refine(
    (v) => v > 0,
    "La cantidad debe ser mayor que cero.",
  ),
  unit: z.string().max(20),
  unit_price: numeric,
  vat_rate: z.union([z.literal(0), z.literal(10), z.literal(21)]),
});
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(`${v}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
    );
  }, "Revisa la fecha.");
export const salesDraftSchema = z
  .object({
    client_name: z
      .string()
      .trim()
      .min(1, "Escribe el nombre del cliente.")
      .max(200),
    client_tax_id: z.string().trim().max(30),
    client_address: z.string().trim().max(400),
    client_email: z.union([z.literal(""), z.string().trim().email()]),
    issue_date: dateSchema,
    due_date: z.union([z.literal(""), dateSchema]),
    notes: z.string().max(6000),
    lines: z
      .array(salesLineSchema)
      .min(1, "Añade al menos un concepto.")
      .max(150),
  })
  .refine((v) => !v.due_date || v.due_date >= v.issue_date, {
    message: "El vencimiento no puede ser anterior a la fecha del documento.",
    path: ["due_date"],
  });
export type SalesDraftInput = z.infer<typeof salesDraftSchema>;
export const companySchema = z.object({
  legal_name: z.string().trim().min(1).max(200),
  tax_id: z.string().trim().max(30),
  address: z.string().trim().max(400),
  email: z.union([z.literal(""), z.string().trim().email()]),
  phone: z.string().max(30),
  iban: z.string().trim().max(40),
  invoice_series: z.string().regex(/^[A-Z0-9]{1,8}$/),
  delivery_series: z.string().regex(/^[A-Z0-9]{1,8}$/),
});
export const roundAmount = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function salesTotals(lines: SalesLine[]) {
  const groups = new Map<number, { base: number; tax: number }>();
  for (const line of lines) {
    const base = roundAmount(line.quantity * line.unit_price);
    const tax = roundAmount((base * line.vat_rate) / 100);
    const group = groups.get(line.vat_rate) ?? { base: 0, tax: 0 };
    groups.set(line.vat_rate, {
      base: roundAmount(group.base + base),
      tax: roundAmount(group.tax + tax),
    });
  }
  const subtotal = roundAmount(
    [...groups.values()].reduce((sum, row) => sum + row.base, 0),
  );
  const tax = roundAmount(
    [...groups.values()].reduce((sum, row) => sum + row.tax, 0),
  );
  return {
    subtotal,
    tax,
    total: roundAmount(subtotal + tax),
    groups: [...groups].sort((a, b) => a[0] - b[0]),
  };
}
export function documentBalance(
  document: SalesDocument,
  payments: SalesPayment[],
) {
  const paid = roundAmount(
    payments
      .filter((p) => p.sales_document_id === document.id)
      .reduce((sum, p) => sum + Number(p.amount), 0),
  );
  return {
    paid,
    outstanding: Math.max(0, roundAmount(Number(document.total) - paid)),
  };
}
export function todayMadrid() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function displayDay(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}
export function salesUnavailable(error: { code?: string } | null) {
  return (
    !!error &&
    ["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code ?? "")
  );
}
