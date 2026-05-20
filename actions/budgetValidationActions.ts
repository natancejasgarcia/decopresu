"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const MAX_VALIDATION_FILE_SIZE = 15 * 1024 * 1024;

const createValidationSchema = z.object({
  name: z.string().trim().min(2),
});

export async function createBudgetValidationAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = createValidationSchema.safeParse(Object.fromEntries(formData));
  const file = formData.get("file");

  if (!parsed.success) return;
  if (!isUploadedFile(file)) return;
  if (file.size > MAX_VALIDATION_FILE_SIZE) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `budget-validations/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    console.error("[budget-validation-upload]", uploadError.message);
    return;
  }

  const { error } = await supabase.from("budget_validations").insert({
    name: parsed.data.name,
    file_name: file.name,
    file_url: path,
    file_type: file.type || "application/pdf",
    created_by: user.id,
  });

  if (error) {
    console.error("[budget-validation-create]", error.message);
    return;
  }

  revalidatePath("/dashboard");
}

export async function validateBudgetAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const validationId = z.string().uuid().parse(formData.get("validation_id"));

  const { error } = await supabase
    .from("budget_validations")
    .update({
      is_validated: true,
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    })
    .eq("id", validationId);

  if (error) {
    console.error("[budget-validation-ok]", error.message);
    return;
  }

  revalidatePath("/dashboard");
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}
