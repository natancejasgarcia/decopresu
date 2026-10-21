import { notFound } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { SalesCorrectionForm } from "@/components/SalesCorrectionForm";
import { requireUserProfile } from "@/lib/auth";
import { DEFAULT_COMPANY, type CompanySettings, type SalesDocument } from "@/lib/sales";
import type { SalesCorrection } from "@/lib/salesCorrections";

export const dynamic = "force-dynamic";
export default async function CorrectionPage({ params }: { params: { id: string } }) {
  const { supabase, profile } = await requireUserProfile();
  const [original, company, corrections] = await Promise.all([
    supabase.from("sales_documents").select("*").eq("id", params.id).maybeSingle<SalesDocument>(),
    supabase.from("company_settings").select("*").eq("id", 1).maybeSingle<CompanySettings>(),
    supabase.from("sales_data_corrections").select("*").eq("original_document_id", params.id).order("created_at", { ascending: false }).returns<SalesCorrection[]>(),
  ]);
  if (original.error || company.error || corrections.error) throw new Error("No se pudo cargar la rectificacion.");
  if (!original.data || original.data.kind !== "invoice" || original.data.status !== "issued") notFound();
  return <main className="min-h-screen pb-24"><TopBar profile={profile} /><div className="mx-auto max-w-5xl px-4 py-5">
    <SalesCorrectionForm original={original.data} company={company.data ?? DEFAULT_COMPANY} corrections={corrections.data ?? []} />
  </div></main>;
}
