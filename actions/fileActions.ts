"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function uploadProjectFileAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecciona un archivo.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("El archivo supera el limite de 15 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error } = await supabase.from("project_files").insert({
    project_id: projectId,
    uploaded_by: user.id,
    file_name: file.name,
    file_url: path,
    file_type: file.type || "application/octet-stream",
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
}
