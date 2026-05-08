"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { PROJECT_STATUSES } from "@/lib/types";

const projectSchema = z.object({
  name: z.string().trim().min(2, "El proyecto necesita un nombre."),
  client_name: z.string().trim().min(2, "Indica el nombre del cliente."),
  client_phone: z.string().trim().min(6, "Indica un telefono valido."),
  client_email: z.string().trim().email().optional().or(z.literal("")),
  address: z.string().trim().min(3, "Indica la direccion."),
  description: z.string().trim().min(3, "Describe el trabajo."),
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
  internal_notes: z.string().trim().optional(),
});

export async function createProjectAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      client_email: parsed.data.client_email || null,
      internal_notes: parsed.data.internal_notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear el proyecto.");
  }

  revalidatePath("/dashboard");
  redirect(`/projects/${data.id}`);
}

export async function updateProjectStatusAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const status = z.enum(PROJECT_STATUSES as [string, ...string[]]).parse(formData.get("status"));

  const { error } = await supabase
    .from("projects")
    .update({ status, last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}
