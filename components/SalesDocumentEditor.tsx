"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAsyncTask } from "@/lib/useAsyncTask";
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  Download,
  FileText,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  createSalesDocumentAction,
  deleteSalesDraftAction,
  issueSalesDocumentAction,
  recordSalesPaymentAction,
  saveSalesDocumentAction,
} from "@/actions/salesActions";
import {
  displayDay,
  documentBalance,
  roundAmount,
  SALES_LABELS,
  salesTotals,
  type SalesDocument,
  type SalesDraftInput,
  type SalesLine,
  type SalesPayment,
} from "@/lib/sales";
import { formatCurrency } from "@/lib/calculations";
import { SalesPartialInvoiceForm } from "@/components/SalesPartialInvoiceForm";
import { SalesPaymentForm } from "@/components/SalesPaymentForm";

function inputFrom(doc: SalesDocument): SalesDraftInput {
  return {
    client_name: doc.client_name,
    client_tax_id: doc.client_tax_id,
    client_address: doc.client_address,
    client_email: doc.client_email,
    issue_date: doc.issue_date,
    due_date: doc.due_date ?? "",
    notes: doc.notes,
    lines: doc.lines,
  };
}
export function SalesDocumentEditor({
  document,
  payments,
  linkedInvoiceId,
  initialPartial = false,
  initialCollect = false,
}: {
  document: SalesDocument;
  payments: SalesPayment[];
  linkedInvoiceId?: string;
  initialPartial?: boolean;
  initialCollect?: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState(() => inputFrom(document));
  const [pending, startTransition] = useAsyncTask();
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<"issue" | "delete" | "collect" | null>(
    () =>
      initialCollect &&
      document.kind === "invoice" &&
      document.status === "issued" &&
      documentBalance(document, payments).outstanding > 0
        ? "collect"
        : null,
  );
  const [partialOpen, setPartialOpen] = useState(
    initialPartial &&
      document.kind === "invoice" &&
      !document.source_document_id &&
      document.status === "draft",
  );
  const [savedPayments, setSavedPayments] = useState<SalesPayment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const collectionPromptSeen = useRef(false);
  const readonly = document.status === "issued";
  const title = SALES_LABELS[document.kind];
  const totals = salesTotals(input.lines);
  const allPayments = [
    ...payments,
    ...savedPayments.filter(
      (payment) => !payments.some((existing) => existing.id === payment.id),
    ),
  ];
  const balance = documentBalance(document, allPayments);
  useEffect(() => {
    setSavedPayments((current) => {
      const remaining = current.filter(
        (payment) => !payments.some((saved) => saved.id === payment.id),
      );
      return remaining.length === current.length ? current : remaining;
    });
  }, [payments]);
  useEffect(() => {
    if (confirm === "collect") dialogRef.current?.focus();
    else if (confirm) cancelRef.current?.focus();
  }, [confirm]);
  useEffect(() => {
    if (!initialCollect) {
      collectionPromptSeen.current = false;
      return;
    }
    if (
      initialCollect &&
      !collectionPromptSeen.current &&
      readonly &&
      document.kind === "invoice" &&
      balance.outstanding > 0
    ) {
      collectionPromptSeen.current = true;
      setConfirm("collect");
    }
  }, [initialCollect, readonly, document.kind, balance.outstanding]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function update<K extends keyof SalesDraftInput>(
    key: K,
    value: SalesDraftInput[K],
  ) {
    setInput((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setFeedback(null);
  }
  function updateLine(index: number, patch: Partial<SalesLine>) {
    update(
      "lines",
      input.lines.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    );
  }
  function run(work: () => Promise<void>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await work();
      } catch {
        setFeedback({
          error: true,
          text: "No se pudo conectar. Tus cambios siguen en pantalla.",
        });
      }
    });
  }
  async function save() {
    if (partialOpen) {
      setFeedback({
        error: true,
        text: "Aplica el importe parcial o cancela ese cambio antes de guardar.",
      });
      return false;
    }
    const result = await saveSalesDocumentAction(document.id, input);
    if (!result.ok) {
      setFeedback({ error: true, text: result.error });
      return false;
    }
    setDirty(false);
    setFeedback({ error: false, text: "Borrador guardado." });
    router.refresh();
    return true;
  }
  function confirmAction() {
    run(async () => {
      if (confirm === "delete") {
        const result = await deleteSalesDraftAction(document.id);
        if (!result.ok) {
          setFeedback({ error: true, text: result.error });
          setConfirm(null);
          return;
        }
        router.push(`/sales?kind=${document.kind}`);
        return;
      }
      if (!(await save())) {
        setConfirm(null);
        return;
      }
      const result = await issueSalesDocumentAction(document.id);
      setConfirm(null);
      if (!result.ok) {
        setFeedback({ error: true, text: result.error });
        return;
      }
      setFeedback({
        error: false,
        text: `${title} emitido: ${result.number}.`,
      });
      if (document.kind === "invoice" && totals.total > 0) {
        router.replace(`/sales/${document.id}?collect=1`, { scroll: false });
      } else {
        router.refresh();
      }
    });
  }
  function closeCollection() {
    setConfirm(null);
    setPaymentOpen(false);
    router.replace(`/sales/${document.id}`, { scroll: false });
  }
  function savePayment(values: FormData) {
    run(async () => {
      const result = await recordSalesPaymentAction(document.id, values);
      if (!result.ok) {
        setFeedback({ error: true, text: result.error });
        return;
      }
      const paymentId = result.id;
      if (paymentId)
        setSavedPayments((current) => [
          ...current,
          {
            id: paymentId,
            sales_document_id: document.id,
            amount: Number(String(values.get("amount")).replace(",", ".")),
            payment_date: String(values.get("date")),
            method: String(values.get("method")),
          },
        ]);
      closeCollection();
      setFeedback({
        error: false,
        text: "Cobro guardado en la factura y en Finanzas.",
      });
      router.refresh();
    });
  }
  async function download() {
    setDownloading(true);
    setFeedback(null);
    try {
      const response = await fetch(`/sales/${document.id}/pdf`);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/pdf")
      )
        throw new Error("PDF");
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${title}-${(document.number ?? "borrador").replaceAll("/", "-")}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFeedback({
        error: true,
        text: "No se pudo descargar el PDF. Vuelve a intentarlo.",
      });
    } finally {
      setDownloading(false);
    }
  }
  const field = (
    label: string,
    key:
      | "client_name"
      | "client_tax_id"
      | "client_address"
      | "client_email"
      | "issue_date"
      | "due_date",
    type = "text",
    required = false,
  ) => (
    <label className={key === "client_address" ? "sm:col-span-2" : ""}>
      <span className="form-label">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        className="form-input"
        type={type}
        value={input[key]}
        required={required}
        disabled={readonly || pending}
        maxLength={key === "client_address" ? 400 : undefined}
        onChange={(e) => update(key, e.target.value)}
      />
    </label>
  );
  return (
    <div className="space-y-6">
      <Link href={`/sales?kind=${document.kind}`} className="action-secondary">
        <ArrowLeft size={20} />
        Volver a {document.kind === "invoice" ? "facturas" : "albaranes"}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {readonly ? "Documento emitido" : "Borrador"}
          </p>
          <h1 className="text-3xl font-bold">
            {document.number ??
              (document.kind === "invoice" ? "Nueva factura" : "Nuevo albarán")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {document.project_id && (
            <Link
              className="action-secondary"
              href={`/projects/${document.project_id}`}
            >
              Abrir obra
            </Link>
          )}
          <button
            className="action-secondary"
            disabled={downloading || dirty || pending || partialOpen}
            onClick={download}
            type="button"
          >
            <Download size={20} />
            {downloading ? "Descargando…" : "Descargar PDF"}
          </button>
        </div>
      </div>
      {readonly && document.kind === "delivery_note" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
          <p>
            {linkedInvoiceId
              ? "Este albarán ya tiene una factura vinculada."
              : "Albarán preparado para facturar."}
          </p>
          {linkedInvoiceId ? (
            <Link className="action-primary" href={`/sales/${linkedInvoiceId}`}>
              <FileText size={20} />
              Ver factura
            </Link>
          ) : (
            <button
              className="action-primary"
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await createSalesDocumentAction(
                    "invoice",
                    undefined,
                    document.id,
                  );
                  if (!result.ok) {
                    setFeedback({ error: true, text: result.error });
                    return;
                  }
                  router.push(`/sales/${result.id}`);
                })
              }
            >
              <FileText size={20} />
              Crear factura de este albarán
            </button>
          )}
        </div>
      )}
      {document.source_document_id && (
        <Link
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-moss underline"
          href={`/sales/${document.source_document_id}`}
        >
          Albarán de origen: {document.source_label}
        </Link>
      )}
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={feedback.error ? "feedback-error" : "feedback-success"}
        >
          {feedback.text}
        </p>
      )}
      {!readonly &&
        document.kind === "invoice" &&
        !document.source_document_id && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <h2 className="text-xl font-bold">Facturación parcial</h2>
              <button
                className="action-secondary"
                type="button"
                disabled={pending}
                aria-expanded={partialOpen}
                aria-controls="partial-invoice-form"
                onClick={() => setPartialOpen(!partialOpen)}
              >
                <CircleDollarSign size={20} />
                Importe libre
              </button>
            </div>
            {partialOpen && (
              <SalesPartialInvoiceForm
                sourceLabel={document.source_label}
                disabled={pending}
                onCancel={() => setPartialOpen(false)}
                onApply={(line) => {
                  update("lines", [line]);
                  setPartialOpen(false);
                  setFeedback({
                    error: false,
                    text: "Importe parcial aplicado al borrador. El presupuesto de la obra no cambia.",
                  });
                }}
              />
            )}
          </section>
        )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await save();
          });
        }}
        className="space-y-6"
      >
        <fieldset
          disabled={readonly || pending}
          className="min-w-0 border-y border-line py-5"
        >
          <legend className="pr-3 text-xl font-bold">Cliente y fechas</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("Cliente", "client_name", "text", true)}
            {field(
              "NIF / CIF",
              "client_tax_id",
              "text",
              document.kind === "invoice",
            )}
            {field(
              "Dirección fiscal",
              "client_address",
              "text",
              document.kind === "invoice",
            )}
            {field("Correo electrónico", "client_email", "email")}
            {field("Fecha del documento", "issue_date", "date", true)}
            {document.kind === "invoice" &&
              field("Vencimiento", "due_date", "date")}
          </div>
        </fieldset>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Conceptos</h2>
            {!readonly && (
              <button
                className="action-secondary"
                type="button"
                disabled={pending || input.lines.length >= 150}
                onClick={() =>
                  update("lines", [
                    ...input.lines,
                    {
                      concept: "",
                      notes: "",
                      quantity: 1,
                      unit: "",
                      unit_price: 0,
                      vat_rate: 21,
                    },
                  ])
                }
              >
                <Plus size={20} />
                Añadir concepto
              </button>
            )}
          </div>
          {input.lines.length === 0 && (
            <p className="border-y border-line py-6 text-muted">
              Todavía no hay conceptos.
            </p>
          )}
          <div className="grid gap-4">
            {input.lines.map((line, index) => (
              <fieldset
                disabled={readonly || pending}
                key={index}
                className="min-w-0 rounded-lg border border-line bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="font-bold">Concepto {index + 1}</h3>
                  {!readonly && (
                    <button
                      className="action-secondary text-red-700"
                      type="button"
                      title="Quitar este concepto"
                      aria-label={`Quitar concepto ${index + 1}`}
                      onClick={() =>
                        update(
                          "lines",
                          input.lines.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={18} />
                      Quitar
                    </button>
                  )}
                </div>
                <label className="block">
                  <span className="form-label">Trabajo o material *</span>
                  <input
                    className="form-input"
                    value={line.concept}
                    maxLength={200}
                    required
                    onChange={(e) =>
                      updateLine(index, { concept: e.target.value })
                    }
                  />
                </label>
                <label className="mt-3 block">
                  <span className="form-label">Detalles</span>
                  <textarea
                    className="form-input min-h-20"
                    value={line.notes}
                    maxLength={4000}
                    onChange={(e) =>
                      updateLine(index, { notes: e.target.value })
                    }
                  />
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <label>
                    <span className="form-label">Cantidad *</span>
                    <input
                      className="form-input"
                      type="number"
                      min="0.0001"
                      step="any"
                      inputMode="decimal"
                      required
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(index, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span className="form-label">Unidad</span>
                    <input
                      className="form-input"
                      value={line.unit}
                      maxLength={20}
                      onChange={(e) =>
                        updateLine(index, { unit: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="form-label">Precio (€) *</span>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      required
                      value={line.unit_price}
                      onChange={(e) =>
                        updateLine(index, {
                          unit_price: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="form-label">IVA</span>
                    <select
                      className="form-input"
                      value={line.vat_rate}
                      onChange={(e) =>
                        updateLine(index, {
                          vat_rate: Number(
                            e.target.value,
                          ) as SalesLine["vat_rate"],
                        })
                      }
                    >
                      <option value={21}>21 %</option>
                      <option value={10}>10 %</option>
                      <option value={0}>0 %</option>
                    </select>
                  </label>
                  <div className="col-span-2 border-t border-line pt-2 lg:col-span-1 lg:border-0 lg:pt-0">
                    <p className="form-label">Base de la línea</p>
                    <strong className="block py-3 text-lg">
                      {formatCurrency(
                        roundAmount(line.quantity * line.unit_price),
                      )}
                    </strong>
                  </div>
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="form-label">Observaciones</span>
          <textarea
            className="form-input min-h-24"
            value={input.notes}
            maxLength={6000}
            disabled={readonly || pending}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>
        <div className="grid gap-3 border-y border-line py-5 sm:grid-cols-3">
          <div>
            <p className="text-muted">Base imponible</p>
            <strong className="text-xl">
              {formatCurrency(totals.subtotal)}
            </strong>
          </div>
          <div>
            <p className="text-muted">IVA</p>
            <strong className="text-xl">{formatCurrency(totals.tax)}</strong>
          </div>
          <div>
            <p className="font-semibold">Total</p>
            <strong className="text-3xl text-moss">
              {formatCurrency(totals.total)}
            </strong>
          </div>
        </div>
        {!readonly && (
          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-3 border-t border-line bg-white py-4 lg:bottom-0">
            <button
              className="action-secondary"
              type="submit"
              disabled={pending || partialOpen}
            >
              <Save size={20} />
              {pending ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              className="action-primary"
              type="button"
              disabled={pending || input.lines.length === 0 || partialOpen}
              onClick={() => setConfirm("issue")}
            >
              <Check size={20} />
              Emitir {title.toLocaleLowerCase("es")}
            </button>
            {dirty && (
              <p className="w-full text-sm text-amber-800" role="status">
                Hay cambios sin guardar.
              </p>
            )}
          </div>
        )}
      </form>
      {!readonly && (
        <button
          className="action-secondary text-red-700"
          type="button"
          disabled={pending}
          onClick={() => setConfirm("delete")}
        >
          <Trash2 size={20} />
          Borrar borrador
        </button>
      )}
      {readonly && document.kind === "invoice" && (
        <section className="border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Cobros de esta factura</h2>
              <p className="mt-2">
                Cobrado <strong>{formatCurrency(balance.paid)}</strong> ·
                Pendiente <strong>{formatCurrency(balance.outstanding)}</strong>
              </p>
            </div>
            {balance.outstanding > 0 && (
              <button
                className="action-primary"
                type="button"
                onClick={() => setPaymentOpen(!paymentOpen)}
              >
                <Plus size={20} />
                Registrar cobro
              </button>
            )}
          </div>
          {paymentOpen && balance.outstanding > 0 && (
            <SalesPaymentForm
              key={balance.outstanding}
              outstanding={balance.outstanding}
              issueDate={document.issue_date}
              pending={pending}
              onSave={savePayment}
              onCancel={closeCollection}
            />
          )}
          <ul className="mt-4 divide-y divide-line">
            {allPayments
              .filter((p) => p.sales_document_id === document.id)
              .map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap justify-between gap-3 py-3"
                >
                  <span>
                    {displayDay(p.payment_date)} · {p.method}
                  </span>
                  <strong>{formatCurrency(Number(p.amount))}</strong>
                </li>
              ))}
          </ul>
        </section>
      )}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) {
              if (confirm === "collect") closeCollection();
              else setConfirm(null);
            }
            if (e.key === "Tab") {
              e.preventDefault();
              const controls = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
                ),
              );
              const index = controls.indexOf(
                window.document.activeElement as HTMLElement,
              );
              controls[
                (index + (e.shiftKey ? -1 : 1) + controls.length) %
                  controls.length
              ]?.focus();
            }
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title" className="text-2xl font-bold">
              {confirm === "collect"
                ? "Factura emitida. ¿Registrar cobro?"
                : confirm === "issue"
                  ? `Emitir ${title.toLocaleLowerCase("es")}`
                  : "Borrar este borrador"}
            </h2>
            <p className="mt-4 leading-7">
              {confirm === "collect"
                ? `${document.number ?? "Factura"} · Pendiente ${formatCurrency(balance.outstanding)}.`
                : confirm === "issue"
                  ? `Cliente: ${input.client_name || "sin nombre"}. Total: ${formatCurrency(totals.total)}. Se asignará un número y los conceptos quedarán bloqueados.`
                  : "Se eliminará este borrador. La obra y el presupuesto de origen se conservan."}
            </p>
            {confirm === "issue" && document.kind === "invoice" && (
              <p className="mt-3 text-sm font-semibold text-amber-900">
                Documento de gestión interna. La integración fiscal con la AEAT
                está pendiente.
              </p>
            )}
            {confirm === "collect" ? (
              <>
                {feedback?.error && (
                  <p className="feedback-error mt-3" role="alert">
                    {feedback.text}
                  </p>
                )}
                <SalesPaymentForm
                  outstanding={balance.outstanding}
                  issueDate={document.issue_date}
                  pending={pending}
                  onSave={savePayment}
                  onCancel={closeCollection}
                />
              </>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  ref={cancelRef}
                  className="action-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirm(null)}
                >
                  <X size={20} />
                  Volver
                </button>
                <button
                  className="action-primary"
                  type="button"
                  disabled={pending}
                  onClick={confirmAction}
                >
                  <Check size={20} />
                  {pending
                    ? "Procesando…"
                    : confirm === "issue"
                      ? "Confirmar emisión"
                      : "Borrar borrador"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
