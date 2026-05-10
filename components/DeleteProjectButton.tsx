"use client";

import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/actions/projectActions";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectButton({ projectId, projectName }: DeleteProjectButtonProps) {
  return (
    <form
      action={deleteProjectAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(`¿Borrar la obra "${projectName}"? Esta acción no se puede deshacer.`);

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <button
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white/80 px-3 text-xs font-black text-red-700 transition hover:bg-red-50"
        title="Borrar proyecto"
        type="submit"
      >
        <Trash2 size={15} />
        Borrar
      </button>
    </form>
  );
}
