import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { generateSalesPdf } from "@/lib/salesPdf";
import { correctionPdfDocument, type SalesCorrection } from "@/lib/salesCorrections";
import type { SalesDocument } from "@/lib/sales";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: { id: string; correctionId: string } }) {
  const { supabase } = await requireUserProfile();
  if (![params.id, params.correctionId].every(id => z.string().uuid().safeParse(id).success))
    return NextResponse.json({ error: "Documento no valido." }, { status: 400 });
  const [original, correction] = await Promise.all([
    supabase.from("sales_documents").select("*").eq("id", params.id).maybeSingle<SalesDocument>(),
    supabase.from("sales_data_corrections").select("*").eq("id", params.correctionId).eq("original_document_id", params.id).maybeSingle<SalesCorrection>(),
  ]);
  if (original.error || correction.error) return NextResponse.json({ error: "No se pudo cargar el documento." }, { status: 500 });
  if (!original.data || !correction.data || original.data.kind !== "invoice" || original.data.status !== "issued")
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const logo = await readFile(path.join(process.cwd(), "public", "decoralia-logo.png")).catch(() => undefined);
  const bytes = await generateSalesPdf(correctionPdfDocument(original.data, correction.data), correction.data.issuer, logo, "Factura rectificativa");
  const filename = (correction.data.number ?? "Borrador-rectificativa").replace(/[^a-zA-Z0-9-]/g, "-");
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Rectificativa-${filename}.pdf"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
