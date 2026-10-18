"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  FileText,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteBudgetValidation,
  reviewValidation,
  saveValidationPdf,
} from "@/actions/budgetValidationActions";
import { uploadPrivateFile } from "@/lib/uploadPrivateFile";
import { useAsyncTask } from "@/lib/useAsyncTask";
import type { BudgetValidation, Project } from "@/lib/types";

export function BudgetValidatorPanel({
  validations,
  projects,
  owner,
  reviewer,
}: {
  validations: BudgetValidation[];
  projects: Project[];
  owner: boolean;
  reviewer: boolean;
}) {
  const [tab, setTab] = useState(false);
  const [removed, setRemoved] = useState<{ id: string; status: boolean }[]>([]);
  const [error, setError] = useState("");
  const [pending, run] = useAsyncTask();
  const router = useRouter();
  // Only suppress rows still stale after a successful mutation; approved history remains visible.
  const visible = validations.filter(
    (v) => !removed.some((r) => r.id === v.id && r.status === v.is_validated),
  );
  const rows = visible.filter((v) => v.is_validated === (owner && tab));
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-black">Revisar presupuestos</h1>
      <div
        role="tablist"
        aria-label="Estado"
        className="flex gap-2 border-b border-line pb-3"
      >
        {[false, ...(owner ? [true] : [])].map((value) => (
          <button
            role="tab"
            aria-selected={tab === value}
            key={String(value)}
            onClick={() => setTab(value)}
            className={`min-h-12 rounded-lg px-4 font-bold ${tab === value ? "bg-moss text-white" : "bg-white border border-line"}`}
          >
            {value ? "Validados" : "Pendientes"} (
            {visible.filter((v) => v.is_validated === value).length})
          </button>
        ))}
      </div>
      {!reviewer && (
        <form
          className="grid gap-3 border-b border-line pb-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void run(async () => {
              setError("");
              try {
                const file = data.get("file") as File;
                const uploaded = await uploadPrivateFile(file, "validations");
                const result = await saveValidationPdf({
                  ...uploaded,
                  project_id: data.get("project_id"),
                  validation_id: null,
                });
                if (result.error) throw new Error(result.error);
                form.reset();
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo subir el PDF.",
                );
              }
            });
          }}
        >
          <select
            aria-label="Obra"
            name="project_id"
            required
            className="form-input"
            defaultValue=""
          >
            <option value="" disabled>
              Seleccionar obra
            </option>
            {projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            aria-label="PDF del presupuesto"
            name="file"
            className="form-input min-w-0"
            type="file"
            accept="application/pdf"
            required
          />
          <button
            disabled={pending}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-bold text-white"
          >
            <Upload size={18} />
            {pending ? "Subiendo..." : "Subir PDF"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {rows.length === 0 && (
        <p role="status" className="p-6 text-muted">
          {tab
            ? "No hay presupuestos validados."
            : "No quedan presupuestos por validar."}
        </p>
      )}
      {rows.map((item) => (
        <ValidationRow
          key={item.id}
          item={item}
          reviewer={reviewer}
          owner={owner}
          onRemove={() =>
            setRemoved((current) => [
              ...current,
              { id: item.id, status: item.is_validated },
            ])
          }
        />
      ))}
    </section>
  );
}

function ValidationRow({
  item,
  reviewer,
  owner,
  onRemove,
}: {
  item: BudgetValidation;
  reviewer: boolean;
  owner: boolean;
  onRemove: () => void;
}) {
  const [pending, run] = useAsyncTask();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  function perform(task: () => Promise<{ error?: string }>, remove = false) {
    void run(async () => {
      setError("");
      setMessage("");
      try {
        const result = await task();
        if (result.error) throw new Error(result.error);
        if (remove) onRemove();
        else setMessage("Guardado");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }
  return (
    <details
      className={`group rounded-lg border p-4 ${item.is_validated ? "border-emerald-200 bg-emerald-50" : item.validation_notes ? "border-amber-300 bg-amber-50" : "border-line bg-white"}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0 break-words font-bold">
          {item.name}
          <span className="mt-1 block text-sm font-normal text-muted">
            {item.is_validated
              ? "Validado"
              : item.validation_notes
                ? "Pendiente de revision"
                : "Pendiente de OK"}
          </span>
        </span>
        <ChevronDown className="shrink-0 group-open:rotate-180" size={20} />
      </summary>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          <a
            href={item.signed_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-line bg-white px-4 font-bold text-moss"
          >
            <FileText size={20} />
            Ver PDF
          </a>
          {!reviewer && item.project_id && (
            <Link
              href={`/projects/${item.project_id}`}
              className="self-center font-bold text-moss underline"
            >
              Ir a la obra
            </Link>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            perform(() =>
              reviewValidation({
                id: item.id,
                operation: "notes",
                notes: data.get("notes"),
              }),
            );
          }}
          className="grid gap-2"
        >
          <label className="font-bold">
            Detalles para corregir
            <textarea
              name="notes"
              defaultValue={item.validation_notes ?? ""}
              maxLength={4000}
              className="form-input mt-2 min-h-28"
            />
          </label>
          <button
            disabled={pending}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-bold"
          >
            <Save size={18} />
            Guardar detalles
          </button>
        </form>
        {!reviewer && item.project_id && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const file = new FormData(e.currentTarget).get("file") as File;
              perform(async () => {
                const upload = await uploadPrivateFile(file, "validations");
                return saveValidationPdf({
                  ...upload,
                  project_id: item.project_id,
                  validation_id: item.id,
                });
              }, item.is_validated);
            }}
          >
            <input
              aria-label="Nuevo PDF"
              type="file"
              name="file"
              accept="application/pdf"
              required
              className="form-input min-w-0"
            />
            <button
              disabled={pending}
              className="min-h-12 rounded-lg border border-line px-4 font-bold"
            >
              Cambiar PDF
            </button>
          </form>
        )}
        {!item.is_validated ? (
          <button
            disabled={pending}
            onClick={() =>
              perform(
                () => reviewValidation({ id: item.id, operation: "approve" }),
                true,
              )
            }
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 font-bold text-white"
          >
            <Check size={20} />
            {pending ? "Guardando..." : "Dar OK"}
          </button>
        ) : (
          owner && (
            <button
              disabled={pending}
              onClick={() => {
                if (window.confirm("Borrar este validado y su PDF?"))
                  perform(() => deleteBudgetValidation(item.id), true);
              }}
              className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-red-200 px-4 font-bold text-red-700"
            >
              <Trash2 size={18} />
              Borrar validado
            </button>
          )
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-emerald-800">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
