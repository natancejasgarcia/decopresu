"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ScanLine, Trash2, Upload } from "lucide-react";
import {
  postFinanceDocument,
  deleteFinanceDraft,
  registerFinancePhoto,
  scanFinancePhoto,
} from "@/actions/financeDocumentActions";
import { uploadPrivateFile } from "@/lib/uploadPrivateFile";
import { useAsyncTask } from "@/lib/useAsyncTask";
import type { FinanceDocument } from "@/lib/financeDocuments";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/types";
type ProjectOption = { id: string; name: string };

export function InvoiceScanner({
  documents,
  projects,
  aiReady,
  uploadOnly = false,
}: {
  documents: FinanceDocument[];
  projects: ProjectOption[];
  aiReady: boolean;
  uploadOnly?: boolean;
}) {
  const [pending, run] = useAsyncTask();
  const [messages, setMessages] = useState<string[]>([]);
  const router = useRouter();
  function upload(files: File[]) {
    void run(async () => {
      setMessages([]);
      if (files.length > 10) {
        setMessages(["Selecciona como maximo 10 fotos cada vez."]);
        return;
      }
      for (const file of files) {
        try {
          setMessages((m) => [...m, `Subiendo ${file.name}...`]);
          const metadata = await uploadPrivateFile(file, "finance-scans");
          const registered = await registerFinancePhoto(metadata);
          if (registered.error) throw new Error(registered.error);
          if (!registered.duplicate && aiReady) {
            const scan = await scanFinancePhoto(registered.id);
            if (scan.error)
              throw new Error(
                `${scan.error} La foto queda guardada para revisar.`,
              );
          }
          setMessages((m) => [
            ...m,
            registered.duplicate
              ? `${file.name}: ya estaba guardada.`
              : `${file.name}: lista para revisar.`,
          ]);
        } catch (e) {
          setMessages((m) => [
            ...m,
            `${file.name}: ${e instanceof Error ? e.message : "No se pudo subir."}`,
          ]);
        }
      }
      router.refresh();
    });
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 border-b border-line pb-4">
        <label
          className={`inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg bg-moss px-4 font-bold text-white ${pending ? "opacity-60" : ""}`}
        >
          <Upload size={20} />
          {pending ? "Procesando..." : "Subir fotos"}
          <input
            disabled={pending}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-4 font-bold">
          <Camera size={20} />
          Hacer foto
          <input
            disabled={pending}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="space-y-1 text-sm text-muted"
      >
        {messages.map((message, i) => (
          <p key={i}>{message}</p>
        ))}
      </div>
      {documents.length === 0 && (
        <p className="py-5 text-muted">No hay facturas en esta lista.</p>
      )}
      {uploadOnly
        ? documents.map((document) => (
            <article
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-bold">{document.file_name}</h2>
                <p className="mt-1 text-sm text-amber-800">
                  Pendiente de contabilizar
                </p>
              </div>
              <a
                href={`/finance/scan/${document.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center rounded-lg border border-line px-4 font-bold text-moss"
              >
                Ver foto
              </a>
            </article>
          ))
        : documents.map((document) => (
            <InvoiceCard
              key={document.id}
              document={document}
              projects={projects}
              aiReady={aiReady}
            />
          ))}
    </div>
  );
}

function InvoiceCard({
  document,
  projects,
  aiReady,
}: {
  document: FinanceDocument;
  projects: ProjectOption[];
  aiReady: boolean;
}) {
  const [extracted, setExtracted] = useState(document.extracted);
  const [pending, run] = useAsyncTask();
  const [error, setError] = useState("");
  const [posted, setPosted] = useState(document.status === "posted");
  const [deleted, setDeleted] = useState(false);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);
  const router = useRouter();
  const source = posted ? (saved ?? document.invoice_data) : extracted;
  function text(key: string) {
    const v = (source as Record<string, unknown>)[key];
    return typeof v === "string" || typeof v === "number" ? String(v) : "";
  }
  const fields = [
    ["party_name", "Cliente / proveedor"],
    ["tax_id", "NIF / CIF"],
    ["invoice_number", "Numero de factura"],
    ["issue_date", "Fecha de factura"],
    ["concept", "Concepto"],
    ["currency", "Moneda"],
    ["subtotal", "Base imponible"],
    ["tax", "Impuestos (importe)"],
    ["total", "Total factura"],
    ["paid_amount", "Cobrado / pagado al registrar"],
    ["payment_date", "Fecha del cobro / pago"],
  ];
  if (deleted) return null;
  return (
    <details
      className={`rounded-lg border p-4 ${posted ? "border-emerald-200 bg-emerald-50" : "border-line bg-white"}`}
      open={!posted && Object.keys(extracted).length > 0}
    >
      <summary className="cursor-pointer break-words text-lg font-bold">
        {document.file_name}
        <span className="ml-2 text-sm text-muted">
          {posted ? "Contabilizada" : "Por revisar"}
        </span>
      </summary>
      <div className="mt-4 grid gap-5 lg:grid-cols-[240px_1fr]">
        <div>
          <a
            href={`/finance/scan/${document.id}/file`}
            target="_blank"
            rel="noreferrer"
            className="font-bold text-moss underline"
          >
            Ver original
          </a>
          {/* Private images are served through the authenticated route. */}
          <img
            src={`/finance/scan/${document.id}/file`}
            alt="Factura original"
            className="mt-3 max-h-80 w-full rounded border border-line object-contain"
          />
          {!posted && (
            <button
              disabled={pending || !aiReady}
              onClick={() =>
                void run(async () => {
                  setError("");
                  try {
                    const result = await scanFinancePhoto(document.id);
                    if (result.error) throw new Error(result.error);
                    setExtracted(result.extracted ?? {});
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "No se pudo leer.",
                    );
                  }
                })
              }
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 font-bold"
            >
              <ScanLine size={20} />
              {pending ? "Leyendo..." : "Leer con IA"}
            </button>
          )}
          {!posted && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Borrar este borrador y su foto?")) return;
                void run(async () => {
                  setError("");
                  try {
                    const result = await deleteFinanceDraft(document.id);
                    if (result.error) throw new Error(result.error);
                    setDeleted(true);
                    router.refresh();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "No se pudo borrar.",
                    );
                  }
                });
              }}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 font-bold text-red-700"
            >
              <Trash2 size={18} />
              Borrar borrador
            </button>
          )}
        </div>
        <form
          key={JSON.stringify(source)}
          className="grid content-start gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const data = Object.fromEntries(form);
            const value = {
              ...data,
              project_id: data.project_id || null,
              payment_date: data.payment_date || null,
              ...Object.fromEntries(
                ["subtotal", "tax", "total", "paid_amount"].map((key) => [
                  key,
                  Number(String(data[key]).replace(",", ".")),
                ]),
              ),
            };
            void run(async () => {
              setError("");
              try {
                const result = await postFinanceDocument(document.id, value);
                if (result.error) throw new Error(result.error);
                setSaved(value);
                setPosted(true);
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo guardar.",
                );
              }
            });
          }}
        >
          {Array.isArray(extracted.warnings) && !posted && (
            <div
              role="status"
              className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2"
            >
              {extracted.warnings.map((warning, i) => (
                <p key={i}>{String(warning)}</p>
              ))}
            </div>
          )}
          <label className="font-bold">
            Tipo
            <select
              name="direction"
              required
              disabled={posted}
              defaultValue={text("direction")}
              className="form-input mt-1"
            >
              <option value="">Seleccionar</option>
              <option value="income">Ingreso</option>
              <option value="expense">Gasto</option>
            </select>
          </label>
          <label className="font-bold">
            Obra (opcional)
            <select
              name="project_id"
              disabled={posted}
              defaultValue={text("project_id")}
              className="form-input mt-1"
            >
              <option value="">Sin obra</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {fields.map(([name, label]) => (
            <label
              key={name}
              className={`min-w-0 font-bold ${name === "concept" ? "sm:col-span-2" : ""}`}
            >
              {label}
              <input
                name={name}
                disabled={posted}
                required={
                  !["tax_id", "invoice_number", "payment_date"].includes(name)
                }
                type={name.includes("date") ? "date" : "text"}
                inputMode={
                  ["subtotal", "tax", "total", "paid_amount"].includes(name)
                    ? "decimal"
                    : undefined
                }
                defaultValue={
                  text(name) ||
                  (name === "paid_amount"
                    ? "0"
                    : name === "currency"
                      ? "EUR"
                      : "")
                }
                className="form-input mt-1"
              />
            </label>
          ))}
          <label className="font-bold">
            Categoria
            <select
              name="category"
              disabled={posted}
              defaultValue={text("category") || "Otros"}
              className="form-input mt-1"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="font-bold">
            Metodo de pago
            <select
              name="method"
              disabled={posted}
              defaultValue={text("method") || "Transferencia"}
              className="form-input mt-1"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="font-bold sm:col-span-2">
            Notas
            <textarea
              name="notes"
              disabled={posted}
              defaultValue={text("notes")}
              maxLength={4000}
              className="form-input mt-1"
            />
          </label>
          {!posted && (
            <button
              disabled={pending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-moss px-4 font-bold text-white sm:col-span-2"
            >
              <Check size={20} />
              {pending ? "Guardando..." : "Confirmar y contabilizar"}
            </button>
          )}
        </form>
        {error && (
          <p role="alert" className="text-red-700 lg:col-span-2">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
