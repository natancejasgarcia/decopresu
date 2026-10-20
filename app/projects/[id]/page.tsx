import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ProjectTabs } from "@/components/ProjectTabs";
import { loadProjectPageData } from "@/lib/projectPageData";
import { parseProjectTab } from "@/lib/projectTabs";
import { formatCurrency } from "@/lib/calculations";
import { requireUserProfile } from "@/lib/auth";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type ProjectPageProps = {
  params: {
    id: string;
  };
  searchParams?: { tab?: string };
};

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { supabase, profile } = await requireUserProfile();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .single<Project>();

  if (!project) {
    notFound();
  }

  const activeTab = parseProjectTab(searchParams?.tab);
  const data = await loadProjectPageData(supabase, params.id, activeTab);

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <Link href="/projects" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Proyectos
        </Link>
        <section className="my-5 rounded-lg border border-line bg-white p-4 shadow-soft">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <p className="rounded-full bg-paper px-3 py-1 text-xs font-black uppercase text-clay">{project.status}</p>
                <p className="rounded-full bg-paper px-3 py-1 text-xs font-black uppercase text-moss">{project.project_type ?? "Pintura"}</p>
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">{project.name}</h1>
              <p className="mt-2 text-sm font-semibold text-muted">{project.client_name} · {project.address}</p>
            </div>
            <div className="rounded-lg bg-paper p-4 md:min-w-56">
              <span className="text-xs font-black uppercase text-muted">Presupuesto</span>
              <strong className="mt-1 block text-2xl text-ink">{formatCurrency(data.budgetTotal)}</strong>
              <p className="mt-1 text-sm font-bold text-muted">IVA no incluido</p>
            </div>
          </div>
        </section>
        <ProjectTabs
          key={project.id}
          project={project}
          profile={profile}
          activeTab={activeTab}
          {...data}
        />
      </div>
    </main>
  );
}
