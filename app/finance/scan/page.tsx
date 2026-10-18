import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { InvoiceScanner } from "@/components/InvoiceScanner";
import { requireUserProfile } from "@/lib/auth";
import type { FinanceDocument } from "@/lib/financeDocuments";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function ScanPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: string };
}) {
  const { supabase, profile, user } = await requireUserProfile("uploads");
  const reviewer = profile.access_role === "reviewer";
  if (reviewer) {
    const ready = await supabase.rpc("reviewer_invoice_uploads_ready");
    if (!profile.permissions_ready || ready.error || ready.data !== true)
      return (
        <main className="min-h-screen pb-24">
          <TopBar profile={profile} />
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
            <Link href="/dashboard" className="font-bold text-moss underline">
              Volver al inicio
            </Link>
            <h1 className="text-2xl font-bold">Subir facturas</h1>
            <p role="alert">
              Falta activar los permisos de subida de facturas en Supabase.
            </p>
          </div>
        </main>
      );
  }
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(searchParams.page) || 1)),
  );
  const status =
    !reviewer && searchParams.status === "posted" ? "posted" : "draft";
  let query = supabase
    .from("finance_documents")
    .select(
      reviewer
        ? "id,file_name,status,created_at"
        : "id,file_name,status,extracted,invoice_data,created_at",
      {
        count: "exact",
      },
    )
    .eq("status", status);
  if (reviewer) query = query.eq("created_by", user.id);
  const documents = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * 25, page * 25 - 1)
    .returns<FinanceDocument[]>();
  const projects = reviewer
    ? { data: [] }
    : await supabase.from("projects").select("id,name").order("name");
  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <Link
          href={reviewer ? "/dashboard" : "/finance"}
          className="font-bold text-moss underline"
        >
          {reviewer ? "Volver al inicio" : "Volver a Finanzas"}
        </Link>
        <h1 className="text-2xl font-black">
          {reviewer ? "Subir facturas" : "Escanear facturas"}
        </h1>
        {documents.error ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4"
          >
            {["42P01", "PGRST205"].includes(documents.error.code)
              ? "Falta activar la tabla de facturas escaneadas. Ejecuta la migracion 20261018_access_and_finance_ai.sql en Supabase."
              : "No se pudieron cargar las facturas. Revisa la conexion y los permisos antes de volver a intentarlo."}
          </p>
        ) : (
          <>
            {!reviewer && !process.env.OPENAI_API_KEY && (
              <p role="alert" className="text-amber-800">
                Falta configurar OPENAI_API_KEY para leer las fotos. Puedes
                guardar los datos manualmente.
              </p>
            )}
            {!reviewer && (
              <nav aria-label="Facturas" className="flex gap-4">
                <Link
                  aria-current={status === "draft" ? "page" : undefined}
                  className={`min-h-12 rounded-lg border px-4 py-3 font-bold ${status === "draft" ? "bg-moss text-white" : "bg-white"}`}
                  href="/finance/scan"
                >
                  Por revisar
                </Link>
                <Link
                  aria-current={status === "posted" ? "page" : undefined}
                  className={`min-h-12 rounded-lg border px-4 py-3 font-bold ${status === "posted" ? "bg-moss text-white" : "bg-white"}`}
                  href="/finance/scan?status=posted"
                >
                  Contabilizadas
                </Link>
              </nav>
            )}
            <InvoiceScanner
              documents={(documents.data ?? []).map((d) =>
                reviewer ? { ...d, extracted: {}, invoice_data: {} } : d,
              )}
              projects={projects.data ?? []}
              aiReady={!reviewer && Boolean(process.env.OPENAI_API_KEY)}
              uploadOnly={reviewer}
            />
            <nav aria-label="Paginas" className="flex justify-between">
              {page > 1 ? (
                <Link href={`/finance/scan?status=${status}&page=${page - 1}`}>
                  Anterior
                </Link>
              ) : (
                <span />
              )}
              {page * 25 < (documents.count ?? 0) && (
                <Link href={`/finance/scan?status=${status}&page=${page + 1}`}>
                  Siguiente
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
