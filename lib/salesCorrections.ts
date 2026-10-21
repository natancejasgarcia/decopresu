import { z } from "zod";
import { salesDraftSchema, dateSchema, type CompanySettings, type SalesDocument } from "@/lib/sales";

export const correctionSchema = salesDraftSchema.innerType().pick({
  client_name: true, client_tax_id: true, client_address: true,
  client_postal_code: true, client_city: true, client_province: true, client_email: true,
}).extend({ correction_date: dateSchema, reason: z.string().trim().min(1).max(2000) });
export type CorrectionInput = z.infer<typeof correctionSchema>;
export type SalesCorrection = {
  id: string; original_document_id: string; status: "draft" | "issued";
  number: string | null; correction_date: string; reason: string;
  client: Omit<CorrectionInput, "correction_date" | "reason">;
  issuer: CompanySettings; created_at: string; issued_at: string | null;
};
export function correctionPdfDocument(original: SalesDocument, correction: SalesCorrection): SalesDocument {
  return {
    ...original, ...correction.client, id: correction.id, status: correction.status,
    number: correction.number, issue_date: correction.correction_date, due_date: null,
    issuer: correction.issuer, issued_at: correction.issued_at,
    source_label: `Factura rectificada: ${original.number} (${original.issue_date})\nRectificacion de identificacion y domicilios fiscales, sin cambio de importes.`,
    notes: `${correction.reason}\nRectificacion exclusivamente de datos fiscales, sin modificar la base imponible, el IVA ni el total de la factura original. No representa un nuevo cargo.`,
  };
}
