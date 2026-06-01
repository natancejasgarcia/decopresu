"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function uploadProjectFileAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length === 0) {
    throw new Error("Selecciona al menos un archivo.");
  }

  const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);
  if (oversizedFile) {
    throw new Error(`${oversizedFile.name} supera el limite de 15 MB.`);
  }

  const uploadedRows = [];

  for (const file of files) {
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

    uploadedRows.push({
      project_id: projectId,
      uploaded_by: user.id,
      file_name: file.name,
      file_url: path,
      file_type: file.type || "application/octet-stream",
    });
  }

  const { error } = await supabase.from("project_files").insert(uploadedRows);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
}
