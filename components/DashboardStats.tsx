import { BarChart3, CalendarDays, CheckCircle2, Euro, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/calculations";
import { PROJECT_STATUSES, type Project, type ProjectStatus } from "@/lib/types";

type ProjectBudget = {
  project_id: string;
  total: number;
  created_at: string;
};

type DashboardStatsProps = {
  projects: Project[];
  budgetItems: ProjectBudget[];
};

const APPROVED_STATUSES: ProjectStatus[] = ["Aprobado", "En ejecución", "Terminado", "Cobrado"];

const STATUS_TONES: Record<ProjectStatus, { bar: string; badge: string }> = {
  Pendiente: { bar: "bg-slate-400", badge: "bg-slate-100 text-slate-700" },
  Presupuestado: { bar: "bg-red-300", badge: "bg-red-50 text-red-700" },
  Aprobado: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-800" },
  "En ejecución": { bar: "bg-blue-500", badge: "bg-blue-50 text-blue-800" },
  Terminado: { bar: "bg-violet-500", badge: "bg-violet-50 text-violet-800" },
  Cobrado: { bar: "bg-teal-600", badge: "bg-teal-50 text-teal-800" },
};

export function DashboardStats({ projects, budgetItems }: DashboardStatsProps) {
  const now = new Date();
  const todayKey = toDayKey(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const totalsByProject = new Map<string, number>();

  for (const item of budgetItems) {
    totalsByProject.set(item.project_id, (totalsByProject.get(item.project_id) ?? 0) + Number(item.total));
  }

  const budgetToday = budgetItems
    .filter((item) => toDayKey(new Date(item.created_at)) === todayKey)
    .reduce((sum, item) => sum + Number(item.total), 0);

  const approvedThisMonthProjects = projects.filter((project) => {
    const createdAt = new Date(project.created_at);
    return (
      APPROVED_STATUSES.includes(project.status) &&
      createdAt.getMonth() === currentMonth &&
      createdAt.getFullYear() === currentYear
    );
  });

  const approvedThisMonth = approvedThisMonthProjects.reduce(
    (sum, project) => sum + (totalsByProject.get(project.id) ?? 0),
    0,
  );
  const pendingApproval = projects
    .filter((project) => project.status === "Presupuestado")
    .reduce((sum, project) => sum + (totalsByProject.get(project.id) ?? 0), 0);
  const collectedThisMonth = projects
    .filter((project) => {
      const createdAt = new Date(project.created_at);
      return project.status === "Cobrado" && createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear;
    })
    .reduce((sum, project) => sum + (totalsByProject.get(project.id) ?? 0), 0);

  const statusRows = buildStatusRows(projects, totalsByProject);
  const maxStatusAmount = Math.max(...statusRows.map((row) => row.amount), 1);

  return (
    <section className="mt-5 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CalendarDays size={20} />} label="Presupuestos de hoy" value={formatCurrency(budgetToday)} detail="Líneas creadas hoy" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Aprobado este mes" value={formatCurrency(approvedThisMonth)} detail={`${approvedThisMonthProjects.length} obras aprobadas o en marcha`} />
        <StatCard icon={<FileText size={20} />} label="Pendiente de aprobar" value={formatCurrency(pendingApproval)} detail="Obras presupuestadas" tone="warm" />
        <StatCard icon={<Euro size={20} />} label="Cobrado este mes" value={formatCurrency(collectedThisMonth)} detail="Según obras marcadas como cobradas" tone="green" />
      </div>

      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-clay">Gráfica</p>
            <h2 className="text-xl font-black text-ink">Importe por estado</h2>
          </div>
          <BarChart3 className="text-moss" size={24} />
        </div>

        <div className="grid gap-3">
          {statusRows.map((row) => (
            <div key={row.status} className="grid gap-2 sm:grid-cols-[140px_1fr_120px] sm:items-center">
              <div className="flex items-center justify-between gap-2 sm:block">
                <span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_TONES[row.status].badge}`}>{row.status}</span>
                <span className="text-xs font-bold text-muted sm:hidden">{row.count} obras</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-paper">
                <div
                  className={`h-full min-w-[4px] rounded-full ${STATUS_TONES[row.status].bar}`}
                  style={{ width: `${Math.max((row.amount / maxStatusAmount) * 100, row.amount > 0 ? 8 : 0)}%` }}
                />
              </div>
              <div className="text-left text-sm font-black text-ink sm:text-right">
                {formatCurrency(row.amount)}
                <span className="ml-2 text-xs font-bold text-muted sm:block sm:ml-0">{row.count} obras</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warm" | "green";
}) {
  const toneClass = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "warm" ? "bg-red-50 text-red-700" : "bg-paper text-moss";

  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-lg ${toneClass}`}>{icon}</div>
      <p className="text-xs font-black uppercase text-muted">{label}</p>
      <strong className="mt-1 block text-2xl text-ink">{value}</strong>
      <p className="mt-1 text-sm font-semibold text-muted">{detail}</p>
    </article>
  );
}

function buildStatusRows(projects: Project[], totalsByProject: Map<string, number>) {
  const rows = new Map<ProjectStatus, { status: ProjectStatus; count: number; amount: number }>();

  for (const status of PROJECT_STATUSES) {
    rows.set(status, { status, count: 0, amount: 0 });
  }

  for (const project of projects) {
    const current = rows.get(project.status) ?? { status: project.status, count: 0, amount: 0 };
    rows.set(project.status, {
      status: project.status,
      count: current.count + 1,
      amount: current.amount + (totalsByProject.get(project.id) ?? 0),
    });
  }

  return Array.from(rows.values()).sort((a, b) => b.amount - a.amount);
}

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
