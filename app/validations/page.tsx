import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BudgetValidatorPanel } from "@/components/BudgetValidatorPanel";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import type { BudgetValidation, Profile, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ValidationsPage() {
  const { supabase, profile } = await requireUserProfile();

  const [
    { data: projects, error: projectsError },
    { data: validations, error: validationsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase.from("projects").select("*").order("last_activity_at", { ascending: false }).returns<Project[]>(),
    supabase
      .from("budget_validations")
      .select("*")
      .order("is_validated", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<BudgetValidation[]>(),
    supabase.from("profiles").select("*").returns<Profile[]>(),
  ]);

  const validationsUnavailable = isOptionalValidationError(validationsError);

  if (projectsError || profilesError || (!validationsUnavailable && validationsError)) {
    throw new Error(projectsError?.message ?? profilesError?.message ?? validationsError?.message);
  }

  const profileNames = new Map((profiles ?? []).map((item) => [item.user_id, item.name]));
  const projectNamesById = new Map((projects ?? []).map((project) => [project.id, project]));
  const enrichedValidations = await Promise.all(
    (validationsUnavailable ? [] : validations ?? []).map(async (item) => {
      const { data } = await supabase.storage.from("project-files").createSignedUrl(item.file_url, 60 * 60);
      return {
        ...item,
        signed_url: data?.signedUrl,
        created_by_name: profileNames.get(item.created_by) ?? "Decoralia",
        validated_by_name: item.validated_by ? profileNames.get(item.validated_by) : undefined,
        project_name: item.project_id ? projectNamesById.get(item.project_id)?.name : undefined,
        project_client_name: item.project_id ? projectNamesById.get(item.project_id)?.client_name : undefined,
      };
    }),
  );

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Inicio
        </Link>
        <BudgetValidatorPanel validations={enrichedValidations} projects={projects ?? []} />
      </div>
    </main>
  );
}

function isOptionalValidationError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}
