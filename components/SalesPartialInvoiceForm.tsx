"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/calculations";
import {
  partialInvoiceSchema,
  partialInvoiceLine,
  salesTotals,
  type SalesLine,
} from "@/lib/sales";

export function SalesPartialInvoiceForm({
  sourceLabel,
  disabled,
  onApply,
  onCancel,
}: {
  sourceLabel: string;
  disabled: boolean;
  onApply: (line: SalesLine) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState(() =>
    `Factura parcial${sourceLabel ? ` - ${sourceLabel}` : ""}`.slice(0, 200),
  );
  const [vat, setVat] = useState<SalesLine["vat_rate"]>(21);
  const [error, setError] = useState("");
  const parsed = partialInvoiceSchema.safeParse({
    amount,
    concept,
    notes: sourceLabel
      ? `Facturación parcial de los trabajos de ${sourceLabel}.`
      : "",
    vat_rate: vat,
  });
  const totals = parsed.success
    ? salesTotals([partialInvoiceLine(parsed.data)])
    : null;

  return (
    <form
      id="partial-invoice-form"
      className="grid gap-4 border-b border-line pb-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        onApply(partialInvoiceLine(parsed.data));
      }}
    >
      <label className="sm:col-span-2">
        <span className="form-label">Concepto de esta factura</span>
        <input
          className="form-input"
          value={concept}
          onChange={(event) => setConcept(event.target.value)}
          maxLength={200}
          required
          disabled={disabled}
        />
      </label>
      <label>
        <span className="form-label">Importe sin IVA (€)</span>
        <input
          className="form-input"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          disabled={disabled}
        />
      </label>
      <label>
        <span className="form-label">IVA</span>
        <select
          className="form-input"
          value={vat}
          onChange={(event) =>
            setVat(Number(event.target.value) as SalesLine["vat_rate"])
          }
          disabled={disabled}
        >
          <option value={21}>21 %</option>
          <option value={10}>10 %</option>
          <option value={0}>0 %</option>
        </select>
      </label>
      {totals && (
        <div
          aria-live="polite"
          className="flex flex-wrap justify-between gap-3 border-y border-line py-3 sm:col-span-2"
        >
          <span>IVA: {formatCurrency(totals.tax)}</span>
          <strong>Total factura: {formatCurrency(totals.total)}</strong>
        </div>
      )}
      {error && (
        <p className="feedback-error sm:col-span-2" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button className="action-primary" type="submit" disabled={disabled}>
          <Check size={20} />
          Usar este importe
        </button>
        <button
          className="action-secondary"
          type="button"
          disabled={disabled}
          onClick={onCancel}
        >
          <X size={20} />
          Cancelar
        </button>
      </div>
    </form>
  );
}
