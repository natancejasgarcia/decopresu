import { TopBar } from "@/components/TopBar";
import { ClientsDirectory } from "@/components/ClientsDirectory";
import { requireUserProfile } from "@/lib/auth";
import type { Project } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function ClientsPage() {
  const { supabase, profile } = await requireUserProfile();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<Project[]>();
  if (error) throw new Error("No se pudieron cargar los clientes.");
  return (
    <main>
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <ClientsDirectory projects={data ?? []} />
      </div>
    </main>
  );
}
