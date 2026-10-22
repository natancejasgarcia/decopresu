"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { setProjectHighlightAction } from "@/actions/projectActions";
import { ProjectCardActions } from "@/components/ProjectCardActions";
import { useAsyncTask } from "@/lib/useAsyncTask";

export function ProjectCardFrame({
  projectId,
  projectName,
  initialHighlighted,
  statusClasses,
  unreadCount,
  children,
}: {
  projectId: string;
  projectName: string;
  initialHighlighted: boolean;
  statusClasses: string;
  unreadCount: number;
  children: ReactNode;
}) {
  const [highlighted, setHighlighted] = useState(initialHighlighted);
  const [error, setError] = useState("");
  const [pending, run] = useAsyncTask();
  useEffect(() => setHighlighted(initialHighlighted), [initialHighlighted]);

  function toggle() {
    void run(async () => {
      setError("");
      try {
        const result = await setProjectHighlightAction({
          project_id: projectId,
          highlighted: !highlighted,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        if (typeof result.highlighted === "boolean") {
          setHighlighted(result.highlighted);
        }
      } catch {
        setError("No se pudo guardar la marca. Comprueba la conexion y vuelve a intentarlo.");
      }
    });
  }

  const label = highlighted ? "Quitar marca verde" : "Marcar en verde";
  return (
    <article className={`min-w-0 rounded-lg border p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-moss ${highlighted ? "border-emerald-400 bg-emerald-100" : statusClasses}`}>
      {children}
      <ProjectCardActions
        projectId={projectId}
        projectName={projectName}
        highlightControl={
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={highlighted}
            aria-label={`${label}: ${projectName}`}
            title={label}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss disabled:cursor-wait disabled:opacity-70 ${highlighted ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800" : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"}`}
          >
            {pending ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            {pending ? "Guardando..." : label}
          </button>
        }
      >
        {unreadCount > 0 ? (
          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-red-600 px-2 text-sm font-black text-white shadow-soft">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </ProjectCardActions>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </article>
  );
}
