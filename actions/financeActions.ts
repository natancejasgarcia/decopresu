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

export async function createExpenseAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = expenseSchema.safeParse({
    ...Object.fromEntries(formData),
    expense_date: formData.get("expense_date") || currentDateValue(),
  });

  if (!parsed.success) return;

  const { error } = await supabase.from("project_expenses").insert({
    ...parsed.data,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

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

  const { error } = await supabase.from("project_expenses").delete().eq("id", expenseId);

  if (error) throw new Error(error.message);

  if (projectId) {
    await touchProject(supabase, projectId);
    revalidatePath(`/projects/${projectId}`);
  }

  revalidatePath("/finance");
}

export async function createPaymentAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = paymentSchema.safeParse({
    ...Object.fromEntries(formData),
    payment_date: formData.get("payment_date") || currentDateValue(),
  });

  if (!parsed.success) return;
  const receiptData = await uploadPaymentReceipt(supabase, parsed.data.project_id, formData.get("receipt"));

  const { error } = await supabase.from("project_payments").insert({
    ...parsed.data,
    ...receiptData,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  if (parsed.data.project_id) {
    await touchProject(supabase, parsed.data.project_id);
    revalidatePath(`/projects/${parsed.data.project_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/finance");
}

export async function updatePaymentAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const paymentId = z.string().uuid().parse(formData.get("payment_id"));
  const parsed = paymentSchema.safeParse({
    ...Object.fromEntries(formData),
    payment_date: formData.get("payment_date") || currentDateValue(),
  });

  if (!parsed.success) return;
  const receiptData = await uploadPaymentReceipt(supabase, parsed.data.project_id, formData.get("receipt"));

  const { error } = await supabase
    .from("project_payments")
    .update({
      amount: parsed.data.amount,
      payment_date: parsed.data.payment_date,
      method: parsed.data.method,
      notes: parsed.data.notes,
      ...receiptData,
    })
    .eq("id", paymentId);

  if (error) throw new Error(error.message);

  if (parsed.data.project_id) {
    await touchProject(supabase, parsed.data.project_id);
    revalidatePath(`/projects/${parsed.data.project_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/finance");
}

export async function deletePaymentAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const paymentId = z.string().uuid().parse(formData.get("payment_id"));
  const projectId = optionalUuid.parse(formData.get("project_id"));

  const { error } = await supabase.from("project_payments").delete().eq("id", paymentId);

  if (error) throw new Error(error.message);

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

async function uploadPaymentReceipt(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  projectId: string | null,
  value: FormDataEntryValue | null,
) {
  if (!isUploadedFile(value)) return {};

  if (value.size > MAX_RECEIPT_FILE_SIZE) {
    throw new Error("El PDF supera el limite de 10 MB.");
  }

  if (value.type !== "application/pdf" && !value.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("El justificante tiene que ser un PDF.");
  }

  const safeName = value.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const folder = projectId ?? "cobros-varios";
  const path = `${folder}/payments/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("project-files").upload(path, value, {
    contentType: value.type || "application/pdf",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    receipt_file_name: value.name,
    receipt_file_url: path,
    receipt_file_type: value.type || "application/pdf",
  };
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}
