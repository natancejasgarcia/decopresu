import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// The model chooses a dataset, never a table name, SQL statement or column expression.
export const DATASETS = {
  projects: {
    table: "projects",
    columns:
      "id,name,client_name,client_phone,client_email,address,status,project_type,description,created_at",
    date: "created_at",
    search: "name",
    project: "id",
    amounts: [],
  },
  budgets: {
    table: "budget_items",
    columns:
      "id,project_id,concept,notes,quantity,unit,unit_price,total,created_at,projects(name,status)",
    date: "created_at",
    search: "concept",
    project: "project_id",
    amounts: ["total"],
  },
  expenses: {
    table: "project_expenses",
    columns:
      "id,project_id,category,supplier,concept,amount,expense_date,is_paid,notes",
    date: "expense_date",
    search: "concept",
    project: "project_id",
    amounts: ["amount"],
  },
  payments: {
    table: "project_payments",
    columns: "id,project_id,amount,payment_date,method,notes",
    date: "payment_date",
    search: "notes",
    project: "project_id",
    amounts: ["amount"],
  },
  fixed_costs: {
    table: "fixed_costs",
    columns: "id,name,amount,frequency,is_active,next_payment_date,notes",
    date: "next_payment_date",
    search: "name",
    project: null,
    amounts: ["amount"],
  },
  invoices: {
    table: "sales_documents",
    columns:
      "id,project_id,kind,status,number,client_name,issue_date,due_date,subtotal,tax_total,total,notes",
    date: "issue_date",
    search: "client_name",
    project: "project_id",
    amounts: ["subtotal", "tax_total", "total"],
  },
  scanned_invoices: {
    table: "finance_documents",
    columns:
      "id,status,invoice_data,expense_id,payment_id,posted_at,created_at",
    date: "invoice_data->>issue_date",
    search: null,
    project: "invoice_data->>project_id",
    amounts: [],
  },
  notes: {
    table: "daily_notes",
    columns: "id,project_id,text,note_date,is_done",
    date: "note_date",
    search: "text",
    project: "project_id",
    amounts: [],
  },
  validations: {
    table: "budget_validations",
    columns:
      "id,project_id,name,is_validated,validation_notes,created_at,validated_at",
    date: "created_at",
    search: "name",
    project: "project_id",
    amounts: [],
  },
  rooms: {
    table: "rooms",
    columns:
      "id,project_id,name,paint_scope,total_paintable_area,unit_price,notes,created_at",
    date: "created_at",
    search: "name",
    project: "project_id",
    amounts: [],
  },
  modules: {
    table: "room_modules",
    columns:
      "id,project_id,room_id,concept,quantity,unit,unit_price,total,notes,created_at",
    date: "created_at",
    search: "concept",
    project: "project_id",
    amounts: ["total"],
  },
  files: {
    table: "project_files",
    columns: "id,project_id,file_name,file_type,created_at",
    date: "created_at",
    search: "file_name",
    project: "project_id",
    amounts: [],
  },
  messages: {
    table: "messages",
    columns: "id,project_id,text,created_at",
    date: "created_at",
    search: "text",
    project: "project_id",
    amounts: [],
  },
  emails: {
    table: "sent_emails",
    columns: "id,project_id,subject,status,created_at",
    date: "created_at",
    search: "subject",
    project: "project_id",
    amounts: [],
  },
} as const;
const datasetNames = Object.keys(DATASETS) as [
  keyof typeof DATASETS,
  ...(keyof typeof DATASETS)[],
];
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
function dateBoundary(value: string, timestamp: boolean) {
  if (!timestamp) return value;
  const utc = Date.parse(`${value}T00:00:00Z`);
  const offset =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      timeZoneName: "longOffset",
    })
      .formatToParts(utc)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = match
    ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1)
    : 0;
  return new Date(utc - minutes * 60000).toISOString();
}
export const querySchema = z
  .object({
    dataset: z.enum(datasetNames),
    project_id: z.string().uuid().nullable(),
    from: date.nullable(),
    to: date.nullable(),
    search: z.string().max(100).nullable(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || v.from <= v.to, "Periodo no valido");
export const queryTool = {
  type: "function",
  name: "consultar_datos",
  description:
    "Lee datos actuales con los permisos del usuario. Hasta 5000 registros; devuelve totales completos o avisa de truncamiento. expenses son gastos registrados, no necesariamente pagados; payments son cobros reales; budgets sin IVA. fixed_costs son previsiones mensuales normalizadas, no pagos. invoices incluye albaranes y borradores: separar por kind/status. scanned_invoices no se suman a cobros/gastos porque ya pueden estar vinculadas a ellos. Fotos y cuerpos de archivos no se leen. Fechas ISO, rango inclusivo. Para relacionar obras usa projects y project_id.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      dataset: { type: "string", enum: datasetNames },
      project_id: { type: ["string", "null"] },
      from: { type: ["string", "null"] },
      to: { type: ["string", "null"] },
      search: { type: ["string", "null"] },
    },
    required: ["dataset", "project_id", "from", "to", "search"],
  },
};

export async function readFinanceDataset(
  client: SupabaseClient,
  input: unknown,
) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success)
    return { error: "Consulta no permitida o filtros no validos." };
  const args = parsed.data;
  const spec = DATASETS[args.dataset];
  if (args.project_id && !spec.project)
    return { error: "Este conjunto no se puede filtrar por obra." };
  if (args.search && !spec.search)
    return { error: "Este conjunto no admite busqueda por texto." };
  const rows: Record<string, unknown>[] = [];
  let count = 0;
  for (let offset = 0; offset < 5000; offset += 1000) {
    let query = client
      .from(spec.table)
      .select(spec.columns, { count: "exact" })
      .order("id")
      .range(offset, offset + 999);
    if (args.project_id && spec.project)
      query = query.eq(spec.project, args.project_id);
    if (args.from)
      query = query.gte(
        spec.date,
        dateBoundary(args.from, spec.date.endsWith("_at")),
      );
    if (args.to)
      query = query.lt(
        spec.date,
        dateBoundary(
          new Date(Date.parse(`${args.to}T00:00:00Z`) + 86400000)
            .toISOString()
            .slice(0, 10),
          spec.date.endsWith("_at"),
        ),
      );
    if (args.search && spec.search)
      query = query.ilike(
        spec.search,
        `%${args.search.replace(/[%_\\]/g, " ")}%`,
      );
    const result = await query;
    if (result.error)
      return {
        error: `Datos no disponibles: ${args.dataset}. No asumir importes cero.`,
      };
    count = result.count ?? 0;
    rows.push(...((result.data as unknown as Record<string, unknown>[]) ?? []));
    if (rows.length >= count || !result.data?.length) break;
  }
  const complete = rows.length === count;
  const groups: Record<
    string,
    { count: number; sums: Record<string, number> }
  > = {};
  const sums: Record<string, number> = {};
  // Integer cents avoid accumulating binary floating point rounding errors.
  for (const row of rows) {
    const parent = row.projects as { status?: string } | undefined;
    const invoice =
      args.dataset === "scanned_invoices" && row.status === "posted"
        ? (row.invoice_data as Record<string, unknown>)
        : undefined;
    const group =
      String(
        row.status ??
          parent?.status ??
          (typeof row.is_paid === "boolean"
            ? row.is_paid
              ? "Pagado"
              : "Pendiente de pago"
            : (row.frequency ?? "todos")),
      ) +
      (row.kind
        ? ` / ${row.kind}`
        : invoice?.direction
          ? ` / ${invoice.direction}`
          : "");
    groups[group] ??= { count: 0, sums: {} };
    groups[group].count++;
    const values = invoice
      ? {
          ...invoice,
          pending_at_registration:
            Number(invoice.total) - Number(invoice.paid_amount),
        }
      : row;
    const keys = invoice
      ? ["subtotal", "tax", "total", "paid_amount", "pending_at_registration"]
      : spec.amounts;
    for (const key of keys) {
      const cents = Math.round(Number(values[key]) * 100);
      sums[key] = (sums[key] ?? 0) + cents;
      groups[group].sums[key] = (groups[group].sums[key] ?? 0) + cents;
    }
  }
  const toEuros = (values: Record<string, number>) =>
    Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v / 100]));
  const monthly =
    args.dataset === "fixed_costs"
      ? rows
          .filter((r) => r.is_active)
          .reduce(
            (sum, r) =>
              sum +
              Math.round(
                (Number(r.amount) * 100) /
                  (r.frequency === "Anual"
                    ? 12
                    : r.frequency === "Trimestral"
                      ? 3
                      : 1),
              ),
            0,
          ) / 100
      : null;
  return {
    dataset: args.dataset,
    filters: args,
    count,
    complete,
    warning: complete
      ? null
      : "Mas de 5000 registros: filtra por fechas u obra antes de calcular totales.",
    totals:
      complete &&
      !["scanned_invoices", "fixed_costs", "invoices"].includes(args.dataset)
        ? toEuros(sums)
        : null,
    groups: complete
      ? Object.fromEntries(
          Object.entries(groups).map(([k, v]) => [
            k,
            { count: v.count, totals: toEuros(v.sums) },
          ]),
        )
      : null,
    monthly_fixed_cost_forecast: complete ? monthly : null,
    details: rows
      .slice(0, 25)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            typeof v === "string"
              ? v.slice(0, 500)
              : k === "invoice_data"
                ? JSON.stringify(v).slice(0, 1500)
                : v,
          ]),
        ),
      ),
    details_limit: 25,
    accounting_note:
      args.dataset === "scanned_invoices"
        ? "Importes al contabilizar, no saldos actuales. Los cambios posteriores en cobros/gastos no actualizan invoice_data. Consulta payments/expenses para el estado actual; no sumes las facturas escaneadas otra vez."
        : null,
  };
}
