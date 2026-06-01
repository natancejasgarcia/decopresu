"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const MAX_VALIDATION_FILE_SIZE = 15 * 1024 * 1024;

const createValidationSchema = z.object({
  project_id: z.string().uuid(),
});

export async function createBudgetValidationAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = createValidationSchema.safeParse(Object.fromEntries(formData));
  const file = formData.get("file");

  if (!parsed.success) return;
  if (!isUploadedFile(file)) return;
  if (file.size > MAX_VALIDATION_FILE_SIZE) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", parsed.data.project_id)
    .single<{ name: string }>();

  if (projectError || !project) {
    console.error("[budget-validation-project]", projectError?.message ?? "Proyecto no encontrado");
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${parsed.data.project_id}/budget-validations/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    console.error("[budget-validation-upload]", uploadError.message);
    return;
  }

  const { error } = await supabase.from("budget_validations").insert({
    project_id: parsed.data.project_id,
    name: project.name,
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
  revalidatePath("/validations");
}

export async function validateBudgetAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const validationId = z.string().uuid().parse(formData.get("validation_id"));

  const { error } = await supabase
    .from("budget_validations")
    .update({
      validation_notes: null,
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
  revalidatePath("/validations");
}

export async function updateBudgetValidationNotesAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const validationId = z.string().uuid().parse(formData.get("validation_id"));
  const validationNotes = optionalNotes.parse(formData.get("validation_notes"));

  const { error } = await supabase
    .from("budget_validations")
    .update({ validation_notes: validationNotes })
    .eq("id", validationId);

  if (error) {
    console.error("[budget-validation-notes]", error.message);
    return;
  }

  revalidatePath("/dashboard");
  revalidatePath("/validations");
}

export async function updateBudgetValidationPdfAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const validationId = z.string().uuid().parse(formData.get("validation_id"));
  const oldFileUrl = z.string().min(1).optional().parse(formData.get("file_url") || undefined);
  const file = formData.get("file");

  if (!isUploadedFile(file)) return;
  if (file.size > MAX_VALIDATION_FILE_SIZE) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return;

  const { data: validation, error: validationError } = await supabase
    .from("budget_validations")
    .select("project_id")
    .eq("id", validationId)
    .single<{ project_id: string | null }>();

  if (validationError || !validation) {
    console.error("[budget-validation-pdf-load]", validationError?.message ?? "Validacion no encontrada");
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const folder = validation.project_id ?? "budget-validations";
  const path = `${folder}/budget-validations/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("project-files").upload(path, file, {
    contentType: file.type || "application/pdf",
    upsert: false,
  });

  if (uploadError) {
    console.error("[budget-validation-pdf-upload]", uploadError.message);
    return;
  }

  const { error } = await supabase
    .from("budget_validations")
    .update({
      file_name: file.name,
      file_url: path,
      file_type: file.type || "application/pdf",
      is_validated: false,
      validated_by: null,
      validated_at: null,
    })
    .eq("id", validationId);

  if (error) {
    console.error("[budget-validation-pdf-update]", error.message);
    return;
  }

  if (oldFileUrl) {
    const { error: storageError } = await supabase.storage.from("project-files").remove([oldFileUrl]);
    if (storageError) {
      console.error("[budget-validation-pdf-remove-old]", storageError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/validations");
}

export async function deleteBudgetValidationAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const validationId = z.string().uuid().parse(formData.get("validation_id"));
  const fileUrl = z.string().min(1).optional().parse(formData.get("file_url") || undefined);

  const { error } = await supabase
    .from("budget_validations")
    .delete()
    .eq("id", validationId)
    .eq("is_validated", true);

  if (error) {
    console.error("[budget-validation-delete]", error.message);
    return;
  }

  if (fileUrl) {
    const { error: storageError } = await supabase.storage.from("project-files").remove([fileUrl]);
    if (storageError) {
      console.error("[budget-validation-delete-file]", storageError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/validations");
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

const optionalNotes = z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : null), z.string().nullable());
