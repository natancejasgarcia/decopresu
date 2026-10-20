import type { SupabaseClient } from "@supabase/supabase-js";

export async function signProjectFileUrls(supabase: SupabaseClient, filePaths: Array<string | null | undefined>) {
  const paths = [...new Set(filePaths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data, error } = await supabase.storage.from("project-files").createSignedUrls(paths, 60 * 60);
  if (error) console.error("[Decoralia project attachments]", error.message);
  for (const file of data ?? []) {
    if (file.path && file.signedUrl) urls.set(file.path, file.signedUrl);
  }
  return urls;
}
