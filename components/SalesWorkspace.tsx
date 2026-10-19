"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAsyncTask } from "@/lib/useAsyncTask";
import {
  ArrowRight,
  ClipboardList,
  FilePlus2,
  FileText,
  Search,
} from "lucide-react";
import { createSalesDocumentAction } from "@/actions/salesActions";
import {
  documentBalance,
  displayDay,
  SALES_LABELS,
  todayMadrid,
  type SalesDocument,
  type SalesKind,
  type SalesPayment,
} from "@/lib/sales";
import { formatCurrency } from "@/lib/calculations";

export type SalesProject = { id: string; name: string; client_name: string };
type Props = {
  documents: SalesDocument[];
  payments: SalesPayment[];
  projects: SalesProject[];
  initialKind: SalesKind;
  projectId?: string;
  available: boolean;
};
export function SalesWorkspace({
  documents,
  payments,
  projects,
  initialKind,
  projectId = "",
  available,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState(projectId);
  const [pending, startTransition] = useAsyncTask();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<"full" | "partial">("full");
  const createdIdRef = useRef<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [forceNewDraft, setForceNewDraft] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const existingDraft = documents.find(
    (document) =>
      document.status === "draft" &&
      document.kind === kind &&
      (document.project_id ?? "") === selectedProject,
  );
  const opening = pending || !!createdId || creationUncertain;
  const documentUrl = (id: string) =>
    `/sales/${id}${kind === "invoice" && invoiceMode === "partial" ? "?partial=1" : ""}`;
  const today = todayMadrid();
  const scopedDocuments = documents.filter(
    (d) => !projectId || d.project_id === projectId,
  );
  const invoices = scopedDocuments.filter(
    (d) => d.kind === "invoice" && d.status === "issued",
  );
  const outstanding = invoices.reduce(
    (sum, d) => sum + documentBalance(d, payments).outstanding,
    0,
  );
  const matches = scopedDocuments.filter((d) => {
    const balance = documentBalance(d, payments);
    return (
      d.kind === kind &&
      [d.number ?? "Borrador", d.client_name, d.source_label]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query.toLocaleLowerCase("es")) &&
      (filter === "all" ||
        (filter === "draft" && d.status === "draft") ||
        (filter === "issued" && d.status === "issued") ||
        (filter === "unpaid" &&
          d.status === "issued" &&
          balance.outstanding > 0) ||
        (filter === "paid" &&
          d.status === "issued" &&
          balance.outstanding === 0) ||
        (filter === "overdue" &&
          d.status === "issued" &&
          balance.outstanding > 0 &&
          !!d.due_date &&
          d.due_date < today))
    );
  });
  function create() {
    if (creationUncertain) return;
    if (createdIdRef.current) {
      router.push(documentUrl(createdIdRef.current));
      return;
    }
    if (existingDraft && !forceNewDraft) {
      createdIdRef.current = existingDraft.id;
      setCreatedId(existingDraft.id);
      router.push(`/sales/${existingDraft.id}`);
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const result = await createSalesDocumentAction(
          kind,
          selectedProject || undefined,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.id) {
          setCreationUncertain(true);
          setError(
            "No se pudo confirmar el borrador. Actualiza la lista antes de crear otro.",
          );
          return;
        }
        createdIdRef.current = result.id;
        setCreatedId(result.id);
        router.push(documentUrl(result.id));
      } catch {
        setCreationUncertain(true);
        setError(
          "No se pudo confirmar la creación. Actualiza la lista para comprobar si el borrador quedó guardado antes de repetirla.",
        );
      }
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">Ventas</p>
          <h1 className="text-3xl font-bold">Albaranes y facturas</h1>
          {projectId && (
            <p className="mt-2 text-muted">
              {projects.find((p) => p.id === projectId)?.name ??
                "Documentos de esta obra"}{" "}
              ·{" "}
              <Link className="font-semibold text-moss underline" href="/sales">
                Ver todas las obras
              </Link>
            </p>
          )}
        </div>
        <Link href="/settings" className="action-secondary">
          Datos de la empresa
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="border-l-4 border-steel pl-4">
          <p className="text-sm text-muted">Facturado</p>
          <strong className="text-2xl">
            {formatCurrency(invoices.reduce((s, d) => s + Number(d.total), 0))}
          </strong>
        </div>
        <div className="border-l-4 border-red-400 pl-4">
          <p className="text-sm text-muted">Pendiente de cobro</p>
          <strong className="text-2xl">{formatCurrency(outstanding)}</strong>
        </div>
        <div className="border-l-4 border-moss pl-4">
          <p className="text-sm text-muted">Albaranes emitidos</p>
          <strong className="text-2xl">
            {
              scopedDocuments.filter(
                (d) => d.kind === "delivery_note" && d.status === "issued",
              ).length
            }
          </strong>
        </div>
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Tipo de documento"
      >
        {(["invoice", "delivery_note"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            disabled={opening}
            className={kind === k ? "action-primary" : "action-secondary"}
            onClick={() => {
              setKind(k);
              setFilter("all");
              router.replace(
                `/sales?kind=${k}${projectId ? `&project=${projectId}` : ""}`,
                { scroll: false },
              );
            }}
            type="button"
          >
            {k === "invoice" ? (
              <FileText size={20} />
            ) : (
              <ClipboardList size={20} />
            )}{" "}
            {k === "invoice" ? "Facturas" : "Albaranes"}
          </button>
        ))}
        <Link href="/projects" className="action-secondary">
          Presupuestos por obra <ArrowRight size={18} />
        </Link>
      </div>
      {kind === "invoice" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Facturas de gestión interna. La integración fiscal con la AEAT está
          pendiente.
        </p>
      )}
      {!available ? (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4"
        >
          El módulo de ventas está pendiente de activar. Las obras y
          presupuestos siguen disponibles.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 border-y border-line py-4">
            <label className="min-w-0 flex-1">
              <span className="form-label">Buscar documento o cliente</span>
              <div className="relative">
                <Search
                  className="absolute left-3 top-4 text-muted"
                  size={20}
                />
                <input
                  className="form-input pl-10"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  type="search"
                  placeholder="Nombre, número u obra"
                />
              </div>
            </label>
            <label>
              <span className="form-label">Estado</span>
              <select
                className="form-input"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="draft">Borradores</option>
                <option value="issued">Emitidos</option>
                {kind === "invoice" && (
                  <>
                    <option value="unpaid">Pendientes de cobro</option>
                    <option value="paid">Cobradas</option>
                    <option value="overdue">Vencidas</option>
                  </>
                )}
              </select>
            </label>
            <button
              type="button"
              className="action-primary"
              disabled={opening}
              onClick={() => {
                if (!creating) {
                  createdIdRef.current = null;
                  setCreatedId(null);
                  setForceNewDraft(false);
                }
                setCreating(!creating);
              }}
            >
              <FilePlus2 size={20} />
              {kind === "invoice" ? "Nueva factura" : "Nuevo albarán"}
            </button>
          </div>
          {creating && (
            <div className="grid gap-3 border-b border-line pb-5 sm:grid-cols-[1fr_auto]">
              <label>
                <span className="form-label">Obra de origen</span>
                <select
                  className="form-input"
                  value={selectedProject}
                  disabled={opening}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setForceNewDraft(false);
                  }}
                >
                  <option value="">Sin obra: documento vacío</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.client_name}
                    </option>
                  ))}
                </select>
              </label>
              {kind === "invoice" && (
                <fieldset
                  className="flex min-w-0 flex-wrap gap-4 sm:col-span-2 sm:row-start-1"
                  disabled={opening}
                >
                  <legend className="form-label mb-2">Tipo de factura</legend>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="invoice-mode"
                      value="full"
                      checked={invoiceMode === "full"}
                      onChange={() => setInvoiceMode("full")}
                    />
                    Factura completa
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="invoice-mode"
                      value="partial"
                      checked={invoiceMode === "partial"}
                      onChange={() => setInvoiceMode("partial")}
                    />
                    Factura parcial
                  </label>
                </fieldset>
              )}
              {existingDraft && !createdId && (
                <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="font-semibold">
                    Ya hay un{" "}
                    {kind === "invoice"
                      ? "borrador de factura"
                      : "albarán en borrador"}{" "}
                    {selectedProject ? "de esta obra" : "sin obra"}.
                  </p>
                  <label className="mt-2 flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={forceNewDraft}
                      disabled={opening}
                      onChange={(event) =>
                        setForceNewDraft(event.target.checked)
                      }
                    />
                    Crear otro documento distinto
                  </label>
                </div>
              )}
              {createdId && (
                <p className="sm:col-span-2 feedback-success" role="status">
                  Borrador preparado.{" "}
                  <Link
                    className="font-bold underline"
                    href={documentUrl(createdId)}
                  >
                    Abrir borrador
                  </Link>
                </p>
              )}
              <button
                type="button"
                className="action-primary self-end"
                disabled={opening}
                onClick={create}
              >
                {opening
                  ? "Abriendo borrador…"
                  : existingDraft && !forceNewDraft
                    ? "Continuar borrador"
                    : `Crear ${kind === "invoice" ? "factura" : "albarán"} en borrador`}
                <ArrowRight size={20} />
              </button>
            </div>
          )}
          {error && (
            <p className="feedback-error" role="alert">
              {error}
            </p>
          )}
          {creationUncertain && (
            <button
              className="action-secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Actualizar lista y comprobar borradores
            </button>
          )}
          <div className="grid gap-3">
            {matches.length === 0 ? (
              <div className="py-10 text-center text-muted">
                No hay {kind === "invoice" ? "facturas" : "albaranes"} con estos
                filtros.
              </div>
            ) : (
              matches.map((doc) => {
                const balance = documentBalance(doc, payments);
                const overdue =
                  doc.status === "issued" &&
                  balance.outstanding > 0 &&
                  !!doc.due_date &&
                  doc.due_date < today;
                const label =
                  doc.status === "draft"
                    ? "Borrador"
                    : doc.kind === "delivery_note"
                      ? "Emitido"
                      : balance.outstanding === 0
                        ? "Cobrada"
                        : overdue
                          ? "Vencida"
                          : balance.paid > 0
                            ? "Cobro parcial"
                            : "Pendiente de cobro";
                const tone =
                  doc.status === "draft"
                    ? "bg-gray-100 text-gray-700"
                    : doc.kind === "delivery_note" || balance.outstanding === 0
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-amber-50 text-amber-900";
                return (
                  <Link
                    key={doc.id}
                    href={`/sales/${doc.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line bg-white p-4 hover:border-moss focus-visible:outline-moss"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <strong>
                          {doc.number ??
                            `${SALES_LABELS[doc.kind]} en borrador`}
                        </strong>
                        <span
                          className={`rounded px-2 py-1 text-sm font-semibold ${tone}`}
                        >
                          {label}
                        </span>
                      </div>
                      <p className="mt-2 break-words font-semibold">
                        {doc.client_name || "Cliente por completar"}
                      </p>
                      <p className="mt-1 break-words text-sm text-muted">
                        {displayDay(doc.issue_date)}
                        {doc.source_label ? ` · ${doc.source_label}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong className="text-xl">
                        {formatCurrency(Number(doc.total))}
                      </strong>
                      {doc.kind === "invoice" && doc.status === "issued" && (
                        <p className="mt-1 text-sm text-muted">
                          Pendiente {formatCurrency(balance.outstanding)}
                        </p>
                      )}
                    </div>
                    <ArrowRight size={22} className="shrink-0 text-moss" />
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
