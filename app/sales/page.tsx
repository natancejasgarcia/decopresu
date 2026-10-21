import { TopBar } from "@/components/TopBar";
import { SalesWorkspace, type SalesProject } from "@/components/SalesWorkspace";
import { requireUserProfile } from "@/lib/auth";
import {
  salesUnavailable,
  type SalesDocument,
  type SalesPayment,
} from "@/lib/sales";

export const dynamic = "force-dynamic";
export default async function SalesPage({
  searchParams,
}: {
  searchParams: { kind?: string; project?: string };
}) {
  const { supabase, profile } = await requireUserProfile();
  const [
    { data: docs, error },
    { data: payments, error: paymentError },
    { data: projects, error: projectError },
    { data: trash, error: trashError },
  ] = await Promise.all([
    supabase
      .from("sales_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<SalesDocument[]>(),
    supabase
      .from("project_payments")
      .select("id,sales_document_id,amount,payment_date,method")
      .not("sales_document_id", "is", null)
      .returns<SalesPayment[]>(),
    supabase
      .from("projects")
      .select("id,name,client_name")
      .order("name")
      .returns<SalesProject[]>(),
    supabase.from("sales_document_trash").select("document_id").returns<{ document_id: string }[]>(),
  ]);
  if (
    projectError || (trashError && !salesUnavailable(trashError)) ||
    (error && !salesUnavailable(error)) ||
    (paymentError && !salesUnavailable(paymentError))
  )
    throw new Error("No se pudieron cargar las ventas.");
  return (
    <main className="min-h-screen pb-8">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <SalesWorkspace
          key={`${searchParams.project ?? "all"}-${searchParams.kind ?? "invoice"}`}
          documents={docs ?? []}
          payments={payments ?? []}
          projects={projects ?? []}
          initialKind={
            searchParams.kind === "delivery_note" ? "delivery_note" : "invoice"
          }
          projectId={searchParams.project}
          available={!error && !paymentError}
          trashedIds={(trash ?? []).map(item => item.document_id)}
        />
      </div>
    </main>
  );
}
