"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { EXPENSE_CATEGORIES, FIXED_COST_FREQUENCIES, PAYMENT_METHODS } from "@/lib/types";

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

export async function createExpenseAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = expenseSchema.safeParse({
    ...Object.fromEntries(formData),
    expense_date: formData.get("expense_date") || currentDateValue(),
  });

  if (!parsed.success) return;

  const { data: expense, error } = await supabase.from("project_expenses").insert({
    ...parsed.data,
    created_by: user.id,
  }).select("id, project_id").single<{ id: string; project_id: string | null }>();

  if (error) throw new Error(error.message);

  const receiptResult = await attachFinanceReceipt(supabase, "project_expenses", expense.id, parsed.data.project_id, formData.get("receipt"));

  if (!receiptResult.ok) {
    throw new Error(`El gasto se guardo, pero el adjunto no: ${receiptResult.error}`);
  }

  if (parsed.data.project_id) {
    await touchProject(supabase, parsed.data.project_id);
    revalidatePath(`/projects/${parsed.data.project_id}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/finance");
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
