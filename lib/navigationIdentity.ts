import type { SupabaseClient } from "@supabase/supabase-js";

export async function navigationUser(auth: SupabaseClient["auth"]) {
  try {
    if (typeof auth.getClaims === "function") {
      const { data, error } = await auth.getClaims();
      if (error || typeof data?.claims.sub !== "string") return null;
      return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : undefined };
    }
    // Compatibility with older SDKs: never trust an unverified session cookie.
    const { data, error } = await auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}
