import Link from "next/link";
import { MapPin, MessageSquareText } from "lucide-react";
import { formatDate } from "@/lib/calculations";
import type { Project } from "@/lib/types";

type ProjectCardProps = {
  project: Project;
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block rounded-lg border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-moss"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">{project.name}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">{project.client_name}</p>
        </div>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-black text-steel">
          {project.status}
        </span>
      </div>
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
