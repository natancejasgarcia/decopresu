"use server";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";
import { uploadMetadataSchema } from "@/lib/privateUploads";
export async function preparePrivateUpload(input: unknown) {
  const { supabase, user, profile } = await requireUserProfile("uploads");
  const parsed = uploadMetadataSchema
    .omit({ path: true })
    .extend({ folder: z.enum(["validations", "finance-scans"]) })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Usa JPG, PNG, WebP o PDF de hasta 10 MB." };
  const file = parsed.data;
  if (profile.access_role === "reviewer") {
    if (file.folder !== "finance-scans")
      return { error: "Solo puedes subir facturas." };
    const ready = await supabase.rpc("reviewer_invoice_uploads_ready");
    if (!profile.permissions_ready || ready.error || ready.data !== true)
      return {
        error: "Falta activar los permisos para subir facturas en Supabase.",
      };
  }
  if (file.folder === "finance-scans" && file.type === "application/pdf")
    return { error: "El escaner admite fotos JPG, PNG o WebP." };
  const extension =
    file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const path = `${file.folder}/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from("project-files")
    .createSignedUploadUrl(path, { upsert: false });
  if (error) return { error: "No se pudo preparar la subida." };
  return {
    token: data.token,
    file: { path, name: file.name, size: file.size, type: file.type },
  };
}
