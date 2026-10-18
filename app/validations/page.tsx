import { BudgetValidatorPanel } from "@/components/BudgetValidatorPanel";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import type { BudgetValidation, Project } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function ValidationsPage() {
  const { supabase, profile } = await requireUserProfile("validations");
  const owner = profile.access_role === "owner";
  const reviewer = profile.access_role === "reviewer";
  if (!profile.permissions_ready)
    return (
      <main>
        <TopBar profile={profile} />
        <p role="alert" className="mx-auto max-w-3xl p-6">
          Falta activar los nuevos permisos de validaciones en Supabase. No se
          mostraran documentos hasta completar la configuracion.
        </p>
      </main>
    );
  let query = supabase
    .from("budget_validations")
    .select("*")
    .order("created_at", { ascending: false });
  if (!owner) query = query.eq("is_validated", false);
  const { data, error } = await query.returns<BudgetValidation[]>();
  if (error) throw new Error("No se pudieron cargar las validaciones.");
  const projects = reviewer
    ? []
    : ((
        await supabase
          .from("projects")
          .select("id,name,client_name")
          .order("name")
          .returns<Project[]>()
      ).data ?? []);
  const validations = (data ?? []).map((item) => ({
    ...item,
    file_url: "",
    signed_url: `/validations/${item.id}/pdf`,
  }));
  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <BudgetValidatorPanel
          validations={validations}
          projects={projects}
          owner={owner}
          reviewer={reviewer}
        />
      </div>
    </main>
  );
}
