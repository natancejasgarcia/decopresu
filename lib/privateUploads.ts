import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
export const uploadMetadataSchema = z.object({
  path: z.string().max(500),
  name: z.string().min(1).max(200),
  type: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});
export type UploadMetadata = z.infer<typeof uploadMetadataSchema>;
export async function verifiedUpload(
  client: SupabaseClient,
  user: string,
  folder: "validations" | "finance-scans",
  file: UploadMetadata,
) {
  if (!file.path.startsWith(`${folder}/${user}/`) || file.path.includes(".."))
    return false;
  const { data, error } = await client.storage
    .from("project-files")
    .info(file.path);
  const metadata = data?.metadata as
    { size?: number; mimetype?: string } | undefined;
  return (
    !error &&
    Number(data?.size ?? metadata?.size) === file.size &&
    (data?.contentType ?? metadata?.mimetype) === file.type
  );
}
