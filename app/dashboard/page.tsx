import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { DashboardStats } from "@/components/DashboardStats";
import { DailyNotesPanel } from "@/components/DailyNotesPanel";
import { TopBar } from "@/components/TopBar";
import { ProjectCard } from "@/components/ProjectCard";
import { TodayPanel, type TodayCard } from "@/components/TodayPanel";
import { requireUserProfile } from "@/lib/auth";
import { parseMonthKey } from "@/lib/finance";
import { PROJECT_STATUSES, PROJECT_TYPES, type DailyNote, type Message, type Profile, type Project, type ProjectRead, type ProjectStatus, type ProjectType } from "@/lib/types";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: {
    q?: string;
    status?: ProjectStatus | "Todos";
    type?: ProjectType | "Todos";
    month?: string;
  };
};

type DashboardBudgetItem = {
  project_id: string;
  total: number;
  created_at: string;
};

type DashboardPayment = {
  project_id: string | null;
  amount: number;
  payment_date: string;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, profile, user } = await requireUserProfile();
  const q = searchParams.q?.trim() ?? "";
  const status = searchParams.status ?? "Todos";
  const projectType: ProjectType | "Todos" = PROJECT_TYPES.includes(searchParams.type as ProjectType) ? (searchParams.type as ProjectType) : "Todos";
  const chartMonth = parseMonthKey(searchParams.month);

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
    { data: messages, error: messagesError },
    { data: projectReads, error: projectReadsError },
    { data: dismissedItems, error: dismissedItemsError },
    { data: dailyNotes, error: dailyNotesError },
    { data: profiles, error: profilesError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    query.returns<Project[]>(),
    supabase.from("projects").select("*").order("created_at", { ascending: false }).returns<Project[]>(),
    supabase.from("budget_items").select("project_id,total,created_at").returns<DashboardBudgetItem[]>(),
    supabase.from("messages").select("id,project_id,user_id,text,created_at").returns<Message[]>(),
    supabase.from("project_reads").select("*").eq("user_id", user.id).returns<ProjectRead[]>(),
    supabase
      .from("dashboard_dismissals")
      .select("item_key")
      .eq("user_id", user.id)
      .eq("dismissed_on", new Date().toISOString().slice(0, 10)),
    supabase
      .from("daily_notes")
      .select("*")
      .eq("note_date", new Date().toISOString().slice(0, 10))
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<DailyNote[]>(),
    supabase.from("profiles").select("*").returns<Profile[]>(),
    supabase.from("project_payments").select("project_id,amount,payment_date").returns<DashboardPayment[]>(),
  ]);

  const projectReadsUnavailable = isOptionalDashboardError(projectReadsError);
  const dismissedItemsUnavailable = isOptionalDashboardError(dismissedItemsError);
  const dailyNotesUnavailable = isOptionalDashboardError(dailyNotesError);
  const paymentsTableMissing = paymentsError?.code === "42P01";
  const paymentsUnavailable = isOptionalDashboardError(paymentsError);

  if (error || allProjectsError || budgetItemsError || messagesError || !projectReadsUnavailable && projectReadsError || !dismissedItemsUnavailable && dismissedItemsError || !dailyNotesUnavailable && dailyNotesError || profilesError || !paymentsUnavailable && paymentsError) {
    throw new Error(
      error?.message
        ?? allProjectsError?.message
        ?? budgetItemsError?.message
        ?? messagesError?.message
        ?? projectReadsError?.message
        ?? dismissedItemsError?.message
        ?? dailyNotesError?.message
        ?? profilesError?.message
        ?? paymentsError?.message,
    );
  }

  const projectBudgetTotals = new Map<string, number>();
  for (const item of budgetItems ?? []) {
    projectBudgetTotals.set(item.project_id, (projectBudgetTotals.get(item.project_id) ?? 0) + Number(item.total));
  }
  const metricProjects = projectType === "Todos" ? (allProjects ?? []) : (allProjects ?? []).filter((project) => project.project_type === projectType);
  const metricProjectIds = new Set(metricProjects.map((project) => project.id));
  const metricBudgetItems = projectType === "Todos" ? (budgetItems ?? []) : (budgetItems ?? []).filter((item) => metricProjectIds.has(item.project_id));
  const safeProjectReads = projectReadsUnavailable ? [] : (projectReads ?? []);
  const safeDismissedItems = dismissedItemsUnavailable ? [] : (dismissedItems ?? []);
  const safePayments = paymentsUnavailable ? [] : (payments ?? []);
  const lastReadByProject = new Map(safeProjectReads.map((read) => [read.project_id, new Date(read.last_read_at).getTime()]));
  const unreadByProject = new Map<string, number>();
  const dismissedKeys = new Set(safeDismissedItems.map((item) => String(item.item_key)));

  for (const message of messages ?? []) {
    if (message.user_id === user.id) {
      continue;
    }

    const lastReadAt = lastReadByProject.get(message.project_id) ?? 0;
    if (new Date(message.created_at).getTime() > lastReadAt) {
      unreadByProject.set(message.project_id, (unreadByProject.get(message.project_id) ?? 0) + 1);
    }
  }
  const totalUnread = Array.from(unreadByProject.values()).reduce((sum, count) => sum + count, 0);
  const profileNames = new Map((profiles ?? []).map((item) => [item.user_id, item.name]));
  const enrichedDailyNotes = (dailyNotesUnavailable ? [] : (dailyNotes ?? [])).map((note) => ({
    ...note,
    author_name: profileNames.get(note.created_by) ?? "Decoralia",
  }));
  const projectsWithUnread = Array.from(unreadByProject.values()).filter((count) => count > 0).length;
  const pendingProjects = metricProjects.filter((project) => project.status === "Pendiente");
  const quotedProjects = metricProjects.filter((project) => project.status === "Presupuestado");
  const quotedAmount = quotedProjects.reduce((sum, project) => sum + (projectBudgetTotals.get(project.id) ?? 0), 0);
  const withoutBudget = metricProjects.filter((project) => (projectBudgetTotals.get(project.id) ?? 0) === 0);
  const todayCards = buildTodayCards({
    totalUnread,
    projectsWithUnread,
    pendingProjects: pendingProjects.length,
    quotedProjects: quotedProjects.length,
    quotedAmount,
    withoutBudget: withoutBudget.length,
    dismissedKeys,
    projectType,
  });

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

        <DashboardStats
          projects={metricProjects}
          budgetItems={metricBudgetItems}
          payments={paymentsTableMissing || paymentsUnavailable ? [] : (projectType === "Todos" ? safePayments : safePayments.filter((payment) => payment.project_id ? metricProjectIds.has(payment.project_id) : false))}
          monthKey={chartMonth.key}
          month={chartMonth.month}
          year={chartMonth.year}
          q={q}
          status={status}
          projectType={projectType}
        />
        <TodayPanel cards={todayCards} />
        <DailyNotesPanel notes={enrichedDailyNotes} />

        <form className="mt-5 grid gap-3 rounded-lg border border-line bg-white p-3 shadow-soft md:grid-cols-[1fr_220px_auto]">
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <ProjectTypeTab label="Todos" value="Todos" activeType={projectType} q={q} status={status} monthKey={chartMonth.key} />
            {PROJECT_TYPES.map((type) => (
              <ProjectTypeTab key={type} label={type} value={type} activeType={projectType} q={q} status={status} monthKey={chartMonth.key} />
            ))}
          </div>
          <input type="hidden" name="type" value={projectType} />
          <input type="hidden" name="month" value={chartMonth.key} />
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
                budgetTotal={projectBudgetTotals.get(project.id) ?? 0}
                unreadCount={unreadByProject.get(project.id) ?? 0}
              />
            ))
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

function isOptionalDashboardError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}

function buildTodayCards({
  totalUnread,
  projectsWithUnread,
  pendingProjects,
  quotedProjects,
  quotedAmount,
  withoutBudget,
  dismissedKeys,
  projectType,
}: {
  totalUnread: number;
  projectsWithUnread: number;
  pendingProjects: number;
  quotedProjects: number;
  quotedAmount: number;
  withoutBudget: number;
  dismissedKeys: Set<string>;
  projectType: ProjectType | "Todos";
}) {
  const suffix = projectType === "Todos" ? "all" : projectType.toLowerCase();
  const cards: TodayCard[] = [
    totalUnread > 0
      ? {
          key: `unread-${suffix}`,
          title: "Mensajes nuevos",
          value: String(totalUnread),
          detail: `${projectsWithUnread} obras con mensajes sin leer`,
          tone: "red",
        }
      : null,
    pendingProjects > 0
      ? {
          key: `pending-${suffix}`,
          title: "Obras pendientes",
          value: String(pendingProjects),
          detail: "Conviene revisar si falta medir o llamar",
          tone: "blue",
        }
      : null,
    quotedProjects > 0
      ? {
          key: `quoted-${suffix}`,
          title: "Por aprobar",
          value: new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(quotedAmount),
          detail: `${quotedProjects} presupuestos esperando respuesta`,
          tone: "clay",
        }
      : null,
    withoutBudget > 0
      ? {
          key: `without-budget-${suffix}`,
          title: "Sin presupuesto",
          value: String(withoutBudget),
          detail: "Obras sin importe creado todavía",
          tone: "moss",
        }
      : null,
  ].filter((card): card is TodayCard => Boolean(card));

  return cards.filter((card) => !dismissedKeys.has(card.key));
}

function ProjectTypeTab({
  label,
  value,
  activeType,
  q,
  status,
  monthKey,
}: {
  label: string;
  value: ProjectType | "Todos";
  activeType: ProjectType | "Todos";
  q: string;
  status: ProjectStatus | "Todos";
  monthKey: string;
}) {
  const params = new URLSearchParams();
  params.set("month", monthKey);
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
