import { CheckCircle2, ChevronDown, FileCheck2, FileText, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { createBudgetValidationAction, deleteBudgetValidationAction, updateBudgetValidationNotesAction, updateBudgetValidationPdfAction, validateBudgetAction } from "@/actions/budgetValidationActions";
import type { BudgetValidation, Project } from "@/lib/types";

type BudgetValidatorPanelProps = {
  validations: BudgetValidation[];
  projects: Project[];
};

const timeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function BudgetValidatorPanel({ validations, projects }: BudgetValidatorPanelProps) {
  const pending = validations.filter((item) => !item.is_validated || item.validation_notes);
  const validated = validations.filter((item) => item.is_validated && !item.validation_notes);

  return (
    <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
            <FileCheck2 size={21} />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-clay">Validador de presupuestos</p>
            <h2 className="text-xl font-black text-ink">PDF pendientes de OK</h2>
            <p className="text-sm font-semibold text-muted">Elige obra y sube su PDF; se vincula solo al proyecto.</p>
          </div>
        </div>
        <span className="inline-flex h-9 items-center rounded-full bg-paper px-3 text-sm font-black text-ink">
          {pending.length} por validar
        </span>
      </div>

      <form action={createBudgetValidationAction} encType="multipart/form-data" className="mt-4 grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
        <select className="form-input h-12 py-0" name="project_id" defaultValue="" required>
          <option value="" disabled>Seleccionar obra</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} - {project.client_name}
            </option>
          ))}
        </select>
        <input
          className="form-input h-12 py-1 file:mr-3 file:rounded-md file:border-0 file:bg-moss file:px-3 file:py-2 file:text-sm file:font-black file:text-white"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
        />
        <button className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-moss px-5 font-black text-white" type="submit">
          <Upload size={18} />
          Subir PDF
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        {validations.length === 0 ? (
          <div className="rounded-lg bg-paper p-4 text-sm font-semibold text-muted">
            No hay presupuestos subidos para validar.
          </div>
        ) : (
          <>
            {pending.map((item) => (
              <ValidationRow key={item.id} validation={item} />
            ))}
            {validated.length > 0 ? (
              <div className="mt-2 border-t border-line pt-3">
                <p className="mb-2 text-xs font-black uppercase text-muted">Validados</p>
                <div className="grid gap-2">
                  {validated.map((item) => (
                    <ValidationRow key={item.id} validation={item} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function ValidationRow({ validation }: { validation: BudgetValidation }) {
  const createdAt = new Date(validation.created_at);

  return (
    <details className={`group rounded-lg border p-3 ${
      validation.validation_notes
        ? "border-amber-200 bg-amber-50/70"
        : validation.is_validated
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-line bg-white"
    }`}>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText size={17} className={validation.is_validated ? "text-emerald-800" : "text-moss"} />
            {validation.signed_url ? (
              <a className="text-sm font-black text-ink underline decoration-moss underline-offset-4" href={validation.signed_url} target="_blank" rel="noreferrer">
                {validation.name}
              </a>
            ) : (
              <strong className="text-sm text-ink">{validation.name}</strong>
            )}
            {validation.validation_notes ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                Pendiente de revisión
              </span>
            ) : validation.is_validated ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">
                <CheckCircle2 size={14} />
                Validado
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-muted">
            <span className="rounded-full bg-paper px-2 py-0.5 font-black text-ink">
              {validation.project_name ?? "Sin obra"}
            </span>
            {validation.project_client_name ? <span>{validation.project_client_name}</span> : null}
            <span>{validation.created_by_name ?? "Decoralia"} - {timeFormatter.format(createdAt)}</span>
            {validation.signed_url ? (
              <a className="font-black text-moss underline" href={validation.signed_url} target="_blank" rel="noreferrer">
                Ver PDF
              </a>
            ) : null}
          </div>
        </div>
          <div className="flex shrink-0 items-center gap-2">
            {validation.is_validated ? (
              <span className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-100 px-4 text-sm font-black text-emerald-900">
                OK
              </span>
            ) : null}
            <span className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
              Detalles
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </span>
          </div>
        </div>
      </summary>

      <div className="mt-3 grid gap-3 border-t border-line pt-3">
        <form action={updateBudgetValidationNotesAction} className="grid gap-2">
          <input type="hidden" name="validation_id" value={validation.id} />
          <label>
            <span className="form-label">Detalles para revisar o corregir</span>
            <textarea
              className="form-input min-h-24"
              name="validation_notes"
              defaultValue={validation.validation_notes ?? ""}
              placeholder="Ej: falta cambiar el color, revisar medidas, añadir partida de materiales..."
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-black text-ink" type="submit">
            <Save size={16} />
            Guardar detalles
          </button>
        </form>

        <form action={updateBudgetValidationPdfAction} encType="multipart/form-data" className="grid gap-2 rounded-lg bg-paper p-3 md:grid-cols-[1fr_auto]">
          <input type="hidden" name="validation_id" value={validation.id} />
          <input type="hidden" name="file_url" value={validation.file_url} />
          <input
            className="form-input h-11 py-1 file:mr-3 file:rounded-md file:border-0 file:bg-moss file:px-3 file:py-2 file:text-sm file:font-black file:text-white"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
          />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-moss px-4 text-sm font-black text-white" type="submit">
            <RefreshCw size={16} />
            Cambiar PDF
          </button>
        </form>

        {!validation.is_validated ? (
          <form action={validateBudgetAction} className="grid gap-2">
            <input type="hidden" name="validation_id" value={validation.id} />
            <input type="hidden" name="validation_notes" value={validation.validation_notes ?? ""} />
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-black text-white" type="submit">
              <CheckCircle2 size={17} />
              Validar con OK
            </button>
          </form>
        ) : (
          <form action={deleteBudgetValidationAction}>
            <input type="hidden" name="validation_id" value={validation.id} />
            <input type="hidden" name="file_url" value={validation.file_url} />
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-5 text-sm font-black text-red-700" type="submit">
              <Trash2 size={17} />
              Borrar validado
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
