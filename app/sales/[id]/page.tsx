import { notFound } from "next/navigation";
import { z } from "zod";
import { TopBar } from "@/components/TopBar";
import { SalesDocumentEditor } from "@/components/SalesDocumentEditor";
import { requireUserProfile } from "@/lib/auth";
import type { SalesDocument, SalesPayment } from "@/lib/sales";

export const dynamic = "force-dynamic";
export default async function SalesDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile } = await requireUserProfile();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [
    { data: document, error },
    { data: payments, error: paymentError },
    { data: invoice, error: invoiceError },
  ] = await Promise.all([
    supabase
      .from("sales_documents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle<SalesDocument>(),
    supabase
      .from("project_payments")
      .select("id,sales_document_id,amount,payment_date,method")
      .eq("sales_document_id", params.id)
      .order("payment_date")
      .returns<SalesPayment[]>(),
    supabase
      .from("sales_documents")
      .select("id")
      .eq("source_document_id", params.id)
      .eq("kind", "invoice")
      .maybeSingle<{ id: string }>(),
  ]);
  if (error || paymentError || invoiceError)
    throw new Error("No se pudo cargar el documento.");
  if (!document) notFound();
  return (
    <main className="min-h-screen pb-8">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <SalesDocumentEditor
          key={`${document.id}-${document.status}`}
          document={document}
          payments={payments ?? []}
          linkedInvoiceId={invoice?.id}
        />
      </div>
    </main>
  );
}
