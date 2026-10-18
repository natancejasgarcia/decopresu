import { requireUserProfile } from "@/lib/auth";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, profile } = await requireUserProfile("validations");
  if (
    !profile.permissions_ready ||
    !z.string().uuid().safeParse(params.id).success
  )
    return new Response("No disponible", { status: 403 });
  const { data } = await supabase
    .from("budget_validations")
    .select("file_url,is_validated")
    .eq("id", params.id)
    .single();
  if (!data || (data.is_validated && profile.access_role !== "owner"))
    return new Response("No disponible", { status: 404 });
  const file = await supabase.storage
    .from("project-files")
    .download(data.file_url);
  if (!file.data)
    return new Response("No se pudo abrir el PDF", { status: 404 });
  return new Response(file.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=presupuesto.pdf",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
