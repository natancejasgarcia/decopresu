import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Euro, FileText, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/calculations";
import { monthLabel } from "@/lib/finance";
import { PROJECT_STATUSES, type Project, type ProjectStatus, type ProjectType } from "@/lib/types";

type ProjectBudget = {
  project_id: string;
  total: number;
  created_at: string;
};

type DashboardStatsProps = {
  projects: Project[];
  budgetItems: ProjectBudget[];
  monthKey: string;
  year: number;
  month: number;
  q: string;
  status: ProjectStatus | "Todos";
  projectType: ProjectType | "Todos";
};

type ChartDay = {
  key: string;
  label: string;
};

const APPROVED_STATUSES: ProjectStatus[] = ["Aprobado", "En ejecución", "Terminado", "Cobrado"];

const STATUS_TONES: Record<ProjectStatus, { badge: string; dot: string }> = {
  Pendiente: { badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  Presupuestado: { badge: "bg-red-50 text-red-700", dot: "bg-red-300" },
  Aprobado: { badge: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  "En ejecución": { badge: "bg-blue-50 text-blue-800", dot: "bg-blue-500" },
  Terminado: { badge: "bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  Cobrado: { badge: "bg-teal-50 text-teal-800", dot: "bg-teal-600" },
};

export function DashboardStats({ projects, budgetItems, monthKey, year, month, q, status, projectType }: DashboardStatsProps) {
  const now = new Date();
  const todayKey = toDayKey(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const selectedMonthLabel = monthLabel(year, month);
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
  const chartDays = buildMonthDays(year, month);
  const budgetLine = chartDays.map((day) =>
    budgetItems
      .filter((item) => toDayKey(new Date(item.created_at)) === day.key)
      .reduce((sum, item) => sum + Number(item.total), 0),
  );
  const approvedProjectsForSelectedMonth = projects.filter((project) => {
    const createdAt = new Date(project.created_at);
    return APPROVED_STATUSES.includes(project.status) && createdAt.getMonth() === month && createdAt.getFullYear() === year;
  });
  const approvedLine = chartDays.map((day) =>
    approvedProjectsForSelectedMonth
      .filter((project) => toDayKey(new Date(project.created_at)) === day.key)
      .reduce((sum, project) => sum + (totalsByProject.get(project.id) ?? 0), 0),
  );
  const chartMax = Math.max(...budgetLine, ...approvedLine, 1);
  const chartTotal = budgetLine.reduce((sum, value) => sum + value, 0);
  const approvedChartTotal = approvedLine.reduce((sum, value) => sum + value, 0);
  const previousMonthHref = buildDashboardMonthHref({ year, month: month - 1, q, status, projectType });
  const nextMonthHref = buildDashboardMonthHref({ year, month: month + 1, q, status, projectType });

  return (
    <section className="mt-5 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CalendarDays size={20} />} label="Presupuestos de hoy" value={formatCurrency(budgetToday)} detail="Lineas creadas hoy" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Aprobado este mes" value={formatCurrency(approvedThisMonth)} detail={`${approvedThisMonthProjects.length} obras aprobadas o en marcha`} />
        <StatCard icon={<FileText size={20} />} label="Pendiente de aprobar" value={formatCurrency(pendingApproval)} detail="Obras presupuestadas" tone="warm" />
        <StatCard icon={<Euro size={20} />} label="Cobrado este mes" value={formatCurrency(collectedThisMonth)} detail="Segun obras marcadas como cobradas" tone="green" />
      </div>

      <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-clay">Grafica</p>
            <h2 className="text-xl font-black text-ink">Evolucion de presupuestos</h2>
            <p className="mt-1 text-sm font-semibold text-muted">Mes completo: {selectedMonthLabel}</p>
          </div>
          <div className="grid gap-2 sm:justify-items-end">
            <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm font-black text-moss">
              <TrendingUp size={18} />
              {formatCurrency(chartTotal)}
            </div>
            <form className="flex gap-2">
              {q ? <input type="hidden" name="q" value={q} /> : null}
              {status !== "Todos" ? <input type="hidden" name="status" value={status} /> : null}
              {projectType !== "Todos" ? <input type="hidden" name="type" value={projectType} /> : null}
              <input className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink" name="month" type="month" defaultValue={monthKey} />
              <button className="h-10 rounded-lg bg-moss px-4 text-sm font-black text-white">Ver</button>
            </form>
            <div className="flex gap-2">
              <Link className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink" href={previousMonthHref}>
                <ChevronLeft size={16} />
                Mes anterior
              </Link>
              <Link className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink" href={nextMonthHref}>
                Siguiente
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-paper p-3">
          <LineChart days={chartDays} budgetLine={budgetLine} approvedLine={approvedLine} maxValue={chartMax} />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <LegendItem color="bg-moss" label="Presupuestado en el mes" value={formatCurrency(chartTotal)} />
          <LegendItem color="bg-emerald-500" label="Aprobado en el mes" value={formatCurrency(approvedChartTotal)} />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {statusRows.map((row) => (
            <StatusProjectDropdown key={row.status} row={row} />
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

function LineChart({
  days,
  budgetLine,
  approvedLine,
  maxValue,
}: {
  days: ChartDay[];
  budgetLine: number[];
  approvedLine: number[];
  maxValue: number;
}) {
  const width = 760;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 38, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const budgetPoints = buildLinePoints(budgetLine, maxValue, chartWidth, chartHeight, padding);
  const approvedPoints = buildLinePoints(approvedLine, maxValue, chartWidth, chartHeight, padding);
  const gridValues = [0.25, 0.5, 0.75, 1];

  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafica de lineas de presupuestos">
      <defs>
        <linearGradient id="decoraliaBudgetArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#225c50" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#225c50" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="decoraliaApprovedArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridValues.map((value) => {
        const y = padding.top + chartHeight - chartHeight * value;
        return (
          <g key={value}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#d9e0db" strokeDasharray="5 6" />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted text-[10px] font-bold">
              {shortMoney(maxValue * value)}
            </text>
          </g>
        );
      })}

      <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} stroke="#cfd8d2" />

      <path d={buildAreaPath(budgetPoints, height - padding.bottom)} fill="url(#decoraliaBudgetArea)" />
      <path d={buildAreaPath(approvedPoints, height - padding.bottom)} fill="url(#decoraliaApprovedArea)" />
      <polyline points={budgetPoints} fill="none" stroke="#225c50" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      <polyline points={approvedPoints} fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />

      {budgetPoints.split(" ").map((point, index) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={`budget-${index}`} cx={x} cy={y} r="4" fill="#225c50" stroke="#ffffff" strokeWidth="2" />;
      })}
      {approvedPoints.split(" ").map((point, index) => {
        const [x, y] = point.split(",").map(Number);
        return <circle key={`approved-${index}`} cx={x} cy={y} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />;
      })}

      {days.map((day, index) => {
        const divisor = Math.max(days.length - 1, 1);
        const x = padding.left + (chartWidth / divisor) * index;
        const shouldShow = index === 0 || index === days.length - 1 || index % 3 === 0;
        return shouldShow ? (
          <text key={day.key} x={x} y={height - 12} textAnchor="middle" className="fill-muted text-[10px] font-bold">
            {day.label}
          </text>
        ) : null;
      })}
    </svg>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span className="font-black text-ink">{label}</span>
      <span className="font-bold text-muted">{value}</span>
    </div>
  );
}

function StatusProjectDropdown({ row }: { row: ReturnType<typeof buildStatusRows>[number] }) {
  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_TONES[row.status].dot}`} />
        <span className={`rounded-full px-3 py-1 text-xs font-black ${STATUS_TONES[row.status].badge}`}>{row.status}</span>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-ink">{formatCurrency(row.amount)}</p>
        <p className="text-xs font-bold text-muted">{row.count} obras</p>
      </div>
    </div>
  );

  if (row.count === 0) {
    return (
      <div className="rounded-lg border border-line bg-white px-3 py-2">
        {header}
      </div>
    );
  }

  return (
    <details className="group rounded-lg border border-line bg-white px-3 py-2">
      <summary className="cursor-pointer list-none">
        {header}
        <span className="mt-2 block text-xs font-black text-moss group-open:hidden">Tocar para ver obras</span>
        <span className="mt-2 hidden text-xs font-black text-moss group-open:block">Ocultar obras</span>
      </summary>
      <div className="mt-3 grid gap-2 border-t border-line pt-3">
        {row.projects.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`} className="rounded-lg bg-paper p-3 hover:ring-1 hover:ring-moss">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="block text-sm text-ink">{project.name}</strong>
                <span className="mt-1 block text-xs font-semibold text-muted">{project.clientName}</span>
              </div>
              <span className="whitespace-nowrap text-sm font-black text-ink">{formatCurrency(project.amount)}</span>
            </div>
          </Link>
        ))}
      </div>
    </details>
  );
}

function buildStatusRows(projects: Project[], totalsByProject: Map<string, number>) {
  const rows = new Map<ProjectStatus, { status: ProjectStatus; count: number; amount: number; projects: Array<{ id: string; name: string; clientName: string; amount: number }> }>();

  for (const status of PROJECT_STATUSES) {
    rows.set(status, { status, count: 0, amount: 0, projects: [] });
  }

  for (const project of projects) {
    const current = rows.get(project.status) ?? { status: project.status, count: 0, amount: 0, projects: [] };
    const amount = totalsByProject.get(project.id) ?? 0;
    rows.set(project.status, {
      status: project.status,
      count: current.count + 1,
      amount: current.amount + amount,
      projects: [
        ...current.projects,
        {
          id: project.id,
          name: project.name,
          clientName: project.client_name,
          amount,
        },
      ],
    });
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      projects: row.projects.sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildMonthDays(year: number, month: number): ChartDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);
    return {
      key: toDayKey(date),
      label: new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date).replace(".", ""),
    };
  });
}

function buildDashboardMonthHref({
  year,
  month,
  q,
  status,
  projectType,
}: {
  year: number;
  month: number;
  q: string;
  status: ProjectStatus | "Todos";
  projectType: ProjectType | "Todos";
}) {
  const date = new Date(year, month, 1);
  const params = new URLSearchParams();
  params.set("month", `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  if (q) params.set("q", q);
  if (status !== "Todos") params.set("status", status);
  if (projectType !== "Todos") params.set("type", projectType);
  return `/dashboard?${params.toString()}`;
}

function buildLinePoints(values: number[], maxValue: number, width: number, height: number, padding: { top: number; left: number }) {
  const divisor = Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = padding.left + (width / divisor) * index;
      const y = padding.top + height - (Math.max(value, 0) / maxValue) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points: string, baselineY: number) {
  const splitPoints = points.split(" ");
  const first = splitPoints[0];
  const last = splitPoints[splitPoints.length - 1];
  const firstX = first.split(",")[0];
  const lastX = last.split(",")[0];

  return `M ${firstX},${baselineY} L ${points.replaceAll(" ", " L ")} L ${lastX},${baselineY} Z`;
}

function shortMoney(value: number) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }

  return `${Math.round(value)}`;
}

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
