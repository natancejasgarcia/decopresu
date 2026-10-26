import { notFound } from "next/navigation";
import { z } from "zod";
import { TopBar } from "@/components/TopBar";
import { SalesDocumentEditor } from "@/components/SalesDocumentEditor";
import { requireUserProfile } from "@/lib/auth";
import { signProjectFileUrls } from "@/lib/signedProjectFiles";
import {
  DEFAULT_COMPANY,
  type CompanySettings,
  type SalesDocument,
  type SalesPayment,
} from "@/lib/sales";

export const dynamic = "force-dynamic";
export default async function SalesDocumentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { partial?: string; collect?: string };
}) {
  const { supabase, profile } = await requireUserProfile();
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const [
    { data: document, error },
    { data: payments, error: paymentError },
    { data: invoice, error: invoiceError },
    { data: company, error: companyError },
  ] = await Promise.all([
    supabase
      .from("sales_documents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle<SalesDocument>(),
    supabase
      .from("project_payments")
      .select("id,sales_document_id,amount,payment_date,method,receipt_file_name,receipt_file_url,receipt_file_type")
      .eq("sales_document_id", params.id)
      .order("payment_date")
      .returns<SalesPayment[]>(),
    supabase
      .from("sales_documents")
      .select("id")
      .eq("source_document_id", params.id)
      .eq("kind", "invoice")
      .maybeSingle<{ id: string }>(),
    supabase
      .from("company_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle<CompanySettings>(),
  ]);
  if (error || paymentError || invoiceError || companyError)
    throw new Error("No se pudo cargar el documento.");
  if (!document) notFound();
  const receiptUrls = await signProjectFileUrls(supabase, (payments ?? []).map(payment => payment.receipt_file_url));
  const paymentsWithReceipts = (payments ?? []).map(payment => ({ ...payment,
    receipt_signed_url: payment.receipt_file_url ? receiptUrls.get(payment.receipt_file_url) : undefined,
  }));
  return (
    <main className="min-h-screen pb-8">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <SalesDocumentEditor
          key={document.id}
          document={document}
          payments={paymentsWithReceipts}
          linkedInvoiceId={invoice?.id}
          initialPartial={searchParams.partial === "1"}
          initialCollect={searchParams.collect === "1"}
          initialCompany={company ?? DEFAULT_COMPANY}
        />
      </div>
    </main>
  );
}
