import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ProjectCard } from "@/components/ProjectCard";
import { requireUserProfile } from "@/lib/auth";
import { PROJECT_STATUSES, type Project, type ProjectStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: {
    q?: string;
    status?: ProjectStatus | "Todos";
  };
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, profile } = await requireUserProfile();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "Todos";

  let query = supabase
    .from("projects")
    .select("*")
    .order("last_activity_at", { ascending: false });

  if (status !== "Todos") {
    query = query.eq("status", status);
  }

  if (q) {
    const term = `%${q.replaceAll("%", "")}%`;
    query = query.or(`name.ilike.${term},client_name.ilike.${term},address.ilike.${term}`);
  }

  const { data: projects, error } = await query.returns<Project[]>();

  if (error) {
    throw new Error(error.message);
  }

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

        <form className="mt-5 grid gap-3 rounded-lg border border-line bg-white p-3 shadow-soft md:grid-cols-[1fr_220px_auto]">
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
            projects.map((project) => <ProjectCard key={project.id} project={project} />)
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
