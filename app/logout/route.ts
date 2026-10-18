import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  redirect(error ? `/login?error=${encodeURIComponent(error)}` : "/login");
}
