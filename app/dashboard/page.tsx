import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderKanban,
  Mail,
  NotebookPen,
  Plus,
  Settings,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ReviewerDashboard } from "@/components/ReviewerDashboard";
import { requireUserProfile } from "@/lib/auth";
import { todayMadrid, salesUnavailable } from "@/lib/sales";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, profile } = await requireUserProfile("dashboard");
  if (profile.access_role === "reviewer") {
    return (
      <main className="min-h-screen pb-24">
        <TopBar profile={profile} />
        <ReviewerDashboard />
      </main>
    );
  }
  const [
    { count: projectCount, error: projectError },
    { count: noteCount, error: noteError },
    { count: validationCount, error: validationError },
    { count: draftCount, error: salesError },
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase
      .from("daily_notes")
      .select("id", { count: "exact", head: true })
      .eq("note_date", todayMadrid())
      .eq("is_done", false),
    supabase
      .from("budget_validations")
      .select("id", { count: "exact", head: true })
      .eq("is_validated", false),
    supabase
      .from("sales_documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
  ]);
  if (
    projectError ||
    (noteError && !salesUnavailable(noteError)) ||
    (validationError && !salesUnavailable(validationError)) ||
    (salesError && !salesUnavailable(salesError))
  )
    throw new Error("No se pudo cargar el inicio.");
  const items = [
    {
      href: "/projects/new",
      title: "Nueva obra",
      icon: Plus,
      tone: "bg-moss text-white",
      detail: "Crear proyecto",
    },
    {
      href: "/projects",
      title: "Obras y presupuestos",
      icon: FolderKanban,
      tone: "bg-white text-ink",
      detail: `${projectCount ?? 0} obras`,
    },
    {
      href: "/sales?kind=delivery_note",
      title: "Albaranes",
      icon: ClipboardList,
      tone: "bg-white text-ink",
      detail: "Trabajos entregados",
    },
    {
      href: "/sales?kind=invoice",
      title: "Facturas",
      icon: FileText,
      tone: "bg-white text-ink",
      detail: "Facturas y cobros",
    },
    {
      href: "/finance",
      title: "Contabilidad",
      icon: WalletCards,
      tone: "bg-white text-ink",
      detail: "Cobros y gastos",
    },
    {
      href: "/clients",
      title: "Clientes",
      icon: UsersRound,
      tone: "bg-white text-ink",
      detail: "Contactos y obras",
    },
    {
      href: "/calendar",
      title: "Agenda",
      icon: CalendarDays,
      tone: "bg-white text-ink",
      detail: "Calendario de obras",
    },
    {
      href: "/notes",
      title: "Notas",
      icon: NotebookPen,
      tone: "bg-white text-ink",
      detail: `Pizarra · ${noteCount ?? 0} apuntes hoy`,
    },
    {
      href: "/emails",
      title: "Correos",
      icon: Mail,
      tone: "bg-white text-ink",
      detail: "Enviar y consultar",
    },
    {
      href: "/validations",
      title: "Revisar presupuestos",
      icon: FileCheck2,
      tone: "bg-white text-ink",
      detail: `${validationCount ?? 0} por revisar`,
    },
  ];
  return (
    <main className="min-h-screen">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Inicio</h1>
            <p className="mt-1 text-base text-muted">Gestión de Decoralia</p>
          </div>
          <Link className="action-secondary" href="/settings">
            <Settings size={20} />
            Empresa
          </Link>
        </div>
        <section
          aria-label="Accesos de trabajo"
          className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-28 min-w-0 flex-col justify-between gap-3 rounded-lg border border-line p-4 transition hover:border-moss focus-visible:outline-moss ${item.tone}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon size={25} className="shrink-0" />
                  <ArrowRight
                    size={20}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <h2 className="break-words text-base font-bold leading-snug sm:text-lg">
                    {item.title}
                  </h2>
                  <p
                    className={`mt-1 text-sm ${item.href === "/projects/new" ? "text-white/90" : "text-muted"}`}
                  >
                    {item.detail}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
        {!salesError && (draftCount ?? 0) > 0 && (
          <Link
            className="mt-5 flex min-h-14 items-center justify-between gap-3 border-y border-line py-4 font-semibold text-moss"
            href="/sales"
          >
            <span>{draftCount} documentos en borrador</span>
            <ArrowRight size={20} />
          </Link>
        )}
      </div>
    </main>
  );
}
