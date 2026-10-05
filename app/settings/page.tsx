import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CompanySettingsForm } from "@/components/CompanySettingsForm";
import { requireUserProfile } from "@/lib/auth";
import {
  DEFAULT_COMPANY,
  salesUnavailable,
  type CompanySettings,
} from "@/lib/sales";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const { supabase, profile } = await requireUserProfile();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle<CompanySettings>();
  if (error && !salesUnavailable(error))
    throw new Error("No se pudieron cargar los datos fiscales.");
  return (
    <main className="min-h-screen pb-8">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Link className="action-secondary" href="/sales">
          <ArrowLeft size={20} />
          Volver a ventas
        </Link>
        <h1 className="text-3xl font-bold">Datos de la empresa</h1>
        <CompanySettingsForm
          initial={data ?? DEFAULT_COMPANY}
          available={!error}
        />
      </div>
    </main>
  );
}
