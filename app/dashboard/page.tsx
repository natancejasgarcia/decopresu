import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, FileCheck2, FolderKanban, Mail, NotebookPen, Plus } from "lucide-react";
import { ProjectCalendar, type CalendarProject } from "@/components/ProjectCalendar";
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

  const { data: calendarProjectData, error: calendarProjectsError } = await supabase
    .from("projects")
    .select("id,name,client_name,address,status,project_type,created_at")
    .order("created_at", { ascending: true })
    .returns<CalendarProject[]>();

  if (calendarProjectsError) {
    throw new Error(calendarProjectsError.message);
  }

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
      title: "Organizador",
      detail: "Ver las obras colocadas en un calendario mensual.",
      href: "#organizador",
      icon: CalendarDays,
      badge: "Calendario",
      tone: "bg-white text-ink",
      iconTone: "bg-violet-50 text-violet-700",
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
      title: "Apuntes diarios",
      detail: "Notas por fecha sobre lo hecho en cada dia de trabajo.",
      href: "/notes",
      icon: NotebookPen,
      badge: `${notesUnavailable ? 0 : pendingNoteCount ?? 0} hoy`,
      tone: "bg-white text-ink",
      iconTone: "bg-red-50 text-red-700",
    },
  ];

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-4 sm:py-6">
        <div className="mb-3 sm:mb-5">
          <p className="text-xs font-black uppercase text-clay">Inicio</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-ink sm:text-4xl">Panel Decoralia</h1>
          <p className="mt-1 hidden max-w-2xl text-sm font-semibold text-muted sm:block">
            Elige que quieres hacer. Botones grandes, directos y pensados para usar rapido desde el movil.
          </p>
        </div>

        <section className="grid grid-cols-2 gap-2 sm:gap-3">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex aspect-square flex-col justify-between rounded-xl border border-line p-3 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg sm:aspect-auto sm:min-h-36 sm:p-5 ${item.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${item.iconTone}`}>
                    <Icon size={22} />
                  </div>
                  <span className="max-w-20 truncate rounded-full bg-paper px-2 py-1 text-[10px] font-black text-ink sm:max-w-none sm:px-3 sm:text-xs">{item.badge}</span>
                </div>
                <div className="mt-3 sm:mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-black leading-tight sm:text-xl">{item.title}</h2>
                    <ArrowRight size={18} className="hidden shrink-0 transition group-hover:translate-x-1 sm:block" />
                  </div>
                  <p className={`mt-2 hidden text-sm font-semibold sm:block ${item.tone.includes("bg-moss") ? "text-white/80" : "text-muted"}`}>
                    {item.detail}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
        <div id="organizador">
          <ProjectCalendar
            projects={calendarProjectData ?? []}
            initialYear={new Date().getFullYear()}
            initialMonth={new Date().getMonth()}
          />
        </div>
      </div>
    </main>
  );
}

function isOptionalDashboardError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}
