import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { loadProjectBudget } from "@/lib/projectBudgetData";
import { buildBudgetPdf } from "@/lib/budgetPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile)
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });

    const budget = await loadProjectBudget(supabase, params.id);
    if ("error" in budget)
      return NextResponse.json(
        { error: budget.error },
        { status: budget.status },
      );
    const { bytes, filename } = await buildBudgetPdf(budget);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Decoralia PDF] Error generando presupuesto:", error);
    return NextResponse.json(
      {
        error:
          "No se pudo generar el PDF de este presupuesto. Revisa los conceptos e intentalo de nuevo.",
      },
      { status: 500 },
    );
  }
}
