"use client";

import { Save, X } from "lucide-react";
import { todayMadrid } from "@/lib/sales";
import { PAYMENT_METHODS } from "@/lib/types";

export function SalesPaymentForm({
  outstanding,
  issueDate,
  pending,
  onSave,
  onCancel,
}: {
  outstanding: number;
  issueDate: string;
  pending: boolean;
  onSave: (values: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-4 grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(new FormData(event.currentTarget));
      }}
    >
      <label>
        <span className="form-label">Importe cobrado (€)</span>
        <input
          className="form-input"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          max={outstanding}
          step="0.01"
          defaultValue={outstanding}
          required
          disabled={pending}
        />
      </label>
      <label>
        <span className="form-label">Fecha del cobro</span>
        <input
          className="form-input"
          type="date"
          name="date"
          min={issueDate}
          defaultValue={todayMadrid() < issueDate ? issueDate : todayMadrid()}
          required
          disabled={pending}
        />
      </label>
      <label className="sm:col-span-2">
        <span className="form-label">Forma de pago</span>
        <select className="form-input" name="method" disabled={pending}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button className="action-primary" type="submit" disabled={pending}>
          <Save size={20} />
          {pending ? "Guardando…" : "Guardar cobro"}
        </button>
        <button
          className="action-secondary"
          type="button"
          onClick={onCancel}
          disabled={pending}
        >
          <X size={20} />
          Ahora no
        </button>
      </div>
    </form>
  );
}
