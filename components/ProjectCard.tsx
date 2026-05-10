import Link from "next/link";
import { Euro, MapPin, MessageSquareText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/calculations";
import type { Project, ProjectStatus } from "@/lib/types";

type ProjectCardProps = {
  project: Project;
  budgetTotal?: number;
};

const STATUS_STYLES: Record<ProjectStatus, { badge: string; border: string; wash: string }> = {
  Pendiente: {
    badge: "bg-slate-100 text-slate-700",
    border: "border-slate-200",
    wash: "bg-white",
  },
  Presupuestado: {
    badge: "bg-red-50 text-red-700",
    border: "border-red-200",
    wash: "bg-red-50/30",
  },
  Aprobado: {
    badge: "bg-emerald-50 text-emerald-800",
    border: "border-emerald-200",
    wash: "bg-emerald-50/30",
  },
  "En ejecución": {
    badge: "bg-blue-50 text-blue-800",
    border: "border-blue-200",
    wash: "bg-blue-50/30",
  },
  Terminado: {
    badge: "bg-violet-50 text-violet-800",
    border: "border-violet-200",
    wash: "bg-violet-50/30",
  },
  Cobrado: {
    badge: "bg-teal-50 text-teal-800",
    border: "border-teal-200",
    wash: "bg-teal-50/30",
  },
};

export function ProjectCard({ project, budgetTotal = 0 }: ProjectCardProps) {
  const statusStyle = STATUS_STYLES[project.status];

  return (
    <Link
      href={`/projects/${project.id}`}
      className={`block rounded-lg border p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-moss ${statusStyle.border} ${statusStyle.wash}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">{project.name}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{project.client_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyle.badge}`}>
          {project.status}
        </span>
      </div>
      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/75 px-3 py-2 text-sm font-black text-ink ring-1 ring-line">
        <Euro size={15} className="text-moss" />
        {formatCurrency(budgetTotal)}
      </p>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted">
        <MapPin size={16} />
        {project.address}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
        <span>Creado: {formatDate(project.created_at)}</span>
        <span className="flex items-center justify-end gap-1">
          <MessageSquareText size={14} />
          {formatDate(project.last_activity_at)}
        </span>
      </div>
    </Link>
  );
}
