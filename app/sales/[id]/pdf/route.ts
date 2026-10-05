import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { generateSalesPdf } from "@/lib/salesPdf";
import {
  DEFAULT_COMPANY,
  type CompanySettings,
  type SalesDocument,
} from "@/lib/sales";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json(
        { error: "Inicia sesión para descargar el documento." },
        { status: 401 },
      );
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile)
      return NextResponse.json(
        { error: "Acceso no autorizado." },
        { status: 403 },
      );
    if (!z.string().uuid().safeParse(params.id).success)
      return NextResponse.json(
        { error: "Documento no válido." },
        { status: 400 },
      );
    const { data: document, error } = await supabase
      .from("sales_documents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle<SalesDocument>();
    if (error) throw error;
    if (!document)
      return NextResponse.json(
        { error: "Documento no encontrado." },
        { status: 404 },
      );
    let company = document.issuer;
    if (!company) {
      const { data, error: companyError } = await supabase
        .from("company_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle<CompanySettings>();
      if (companyError) throw companyError;
      company = data ?? DEFAULT_COMPANY;
    }
    const logo = await readFile(
      path.join(process.cwd(), "public", "decoralia-logo.png"),
    ).catch(() => undefined);
    const bytes = await generateSalesPdf(document, company, logo);
    const filename = `${document.kind === "invoice" ? "Factura" : "Albaran"}-${(document.number ?? document.id).replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Decoralia sales PDF]", error);
    return NextResponse.json(
      { error: "No se pudo generar el PDF. Vuelve a intentarlo." },
      { status: 500 },
    );
  }
}
