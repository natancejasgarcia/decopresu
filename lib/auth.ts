import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import type { Profile } from "@/lib/types";

const AUTO_AUTHORIZED_PROFILES: Record<string, { name: string; role: Profile["role"] }> = {
  "decoralia1977@gmail.com": { name: "Decoralia", role: "admin" },
};

export async function requireUserProfile() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single<Profile>();

  if (!profile) {
    const autoAuthorizedProfile = await createAutoAuthorizedProfile(user);
    if (!autoAuthorizedProfile) {
      redirect("/login?error=unauthorized");
    }

    return { supabase, user, profile: autoAuthorizedProfile };
  }

  return { supabase, user, profile };
}

async function createAutoAuthorizedProfile(user: User) {
  const email = user.email?.toLowerCase();
  const authorizedProfile = email ? AUTO_AUTHORIZED_PROFILES[email] : null;

  if (!authorizedProfile) {
    return null;
  }

  const { data: sessionProfile, error: sessionError } = await createServerSupabaseClient()
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        name: authorizedProfile.name,
        role: authorizedProfile.role,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single<Profile>();

  if (!sessionError && sessionProfile) {
    return sessionProfile;
  }

  try {
    const serviceSupabase = createServiceSupabaseClient();
    const { data, error } = await serviceSupabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          name: authorizedProfile.name,
          role: authorizedProfile.role,
        },
        { onConflict: "user_id" },
      )
      .select("*")
      .single<Profile>();

    if (error) {
      console.error("[Decoralia auth] No se pudo crear el perfil autorizado:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("[Decoralia auth] Error creando perfil autorizado:", error);
    return null;
  }
}
