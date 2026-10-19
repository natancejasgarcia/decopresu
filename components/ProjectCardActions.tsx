"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileCheck2, LoaderCircle } from "lucide-react";
import { sendProjectBudgetToValidation } from "@/actions/budgetValidationActions";
import { CloneProjectButton } from "@/components/CloneProjectButton";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { useAsyncTask } from "@/lib/useAsyncTask";

export function ProjectCardActions({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const requestId = useRef<string>();
  const [pending, run] = useAsyncTask();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function send() {
    void run(async () => {
      setError("");
      try {
        requestId.current ??= crypto.randomUUID();
        const result = await sendProjectBudgetToValidation({
          project_id: projectId,
          request_id: requestId.current,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setSent(true);
        router.refresh();
      } catch {
        setError(
          "No se pudo completar el envio. Comprueba la conexion y vuelve a intentarlo.",
        );
      }
    });
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {children}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={send}
            disabled={pending || sent}
            title={`Enviar presupuesto de ${projectName} a validar`}
            aria-label={`Enviar presupuesto de ${projectName} a validar`}
            className="inline-flex h-9 w-28 items-center justify-center gap-2 rounded-lg border border-moss bg-white px-2 text-xs font-black text-moss transition hover:bg-emerald-50 disabled:cursor-default disabled:opacity-70"
          >
            {pending ? (
              <LoaderCircle
                size={15}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : sent ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <FileCheck2 size={15} aria-hidden="true" />
            )}
            {pending ? "Enviando..." : sent ? "Enviado" : "A validar"}
          </button>
          <div className="flex items-center gap-2">
            <CloneProjectButton
              projectId={projectId}
              projectName={projectName}
              compact
            />
            <DeleteProjectButton
              projectId={projectId}
              projectName={projectName}
            />
          </div>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="text-xs font-semibold text-moss">
          Presupuesto enviado.{" "}
          <Link href="/validations" className="underline">
            Ver validaciones
          </Link>
        </p>
      )}
    </div>
  );
}
