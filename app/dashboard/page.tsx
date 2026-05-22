import Link from "next/link";
import { ArrowRight, BarChart3, FileCheck2, FolderKanban, Mail, NotebookPen, Plus } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireUserProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: projectCount, error: projectsError },
    { count: pendingValidationCount, error: validationsError },
    { count: pendingNoteCount, error: notesError },
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase
      .from("budget_validations")
      .select("id", { count: "exact", head: true })
      .or("is_validated.eq.false,validation_notes.not.is.null"),
    supabase
      .from("daily_notes")
      .select("id", { count: "exact", head: true })
      .eq("note_date", today)
      .eq("is_done", false),
  ]);

  const validationsUnavailable = isOptionalDashboardError(validationsError);
  const notesUnavailable = isOptionalDashboardError(notesError);

  if (projectsError || (!validationsUnavailable && validationsError) || (!notesUnavailable && notesError)) {
    throw new Error(projectsError?.message ?? validationsError?.message ?? notesError?.message);
  }

  const menuItems = [
    {
      title: "Crear proyecto",
      detail: "Nueva obra, cliente, direccion y datos iniciales.",
      href: "/projects/new",
      icon: Plus,
      badge: "Nuevo",
      tone: "bg-moss text-white",
      iconTone: "bg-white/15 text-white",
    },
    {
      title: "Todos los proyectos",
      detail: "Buscar obras, ver estados, chats y presupuestos.",
      href: "/projects",
      icon: FolderKanban,
      badge: `${projectCount ?? 0} obras`,
      tone: "bg-white text-ink",
      iconTone: "bg-emerald-50 text-moss",
    },
    {
      title: "Contabilidad",
      detail: "Cobros, gastos, costes fijos y beneficio del mes.",
      href: "/finance",
      icon: BarChart3,
      badge: "Finanzas",
      tone: "bg-white text-ink",
      iconTone: "bg-blue-50 text-blue-700",
    },
    {
      title: "Email",
      detail: "Mandar correos con marca Decoralia y adjuntos.",
      href: "/emails",
      icon: Mail,
      badge: "Correos",
      tone: "bg-white text-ink",
      iconTone: "bg-amber-50 text-amber-700",
    },
    {
      title: "Validaciones PDF",
      detail: "Subir presupuestos, revisarlos y marcarlos como OK.",
      href: "/validations",
      icon: FileCheck2,
      badge: `${validationsUnavailable ? 0 : pendingValidationCount ?? 0} pendientes`,
      tone: "bg-white text-ink",
      iconTone: "bg-green-50 text-green-700",
    },
    {
      title: "Notas de hoy",
      detail: "Tareas compartidas para organizar el dia de trabajo.",
      href: "/notes",
      icon: NotebookPen,
      badge: `${notesUnavailable ? 0 : pendingNoteCount ?? 0} pendientes`,
      tone: "bg-white text-ink",
      iconTone: "bg-red-50 text-red-700",
    },
  ];

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5">
          <p className="text-xs font-black uppercase text-clay">Inicio</p>
          <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">Panel Decoralia</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-muted">
            Elige que quieres hacer. Botones grandes, directos y pensados para usar rapido desde el movil.
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-h-36 flex-col justify-between rounded-xl border border-line p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg ${item.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${item.iconTone}`}>
                    <Icon size={24} />
                  </div>
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-black text-ink">{item.badge}</span>
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-black">{item.title}</h2>
                    <ArrowRight size={20} className="shrink-0 transition group-hover:translate-x-1" />
                  </div>
                  <p className={`mt-2 text-sm font-semibold ${item.tone.includes("bg-moss") ? "text-white/80" : "text-muted"}`}>
                    {item.detail}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function isOptionalDashboardError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}
