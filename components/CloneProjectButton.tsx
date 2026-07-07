"use client";

import { Copy } from "lucide-react";
import { cloneProjectAction } from "@/actions/projectActions";

type CloneProjectButtonProps = {
  projectId: string;
  projectName: string;
  compact?: boolean;
};

export function CloneProjectButton({ projectId, projectName, compact = false }: CloneProjectButtonProps) {
  return (
    <form
      action={cloneProjectAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Clonar la obra "${projectName}"? Se copiara con medidas y presupuesto.`);

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <button
        className={
          compact
            ? "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-line bg-white/80 px-3 text-xs font-black text-moss transition hover:bg-emerald-50"
            : "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-black text-moss transition hover:bg-emerald-50"
        }
        title="Clonar proyecto"
        type="submit"
      >
        <Copy size={compact ? 15 : 16} />
        Clonar
      </button>
    </form>
  );
}
