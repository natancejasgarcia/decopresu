import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { DashboardStats } from "@/components/DashboardStats";
import { TopBar } from "@/components/TopBar";
import { ProjectCard } from "@/components/ProjectCard";
import { requireUserProfile } from "@/lib/auth";
import { PROJECT_STATUSES, PROJECT_TYPES, type Project, type ProjectStatus, type ProjectType } from "@/lib/types";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: {
    q?: string;
    status?: ProjectStatus | "Todos";
    type?: ProjectType | "Todos";
  };
};

type DashboardBudgetItem = {
  project_id: string;
  total: number;
  created_at: string;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, profile } = await requireUserProfile();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "Todos";
  const projectType: ProjectType | "Todos" = PROJECT_TYPES.includes(searchParams.type as ProjectType) ? (searchParams.type as ProjectType) : "Todos";

  let query = supabase
    .from("projects")
    .select("*")
    .order("last_activity_at", { ascending: false });

  if (status !== "Todos") {
    query = query.eq("status", status);
  }

  if (projectType !== "Todos") {
    query = query.eq("project_type", projectType);
  }

  if (q) {
    const term = `%${q.replaceAll("%", "")}%`;
    query = query.or(`name.ilike.${term},client_name.ilike.${term},address.ilike.${term}`);
  }

  const [
    { data: projects, error },
    { data: allProjects, error: allProjectsError },
    { data: budgetItems, error: budgetItemsError },
  ] = await Promise.all([
    query.returns<Project[]>(),
    supabase.from("projects").select("*").order("created_at", { ascending: false }).returns<Project[]>(),
    supabase.from("budget_items").select("project_id,total,created_at").returns<DashboardBudgetItem[]>(),
  ]);

  if (error || allProjectsError || budgetItemsError) {
    throw new Error(error?.message ?? allProjectsError?.message ?? budgetItemsError?.message);
  }

  const projectBudgetTotals = new Map<string, number>();
  for (const item of budgetItems ?? []) {
    projectBudgetTotals.set(item.project_id, (projectBudgetTotals.get(item.project_id) ?? 0) + Number(item.total));
  }
  const metricProjects = projectType === "Todos" ? (allProjects ?? []) : (allProjects ?? []).filter((project) => project.project_type === projectType);
  const metricProjectIds = new Set(metricProjects.map((project) => project.id));
  const metricBudgetItems = projectType === "Todos" ? (budgetItems ?? []) : (budgetItems ?? []).filter((item) => metricProjectIds.has(item.project_id));

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-clay">Panel principal</p>
            <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">Proyectos de Decoralia</h1>
          </div>
          <Link href="/projects/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white">
            <Plus size={19} />
            Crear proyecto
          </Link>
        </div>

        <DashboardStats projects={metricProjects} budgetItems={metricBudgetItems} />

        <form className="mt-5 grid gap-3 rounded-lg border border-line bg-white p-3 shadow-soft md:grid-cols-[1fr_220px_auto]">
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <ProjectTypeTab label="Todos" value="Todos" activeType={projectType} q={q} status={status} />
            {PROJECT_TYPES.map((type) => (
              <ProjectTypeTab key={type} label={type} value={type} activeType={projectType} q={q} status={status} />
            ))}
          </div>
          <input type="hidden" name="type" value={projectType} />
          <label className="flex h-12 items-center gap-2 rounded-lg bg-paper px-3">
            <Search size={18} className="text-muted" />
            <input className="w-full bg-transparent text-sm font-semibold outline-none" name="q" defaultValue={q} placeholder="Buscar proyecto, cliente o direccion" />
          </label>
          <select className="form-input h-12 py-0" name="status" defaultValue={status}>
            <option value="Todos">Todos los estados</option>
            {PROJECT_STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button className="h-12 rounded-lg border border-line px-5 font-black text-ink">Filtrar</button>
        </form>

        <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects?.length ? (
            projects.map((project) => <ProjectCard key={project.id} project={project} budgetTotal={projectBudgetTotals.get(project.id) ?? 0} />)
          ) : (
            <div className="col-span-full rounded-lg border border-dashed border-line bg-white p-8 text-center">
              <h2 className="text-xl font-black text-ink">No hay proyectos todavia</h2>
              <p className="mt-2 text-sm text-muted">Crea el primero para empezar a centralizar chats, fotos y presupuestos.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ProjectTypeTab({
  label,
  value,
  activeType,
  q,
  status,
}: {
  label: string;
  value: ProjectType | "Todos";
  activeType: ProjectType | "Todos";
  q: string;
  status: ProjectStatus | "Todos";
}) {
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  if (status !== "Todos") {
    params.set("status", status);
  }
  if (value !== "Todos") {
    params.set("type", value);
  }

  const href = params.toString() ? `/dashboard?${params.toString()}` : "/dashboard";
  const isActive = activeType === value;

  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-black ${
        isActive ? "bg-moss text-white" : "bg-paper text-ink ring-1 ring-line"
      }`}
    >
      {label}
    </Link>
  );
}
