"use server";

import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import {
  EXPENSE_RECEIPT_SCHEMA_ERROR,
  expenseReceiptPrefix,
  expenseReceiptSchema,
} from "@/lib/expenseReceipts";

const requestSchema = expenseReceiptSchema.extend({
  expense_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
});

export async function prepareExpenseReceiptAction(input: unknown) {
  const { supabase, user } = await requireUserProfile();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: "Revisa el justificante. El limite es de 10 MB por archivo.",
    };
  const { project_id, expense_id, name, type, size } = parsed.data;
  const schema = await supabase
    .from("project_expenses")
    .select("receipt_file_name,receipt_file_url,receipt_file_type")
    .limit(0);
  if (schema.error)
    return {
      ok: false as const,
      error: schema.error.message.includes("receipt_file")
        ? EXPENSE_RECEIPT_SCHEMA_ERROR
        : "No se pudo preparar el justificante. Vuelve a intentarlo.",
    };
  if (project_id) {
    const project = await supabase
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .maybeSingle();
    if (project.error || !project.data)
      return {
        ok: false as const,
        error: "No se pudo comprobar la obra seleccionada.",
      };
  }
  const extension = type === "application/pdf" ? "pdf" : type.split("/")[1];
  const path = `${expenseReceiptPrefix(project_id, user.id, expense_id)}${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from("project-files")
    .createSignedUploadUrl(path, { upsert: false });
  if (error) {
    console.error(
      "[expense-receipt] No se pudo autorizar la subida:",
      error.message,
    );
    return {
      ok: false as const,
      error:
        "No se pudo preparar la foto o PDF. Revisa la conexion y los permisos de archivos.",
    };
  }
  return {
    ok: true as const,
    token: data.token,
    receipt: { path, name, type, size },
  };
}
