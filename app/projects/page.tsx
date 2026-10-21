import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { ProjectCard } from "@/components/ProjectCard";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import { loadProjectsList, projectsPageHref } from "@/lib/projectsList";
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: {
    q?: string;
    status?: ProjectStatus | "Todos";
    type?: ProjectType | "Todos";
    page?: string;
  };
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const { supabase, profile, user } = await requireUserProfile();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "Todos";
  const projectType: ProjectType | "Todos" = PROJECT_TYPES.includes(searchParams.type as ProjectType)
    ? (searchParams.type as ProjectType)
    : "Todos";

  const filters = { q, status, type: projectType };
  const { projects, total, page, pages, budgetTotals, unreadCounts } = await loadProjectsList(supabase, user.id, { ...filters, page: searchParams.page });

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-clay">Obras</p>
            <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">Todos los proyectos</h1>
          </div>
          <Link href="/projects/new" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white">
            <Plus size={19} />
            Crear proyecto
          </Link>
        </div>

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
            projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                budgetTotal={budgetTotals.get(project.id) ?? 0}
                unreadCount={unreadCounts.get(project.id) ?? 0}
              />
            ))
          ) : (
            <div className="col-span-full rounded-lg border border-dashed border-line bg-white p-8 text-center">
              <h2 className="text-xl font-black text-ink">No hay proyectos todavia</h2>
              <p className="mt-2 text-sm text-muted">Crea el primero para empezar a centralizar chats, fotos y presupuestos.</p>
            </div>
          )}
        </section>
        <nav aria-label="Paginas de proyectos" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line py-4">
          <p className="text-sm font-semibold text-muted">{total} obras · Pagina {page} de {pages}</p>
          <div className="flex gap-2">
            {page > 1 ? <Link prefetch={false} href={projectsPageHref(filters, page - 1)} className="action-secondary" aria-label="Pagina anterior"><ChevronLeft size={20} />Anterior</Link> : null}
            {page < pages ? <Link prefetch={false} href={projectsPageHref(filters, page + 1)} className="action-secondary" aria-label="Pagina siguiente">Siguiente<ChevronRight size={20} /></Link> : null}
          </div>
        </nav>
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

  const href = params.toString() ? `/projects?${params.toString()}` : "/projects";
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
