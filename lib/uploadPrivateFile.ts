"use client";
import { preparePrivateUpload } from "@/actions/privateUploadActions";
import { createBrowserSupabaseClient } from "@/lib/supabaseClient";
export async function uploadPrivateFile(
  file: File,
  folder: "validations" | "finance-scans",
) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferred = (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      pdf: "application/pdf",
    } as Record<string, string>
  )[extension ?? ""];
  const prepared = await preparePrivateUpload({
    name: file.name,
    size: file.size,
    type: file.type || inferred,
    folder,
  });
  if ("error" in prepared) throw new Error(prepared.error);
  const { error } = await createBrowserSupabaseClient()
    .storage.from("project-files")
    .uploadToSignedUrl(prepared.file.path, prepared.token, file, {
      contentType: prepared.file.type,
    });
  if (error)
    throw new Error("No se pudo subir el archivo. Intentalo otra vez.");
  return prepared.file;
}
