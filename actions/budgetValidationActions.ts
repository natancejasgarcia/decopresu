"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { verifiedUpload, uploadMetadataSchema } from "@/lib/privateUploads";
import { randomUUID } from "node:crypto";
import { buildBudgetPdf } from "@/lib/budgetPdf";
import { loadProjectBudget } from "@/lib/projectBudgetData";

export async function sendProjectBudgetToValidation(input: unknown) {
  const { supabase, user, profile } = await requireUserProfile();
  if (!profile.permissions_ready)
    return { error: "Falta activar los permisos de validaciones en Supabase." };
  const parsed = z
    .object({ project_id: z.string().uuid(), request_id: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success)
    return { error: "No se pudo identificar la obra. Actualiza la pagina." };
  const { project_id: projectId, request_id: requestId } = parsed.data;
  const storage = supabase.storage.from("project-files");
  let uploadedPath: string | undefined;
  let saved = false;
  const refresh = () => {
    revalidatePath("/validations");
    revalidatePath("/projects");
    revalidatePath("/dashboard");
  };
  try {
    const existing = await supabase
      .from("budget_validations")
      .select("id")
      .eq("id", requestId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (existing.error)
      return { error: "No se pudo comprobar el envio. Intentalo de nuevo." };
    if (existing.data) {
      refresh();
      return { ok: true, id: existing.data.id as string };
    }
    const budget = await loadProjectBudget(supabase, projectId);
    if ("error" in budget) return { error: budget.error };
    if (!budget.items.length)
      return {
        error: "Anade conceptos al presupuesto antes de enviarlo a validar.",
      };
    const pending = await supabase
      .from("budget_validations")
      .select("id,file_url")
      .eq("project_id", projectId)
      .eq("is_validated", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending.error)
      return { error: "No se pudo comprobar las validaciones pendientes." };

    const { bytes, filename } = await buildBudgetPdf(budget);
    if (bytes.length > 10 * 1024 * 1024)
      return { error: "El PDF supera el limite de 10 MB." };
    const filePath = `validations/${user.id}/${randomUUID()}.pdf`;
    const upload = await storage.upload(filePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error)
      return { error: "No se pudo subir el PDF. Intentalo de nuevo." };
    uploadedPath = filePath;
    const fields = {
      project_id: projectId,
      name: budget.project.name,
      file_url: filePath,
      file_name: filename,
      file_type: "application/pdf",
      is_validated: false,
      validated_by: null,
      validated_at: null,
    };
    // Never replace a PDF that another user has approved while it was being generated.
    const result = pending.data
      ? await supabase
          .from("budget_validations")
          .update(fields)
          .eq("id", pending.data.id)
          .eq("project_id", projectId)
          .eq("is_validated", false)
          .select("id")
          .single()
      : await supabase
          .from("budget_validations")
          .insert({ ...fields, id: requestId, created_by: user.id })
          .select("id")
          .single();
    if (result.error || !result.data) {
      if (result.error?.code === "23505") {
        const retry = await supabase
          .from("budget_validations")
          .select("id")
          .eq("id", requestId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (retry.data) {
          refresh();
          return { ok: true, id: retry.data.id as string };
        }
      }
      return {
        error:
          "No se pudo guardar el envio. Actualiza la pagina e intentalo de nuevo.",
      };
    }
    saved = true;
    if (pending.data?.file_url) {
      await storage.remove([pending.data.file_url]).catch(() => undefined);
    }
    refresh();
    return { ok: true, id: result.data.id as string };
  } catch (error) {
    console.error(
      "[Decoralia validaciones] Error enviando presupuesto:",
      error,
    );
    return { error: "No se pudo enviar el presupuesto. Intentalo de nuevo." };
  } finally {
    if (uploadedPath && !saved)
      await storage.remove([uploadedPath]).catch(() => undefined);
  }
}

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
