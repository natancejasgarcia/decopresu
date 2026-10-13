"use client";

import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createExpenseAction } from "@/actions/financeActions";
import { prepareExpenseSubmission } from "@/lib/uploadExpenseReceipt";
import type { ExpenseReceiptCache } from "@/lib/uploadExpenseReceipt";
import { useAsyncTask } from "@/lib/useAsyncTask";

export function ExpenseForm({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, run] = useAsyncTask();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const expenseId = useRef<string>();
  const receipt = useRef<ExpenseReceiptCache>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = form.querySelector<HTMLInputElement>('input[name="receipt"]')
      ?.files?.[0];
    if (file) data.set("receipt", file);
    void run(async () => {
      setError("");
      setSuccess(false);
      expenseId.current ??= crypto.randomUUID();
      try {
        const prepared = await prepareExpenseSubmission(
          data,
          expenseId.current,
          receipt.current,
        );
        receipt.current = prepared.cached;
        const result = await createExpenseAction(prepared.formData);
        if (!result.ok) {
          setError(result.error ?? "No se pudo guardar el gasto.");
          return;
        }
        form.reset();
        expenseId.current = undefined;
        receipt.current = null;
        setSuccess(true);
        router.refresh();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "No se pudo guardar. Conserva los datos y vuelve a intentarlo.",
        );
      }
    });
  }
  return (
    <form onSubmit={submit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-bold text-moss"
        >
          <Loader2 size={17} className="animate-spin" /> Guardando gasto y
          justificante...
        </p>
      )}
      {error && (
        <p role="alert" className="feedback-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="feedback-success">
          Gasto guardado.
        </p>
      )}
    </form>
  );
}
