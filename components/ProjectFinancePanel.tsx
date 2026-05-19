"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, ReceiptText, Save, Trash2, X } from "lucide-react";
import { createExpenseAction, createPaymentAction, deleteExpenseAction, deletePaymentAction, updatePaymentAction } from "@/actions/financeActions";
import { formatCurrency } from "@/lib/calculations";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod, type ProjectExpense, type ProjectPayment } from "@/lib/types";

type ProjectFinancePanelProps = {
  projectId: string;
  budgetTotal: number;
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectFinancePanel({ projectId, budgetTotal, expenses, payments }: ProjectFinancePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const expenseTotal = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses]);
  const paymentTotal = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount), 0), [payments]);
  const profit = budgetTotal - expenseTotal;
  const pendingCollection = Math.max(budgetTotal - paymentTotal, 0);

  function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await createExpenseAction(formData);
        form.reset();
        router.refresh();
      } catch (error) {
        setErrorMessage(getActionErrorMessage(error));
      }
    });
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await createPaymentAction(formData);
        form.reset();
        router.refresh();
      } catch (error) {
        setErrorMessage(getActionErrorMessage(error));
      }
    });
  }

  function removeExpense(expenseId: string) {
    const formData = new FormData();
    formData.set("expense_id", expenseId);
    formData.set("project_id", projectId);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await deleteExpenseAction(formData);
        router.refresh();
      } catch (error) {
        setErrorMessage(getActionErrorMessage(error));
      }
    });
  }

  function removePayment(paymentId: string) {
    const formData = new FormData();
    formData.set("payment_id", paymentId);
    formData.set("project_id", projectId);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await deletePaymentAction(formData);
        router.refresh();
      } catch (error) {
        setErrorMessage(getActionErrorMessage(error));
      }
    });
  }

  function updatePayment(event: FormEvent<HTMLFormElement>, paymentId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("payment_id", paymentId);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await updatePaymentAction(formData);
        setEditingPaymentId(null);
        router.refresh();
      } catch (error) {
        setErrorMessage(getActionErrorMessage(error));
      }
    });
  }

  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <h2>Gastos y cobros</h2>
          <p className="text-sm font-semibold text-muted">Controla lo que cuesta y lo que se cobra en esta obra.</p>
        </div>
      </div>
      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <FinanceCard label="Presupuesto" value={formatCurrency(budgetTotal)} />
        <FinanceCard label="Gastos obra" value={formatCurrency(expenseTotal)} tone="red" />
        <FinanceCard label="Cobrado" value={formatCurrency(paymentTotal)} tone="green" />
        <FinanceCard label="Beneficio estimado" value={formatCurrency(profit)} detail={`Pendiente ${formatCurrency(pendingCollection)}`} tone={profit >= 0 ? "green" : "red"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form onSubmit={submitExpense} className="grid gap-3 rounded-lg bg-paper p-3">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex items-center gap-2">
            <ReceiptText size={18} className="text-moss" />
            <h3 className="font-black text-ink">Anadir gasto</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="expense-concept">Concepto</label>
              <input className="form-input" id="expense-concept" name="concept" placeholder="Pintura, lijas, gasolina..." required />
            </div>
            <div>
              <label className="form-label" htmlFor="expense-category">Categoria</label>
              <select className="form-input" id="expense-category" name="category" defaultValue="Materiales">
                {EXPENSE_CATEGORIES.map((category: ExpenseCategory) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="expense-supplier">Proveedor</label>
              <input className="form-input" id="expense-supplier" name="supplier" placeholder="Proveedor opcional" />
            </div>
            <div>
              <label className="form-label" htmlFor="expense-amount">Importe</label>
              <input className="form-input" id="expense-amount" name="amount" type="number" min="0" step="0.01" defaultValue="0" required />
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="expense-date">Fecha</label>
            <input className="form-input" id="expense-date" name="expense_date" type="date" defaultValue={todayValue()} />
          </div>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
            <input className="h-4 w-4 accent-moss" name="is_paid" type="checkbox" defaultChecked />
            Pagado
          </label>
          <textarea className="form-input min-h-20" name="notes" placeholder="Notas del ticket, color, material..." />
          <button className="h-11 rounded-lg bg-moss font-black text-white disabled:opacity-60" disabled={isPending}>Guardar gasto</button>
        </form>

        <form onSubmit={submitPayment} className="grid gap-3 rounded-lg bg-paper p-3">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-moss" />
            <h3 className="font-black text-ink">Registrar cobro</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label" htmlFor="payment-amount">Importe cobrado</label>
              <input className="form-input" id="payment-amount" name="amount" type="number" min="0" step="0.01" defaultValue="0" required />
            </div>
            <div>
              <label className="form-label" htmlFor="payment-method">Metodo</label>
              <select className="form-input" id="payment-method" name="method" defaultValue="Transferencia">
                {PAYMENT_METHODS.map((method: PaymentMethod) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label" htmlFor="payment-date">Fecha</label>
            <input className="form-input" id="payment-date" name="payment_date" type="date" defaultValue={todayValue()} />
          </div>
          <textarea className="form-input min-h-20" name="notes" placeholder="Transferencia, senal, pago final..." />
          <div>
            <label className="form-label" htmlFor="payment-receipt">PDF justificante</label>
            <input className="form-input file:mr-3 file:rounded-md file:border-0 file:bg-moss file:px-3 file:py-2 file:text-sm file:font-black file:text-white" id="payment-receipt" name="receipt" type="file" accept="application/pdf,.pdf" />
          </div>
          <button className="h-11 rounded-lg bg-moss font-black text-white disabled:opacity-60" disabled={isPending}>Guardar cobro</button>
        </form>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FinanceList
          title="Gastos de la obra"
          empty="No hay gastos registrados."
          rows={expenses.map((expense) => ({
            id: expense.id,
            title: expense.concept,
            meta: `${expense.category}${expense.supplier ? ` - ${expense.supplier}` : ""} - ${expense.expense_date}`,
            amount: Number(expense.amount),
            notes: expense.notes,
            onDelete: () => removeExpense(expense.id),
          }))}
          isPending={isPending}
        />
        <FinanceList
          title="Cobros"
          empty="No hay cobros registrados."
          rows={payments}
          isPending={isPending}
          projectId={projectId}
          editingPaymentId={editingPaymentId}
          setEditingPaymentId={setEditingPaymentId}
          onUpdatePayment={updatePayment}
          onDeletePayment={removePayment}
        />
      </div>
    </section>
  );
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "No se pudo guardar el cambio. Revisa los datos e inténtalo otra vez.";
}

function FinanceCard({ label, value, detail, tone = "default" }: { label: string; value: string; detail?: string; tone?: "default" | "green" | "red" }) {
  const toneClass = tone === "green" ? "bg-emerald-50 text-emerald-800" : tone === "red" ? "bg-red-50 text-red-700" : "bg-paper text-ink";

  return (
    <article className={`rounded-lg p-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase opacity-80">{label}</p>
      <strong className="mt-1 block text-2xl text-ink">{value}</strong>
      {detail ? <p className="mt-1 text-sm font-bold opacity-80">{detail}</p> : null}
    </article>
  );
}

function FinanceList({
  title,
  empty,
  rows,
  isPending,
  projectId,
  editingPaymentId,
  setEditingPaymentId,
  onUpdatePayment,
  onDeletePayment,
}: {
  title: string;
  empty: string;
  rows: ProjectPayment[] | Array<{ id: string; title: string; meta: string; amount: number; notes?: string | null; onDelete: () => void }>;
  isPending: boolean;
  projectId?: string;
  editingPaymentId?: string | null;
  setEditingPaymentId?: (id: string | null) => void;
  onUpdatePayment?: (event: FormEvent<HTMLFormElement>, paymentId: string) => void;
  onDeletePayment?: (paymentId: string) => void;
}) {
  const isPaymentList = Boolean(projectId && setEditingPaymentId && onUpdatePayment && onDeletePayment);

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <h3 className="font-black text-ink">{title}</h3>
      <div className="mt-3 grid gap-2">
        {rows.length === 0 ? (
          <p className="rounded-lg bg-paper p-3 text-sm font-semibold text-muted">{empty}</p>
        ) : (
          rows.map((row) => {
            if (isPaymentList && "payment_date" in row) {
              const isEditing = editingPaymentId === row.id;

              return (
                <article key={row.id} className="rounded-lg border border-line p-3">
                  {isEditing ? (
                    <form onSubmit={(event) => onUpdatePayment?.(event, row.id)} className="grid gap-3">
                      <input type="hidden" name="project_id" value={projectId} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="form-label" htmlFor={`payment-edit-amount-${row.id}`}>Importe</label>
                          <input className="form-input" id={`payment-edit-amount-${row.id}`} name="amount" type="number" min="0" step="0.01" defaultValue={Number(row.amount)} required />
                        </div>
                        <div>
                          <label className="form-label" htmlFor={`payment-edit-method-${row.id}`}>Metodo</label>
                          <select className="form-input" id={`payment-edit-method-${row.id}`} name="method" defaultValue={row.method}>
                            {PAYMENT_METHODS.map((method: PaymentMethod) => (
                              <option key={method} value={method}>{method}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="form-label" htmlFor={`payment-edit-date-${row.id}`}>Fecha</label>
                          <input className="form-input" id={`payment-edit-date-${row.id}`} name="payment_date" type="date" defaultValue={row.payment_date} />
                        </div>
                      </div>
                      <textarea className="form-input min-h-20" name="notes" defaultValue={row.notes ?? ""} placeholder="Notas del cobro..." />
                      <div>
                        <label className="form-label" htmlFor={`payment-edit-receipt-${row.id}`}>Nuevo PDF justificante</label>
                        <input className="form-input file:mr-3 file:rounded-md file:border-0 file:bg-moss file:px-3 file:py-2 file:text-sm file:font-black file:text-white" id={`payment-edit-receipt-${row.id}`} name="receipt" type="file" accept="application/pdf,.pdf" />
                        {row.receipt_signed_url ? (
                          <a className="mt-2 inline-flex text-xs font-black text-moss underline" href={row.receipt_signed_url} target="_blank" rel="noreferrer">
                            Ver PDF actual
                          </a>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-moss px-4 text-sm font-black text-white disabled:opacity-60" disabled={isPending}>
                          <Save size={17} />
                          Guardar cambios
                        </button>
                        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-black text-ink" type="button" onClick={() => setEditingPaymentId?.(null)}>
                          <X size={17} />
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                      <div>
                        <strong className="block text-sm text-ink">{row.method}</strong>
                        <p className="text-xs font-semibold text-muted">{row.payment_date}</p>
                        {row.notes ? <p className="mt-1 text-sm text-muted">{row.notes}</p> : null}
                        {row.receipt_signed_url ? (
                          <a className="mt-1 inline-flex text-xs font-black text-moss underline" href={row.receipt_signed_url} target="_blank" rel="noreferrer">
                            Ver PDF {row.receipt_file_name ? `- ${row.receipt_file_name}` : ""}
                          </a>
                        ) : null}
                      </div>
                      <strong className="whitespace-nowrap text-ink">{formatCurrency(Number(row.amount))}</strong>
                      <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink disabled:opacity-50" disabled={isPending} onClick={() => setEditingPaymentId?.(row.id)} title="Editar cobro" type="button">
                        <Pencil size={17} />
                      </button>
                      <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700 disabled:opacity-50" disabled={isPending} onClick={() => onDeletePayment?.(row.id)} title="Borrar" type="button">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </article>
              );
            }

            const expenseRow = row as { id: string; title: string; meta: string; amount: number; notes?: string | null; onDelete: () => void };

            return (
              <article key={expenseRow.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-line p-3">
                <div>
                  <strong className="block text-sm text-ink">{expenseRow.title}</strong>
                  <p className="text-xs font-semibold text-muted">{expenseRow.meta}</p>
                  {expenseRow.notes ? <p className="mt-1 text-sm text-muted">{expenseRow.notes}</p> : null}
                </div>
                <strong className="whitespace-nowrap text-ink">{formatCurrency(expenseRow.amount)}</strong>
                <button
                  className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700 disabled:opacity-50"
                  disabled={isPending}
                  onClick={expenseRow.onDelete}
                  title="Borrar"
                  type="button"
                >
                  <Trash2 size={17} />
                </button>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
