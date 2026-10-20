import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  createServerSupabaseClient,
  createServiceSupabaseClient,
} from "@/lib/supabaseServer";
import type { Profile } from "@/lib/types";
import { fallbackAccess } from "@/lib/access";

const AUTO_AUTHORIZED_PROFILES: Record<
  string,
  { name: string; role: Profile["role"] }
> = {
  "decoralia1977@gmail.com": { name: "Decoralia", role: "member" },
};

export async function requireUserProfile(
  access:
    | "workspace"
    | "validations"
    | "owner"
    | "dashboard"
    | "uploads" = "workspace",
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, accessResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single<Profile>(),
    supabase.rpc("app_access_role"),
  ]);

  if (!profile) {
    const autoAuthorizedProfile = await createAutoAuthorizedProfile(user);
    if (!autoAuthorizedProfile) {
      redirect("/logout?error=unauthorized");
    }

    return authorize(autoAuthorizedProfile, await supabase.rpc("app_access_role"));
  }

  return authorize(profile);

  async function authorize(value: Profile, resolvedAccess = accessResult) {
    const { data, error } = resolvedAccess;
    const ready = !error && ["owner", "workspace", "reviewer"].includes(data);
    const role = ready
      ? (data as import("@/lib/access").AccessRole)
      : fallbackAccess(user!.email, value.role);
    if (
      role === "reviewer" &&
      !["validations", "dashboard", "uploads"].includes(access)
    )
      redirect("/dashboard");
    if (access === "owner" && role !== "owner") redirect("/validations");
    return {
      supabase,
      user: user!,
      profile: { ...value, access_role: role, permissions_ready: ready },
    };
  }
}

async function createAutoAuthorizedProfile(user: User) {
  const email = user.email?.toLowerCase();
  const authorizedProfile = email ? AUTO_AUTHORIZED_PROFILES[email] : null;

  if (!authorizedProfile) {
    return null;
  }

  const { data: sessionProfile, error: sessionError } =
    await createServerSupabaseClient()
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
      console.error(
        "[Decoralia auth] No se pudo crear el perfil autorizado:",
        error.message,
      );
      return null;
    }

    return data;
  } catch (error) {
    console.error("[Decoralia auth] Error creando perfil autorizado:", error);
    return null;
  }
}
