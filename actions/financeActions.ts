"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { EXPENSE_CATEGORIES, FIXED_COST_FREQUENCIES, PAYMENT_METHODS } from "@/lib/types";
import { expenseReceiptMetadata, MAX_EXPENSE_RECEIPT_SIZE, uploadedExpenseReceiptSchema, validateExpenseReceiptPath } from "@/lib/expenseReceipts";

const MAX_RECEIPT_FILE_SIZE = 10 * 1024 * 1024;
const optionalUuid = z.preprocess((value) => (value === "" || value === null ? null : value), z.string().uuid().nullable());
const optionalText = z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : null), z.string().nullable());

const expenseSchema = z.object({
  project_id: optionalUuid,
  category: z.enum(EXPENSE_CATEGORIES as [string, ...string[]]),
  supplier: optionalText,
  concept: z.string().trim().min(2),
  amount: z.coerce.number().min(0),
  expense_date: z.string().min(8),
  is_paid: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  notes: optionalText,
});

const paymentSchema = z.object({
  project_id: optionalUuid,
  amount: z.coerce.number().min(0),
  payment_date: z.string().min(8),
  method: z.enum(PAYMENT_METHODS as [string, ...string[]]),
  notes: optionalText,
});

const fixedCostSchema = z.object({
  name: z.string().trim().min(2),
  amount: z.coerce.number().min(0),
  frequency: z.enum(FIXED_COST_FREQUENCIES as [string, ...string[]]),
  next_payment_date: z.preprocess((value) => (value === "" || value === null ? null : value), z.string().nullable()),
  is_active: z.preprocess((value) => value === "on" || value === "true", z.boolean()),
  notes: optionalText,
});

function currentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

type FinanceActionResult = {
  ok: boolean;
  error?: string;
};

export async function createExpenseAction(formData: FormData): Promise<FinanceActionResult> {
  const { supabase, user } = await requireUserProfile();
  const parsed = expenseSchema.safeParse({
    ...Object.fromEntries(formData),
    expense_date: formData.get("expense_date") || currentDateValue(),
  });

  if (!parsed.success) return actionError("Revisa el concepto, importe y fecha del gasto.");
  const expenseId = z.string().uuid().safeParse(formData.get("expense_id") ?? crypto.randomUUID());
  if (!expenseId.success) return actionError("El identificador del gasto no es valido.");
  try {
    let uploaded = null;
    const metadata = formData.get("uploaded_receipt");
    if (metadata) {
      const receipt = uploadedExpenseReceiptSchema.safeParse(JSON.parse(String(metadata)));
      if (!receipt.success || !validateExpenseReceiptPath(receipt.data, parsed.data.project_id, user.id, expenseId.data)) {
        return actionError("El justificante no pertenece a este gasto. Vuelve a seleccionar el archivo.");
      }
      uploaded = receipt.data;
    }
    const matches = (row: Record<string, unknown>) => row.created_by === user.id
      && Object.entries(parsed.data).every(([key, value]) => key === "amount" ? Number(row[key]) === value : row[key] === value)
      && (row.receipt_file_url ?? null) === (uploaded?.path ?? null);
    const existing = await supabase.from("project_expenses").select("*").eq("id", expenseId.data).maybeSingle<Record<string, unknown>>();
    if (existing.error) return actionError(friendlyFinanceError(existing.error.message));
    if (existing.data) {
      if (!matches(existing.data)) return actionError("Este gasto ya se guardo con otros datos. Comprueba la lista antes de volver a registrarlo.");
      revalidatePath("/finance");
      if (parsed.data.project_id) revalidatePath(`/projects/${parsed.data.project_id}`);
      return { ok: true };
    }

    let receiptData: { receipt_file_name: string; receipt_file_url: string; receipt_file_type: string } | null = null;
    if (uploaded) {
      const { data: stored, error } = await supabase.storage.from("project-files").info(uploaded.path);
      const size = Number(stored?.size ?? stored?.metadata?.size);
      const type = stored?.contentType ?? stored?.metadata?.mimetype;
      if (error || !stored || size !== uploaded.size || size > MAX_EXPENSE_RECEIPT_SIZE || type !== uploaded.type) {
        return actionError("No se pudo comprobar la foto o PDF subido. El gasto no se ha registrado; vuelve a intentarlo.");
      }
      receiptData = { receipt_file_name: uploaded.name, receipt_file_url: uploaded.path, receipt_file_type: uploaded.type };
    } else {
      const file = formData.get("receipt");
      if (isUploadedFile(file)) expenseReceiptMetadata(file);
      const receipt = await uploadFinanceReceipt(supabase, parsed.data.project_id, file);
      if (!receipt.ok) return actionError(receipt.error ?? "No se pudo subir el justificante.");
      receiptData = receipt.data ?? null;
    }

    // The amount and the verified attachment are inserted together, never in two writes.
    const { error } = await supabase.from("project_expenses").insert({ id: expenseId.data, ...parsed.data, ...receiptData, created_by: user.id });
    if (error) {
      if (error.code === "23505") {
        const retry = await supabase.from("project_expenses").select("*").eq("id", expenseId.data).maybeSingle<Record<string, unknown>>();
        if (retry.data && matches(retry.data)) return { ok: true };
      }
      return actionError(friendlyFinanceError(error.message));
    }
    if (parsed.data.project_id) {
      await touchProject(supabase, parsed.data.project_id);
      revalidatePath(`/projects/${parsed.data.project_id}`);
    }
    revalidatePath("/dashboard");
    revalidatePath("/finance");
    return { ok: true };
  } catch (error) {
    console.error("[finance-expense] No se pudo completar el guardado:", error instanceof Error ? error.message : "Error desconocido");
    return actionError("No se pudo guardar el gasto con su justificante. Conserva los datos y vuelve a intentarlo.");
  }
}

export async function deleteExpenseAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const expenseId = z.string().uuid().parse(formData.get("expense_id"));
  const projectId = optionalUuid.parse(formData.get("project_id"));

  const { data: expense } = await supabase
    .from("project_expenses")
    .select("receipt_file_url")
    .eq("id", expenseId)
    .maybeSingle<{ receipt_file_url: string | null }>();

  const { error } = await supabase.from("project_expenses").delete().eq("id", expenseId);

  if (error) throw new Error(error.message);

  if (expense?.receipt_file_url) {
    await supabase.storage.from("project-files").remove([expense.receipt_file_url]);
  }

  if (projectId) {
    await touchProject(supabase, projectId);
    revalidatePath(`/projects/${projectId}`);
  }

  revalidatePath("/finance");
}

export async function createPaymentAction(formData: FormData): Promise<FinanceActionResult> {
  const { supabase, user } = await requireUserProfile();
  const parsed = paymentSchema.safeParse({
    ...Object.fromEntries(formData),
    payment_date: formData.get("payment_date") || currentDateValue(),
  });

  if (!parsed.success) return actionError("Revisa los datos del cobro.");

  const { data: payment, error } = await supabase.from("project_payments").insert({
    ...parsed.data,
    created_by: user.id,
  }).select("id, project_id").single<{ id: string; project_id: string | null }>();

  if (error) return actionError(friendlyFinanceError(error.message));

  const receiptResult = await attachFinanceReceipt(supabase, "project_payments", payment.id, parsed.data.project_id, formData.get("receipt"));

  if (parsed.data.project_id) {
    await touchProject(supabase, parsed.data.project_id);
    revalidatePath(`/projects/${parsed.data.project_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/finance");

  if (!receiptResult.ok) {
    return {
      ok: false,
      error: `El cobro se guardo, pero el adjunto no: ${receiptResult.error}`,
    };
  }

  return { ok: true };
}

export async function createPaymentFormAction(formData: FormData): Promise<void> {
  await createPaymentAction(formData);
}

export async function updatePaymentAction(formData: FormData): Promise<FinanceActionResult> {
  const { supabase } = await requireUserProfile();
  const paymentId = z.string().uuid().parse(formData.get("payment_id"));
  const parsed = paymentSchema.safeParse({
    ...Object.fromEntries(formData),
    payment_date: formData.get("payment_date") || currentDateValue(),
  });

  if (!parsed.success) return actionError("Revisa los datos del cobro.");

  const { error } = await supabase
    .from("project_payments")
    .update({
      amount: parsed.data.amount,
      payment_date: parsed.data.payment_date,
      method: parsed.data.method,
      notes: parsed.data.notes,
    })
    .eq("id", paymentId);

  if (error) return actionError(friendlyFinanceError(error.message));

  const receiptResult = await attachFinanceReceipt(supabase, "project_payments", paymentId, parsed.data.project_id, formData.get("receipt"));

  if (parsed.data.project_id) {
    await touchProject(supabase, parsed.data.project_id);
    revalidatePath(`/projects/${parsed.data.project_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/finance");

  if (!receiptResult.ok) {
    return {
      ok: false,
      error: `El cobro se guardo, pero el adjunto no: ${receiptResult.error}`,
    };
  }

  return { ok: true };
}

export async function deletePaymentAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const paymentId = z.string().uuid().parse(formData.get("payment_id"));
  const projectId = optionalUuid.parse(formData.get("project_id"));

  const { data: payment } = await supabase
    .from("project_payments")
    .select("receipt_file_url")
    .eq("id", paymentId)
    .maybeSingle<{ receipt_file_url: string | null }>();

  const { error } = await supabase.from("project_payments").delete().eq("id", paymentId);

  if (error) throw new Error(error.message);

  if (payment?.receipt_file_url) {
    await supabase.storage.from("project-files").remove([payment.receipt_file_url]);
  }

  if (projectId) {
    await touchProject(supabase, projectId);
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/finance");
}

export async function createFixedCostAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = fixedCostSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return;

  const { error } = await supabase.from("fixed_costs").insert({
    ...parsed.data,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/finance");
}

export async function deleteFixedCostAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const fixedCostId = z.string().uuid().parse(formData.get("fixed_cost_id"));

  const { error } = await supabase.from("fixed_costs").delete().eq("id", fixedCostId);

  if (error) throw new Error(error.message);

  revalidatePath("/finance");
}

async function touchProject(supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"], projectId: string) {
  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);
}

async function uploadFinanceReceipt(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  projectId: string | null,
  value: FormDataEntryValue | null,
) {
  if (!isUploadedFile(value)) return { ok: true, data: null };

  if (value.size > MAX_RECEIPT_FILE_SIZE) {
    return { ok: false, error: "el archivo supera el limite de 10 MB." };
  }

  const isPdf = value.type === "application/pdf" || value.name.toLowerCase().endsWith(".pdf");
  const isImage = value.type.startsWith("image/");
  if (!isPdf && !isImage) {
    return { ok: false, error: "el justificante tiene que ser PDF o imagen." };
  }

  const safeName = value.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const folder = projectId ?? "finanzas-varias";
  const path = `${folder}/finance-receipts/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("project-files").upload(path, value, {
    contentType: value.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    return { ok: false, error: friendlyFinanceError(error.message) };
  }

  return {
    ok: true,
    data: {
      receipt_file_name: value.name,
      receipt_file_url: path,
      receipt_file_type: value.type || "application/octet-stream",
    },
  };
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

async function attachFinanceReceipt(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  table: "project_payments" | "project_expenses",
  rowId: string,
  projectId: string | null,
  value: FormDataEntryValue | null,
): Promise<FinanceActionResult> {
  const receiptResult = await uploadFinanceReceipt(supabase, projectId, value);

  if (!receiptResult.ok) {
    return { ok: false, error: receiptResult.error };
  }

  if (!receiptResult.data) {
    return { ok: true };
  }

  const { error } = await supabase
    .from(table)
    .update(receiptResult.data)
    .eq("id", rowId);

  if (error) {
    return { ok: false, error: friendlyFinanceError(error.message) };
  }

  return { ok: true };
}

function actionError(error: string): FinanceActionResult {
  console.error("[finance-action]", error);
  return { ok: false, error };
}

function friendlyFinanceError(message: string) {
  if (message.includes("receipt_file")) {
    return "faltan las columnas del justificante en Supabase. Ejecuta las migraciones de recibos de cobros y gastos.";
  }

  if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("policy")) {
    return "Supabase ha bloqueado el permiso. Revisa que estén ejecutadas las políticas de Storage y Finanzas.";
  }

  if (message.toLowerCase().includes("not-null") && message.includes("project_id")) {
    return "Supabase aún obliga a elegir una obra. Ejecuta la migración 20260519_optional_payment_project.sql.";
  }

  return message;
}
