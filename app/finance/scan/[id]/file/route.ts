import { requireUserProfile } from "@/lib/auth";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, profile, user } = await requireUserProfile("uploads");
  if (profile.access_role === "reviewer" && !profile.permissions_ready)
    return new Response("No disponible", { status: 403 });
  if (!z.string().uuid().safeParse(params.id).success)
    return new Response("No disponible", { status: 404 });
  let query = supabase
    .from("finance_documents")
    .select("file_path,file_type")
    .eq("id", params.id);
  if (profile.access_role === "reviewer")
    query = query.eq("created_by", user.id).eq("status", "draft");
  const { data } = await query.single();
  if (
    !data ||
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      data.file_type,
    )
  )
    return new Response("No disponible", { status: 404 });
  const file = await supabase.storage
    .from("project-files")
    .download(data.file_path);
  return file.data
    ? new Response(file.data, {
        headers: {
          "Content-Type": data.file_type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    : new Response("No disponible", { status: 404 });
}
