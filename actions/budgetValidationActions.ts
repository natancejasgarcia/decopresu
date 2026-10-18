"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { verifiedUpload, uploadMetadataSchema } from "@/lib/privateUploads";

export async function saveValidationPdf(input: unknown) {
  const { supabase, user } = await requireUserProfile();
  const parsed = uploadMetadataSchema
    .extend({
      project_id: z.string().uuid(),
      validation_id: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Revisa la obra y el PDF." };
  const value = parsed.data;
  if (
    value.type !== "application/pdf" ||
    !(await verifiedUpload(supabase, user.id, "validations", value))
  )
    return { error: "No se pudo comprobar el PDF subido." };
  const project = await supabase
    .from("projects")
    .select("name")
    .eq("id", value.project_id)
    .single();
  if (!project.data) return { error: "Obra no disponible." };
  const previous = value.validation_id
    ? await supabase
        .from("budget_validations")
        .select("file_url")
        .eq("id", value.validation_id)
        .eq("project_id", value.project_id)
        .single()
    : null;
  if (value.validation_id && !previous?.data)
    return { error: "Presupuesto no disponible." };
  const fields = {
    project_id: value.project_id,
    name: project.data.name,
    file_url: value.path,
    file_name: value.name,
    file_type: value.type,
    is_validated: false,
    validated_by: null,
    validated_at: null,
  };
  const result = value.validation_id
    ? await supabase
        .from("budget_validations")
        .update(fields)
        .eq("id", value.validation_id)
        .select("id")
        .single()
    : await supabase
        .from("budget_validations")
        .insert({ ...fields, created_by: user.id })
        .select("id")
        .single();
  if (result.error)
    return {
      error: "No se pudo guardar el PDF. Revisa los permisos de validaciones.",
    };
  if (previous?.data?.file_url)
    await supabase.storage
      .from("project-files")
      .remove([previous.data.file_url]);
  revalidatePath("/validations");
  return { ok: true };
}

export async function reviewValidation(input: unknown) {
  const { supabase, profile } = await requireUserProfile("validations");
  if (!profile.permissions_ready)
    return { error: "Falta activar la migracion de permisos en Supabase." };
  const parsed = z
    .object({
      id: z.string().uuid(),
      operation: z.enum(["approve", "notes"]),
      notes: z.string().max(4000).optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Revisa los detalles (maximo 4000 caracteres)." };
  const { error } = await supabase.rpc("review_budget_validation", {
    p_id: parsed.data.id,
    p_operation: parsed.data.operation,
    p_notes: parsed.data.notes ?? null,
  });
  if (error)
    return {
      error:
        "No se pudo guardar. Puede que este presupuesto ya se haya revisado; actualiza la pagina.",
    };
  revalidatePath("/validations");
  return { ok: true };
}

export async function deleteBudgetValidation(id: string) {
  const { supabase } = await requireUserProfile("owner");
  if (!z.string().uuid().safeParse(id).success)
    return { error: "Presupuesto no valido." };
  const { data, error } = await supabase
    .from("budget_validations")
    .delete()
    .eq("id", id)
    .eq("is_validated", true)
    .select("file_url")
    .single();
  if (error || !data) return { error: "No se pudo borrar el validado." };
  await supabase.storage.from("project-files").remove([data.file_url]);
  revalidatePath("/validations");
  return { ok: true };
}
