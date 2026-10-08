"use server";

import { requireUserProfile } from "@/lib/auth";
import { briefingSceneSchema, isBriefingUnavailable } from "@/lib/briefing";
import type { BriefingSnapshot } from "@/lib/briefing";

export async function readBriefingAction(knownVersion?: number) {
  const { supabase } = await requireUserProfile();
  if (Number.isInteger(knownVersion)) {
    const metadata = await supabase
      .from("briefing_boards")
      .select("version")
      .eq("id", "shared")
      .single();
    if (!metadata.error && metadata.data.version === knownVersion)
      return { unchanged: true };
  }
  const { data, error } = await supabase
    .from("briefing_boards")
    .select("scene,version,updated_at,updated_by")
    .eq("id", "shared")
    .single();
  if (error)
    return {
      error: isBriefingUnavailable(error)
        ? "Falta activar la pizarra en Supabase."
        : "No se pudo consultar la pizarra. Reintenta en unos segundos.",
    };
  return { board: data as BriefingSnapshot };
}

export async function saveBriefingAction(version: number, input: unknown) {
  const { supabase } = await requireUserProfile();
  const parsed = briefingSceneSchema.safeParse(input);
  if (!Number.isInteger(version) || version < 0 || !parsed.success) {
    return {
      error: parsed.success
        ? "Version no valida."
        : (parsed.error.issues[0]?.message ?? "Pizarra no valida."),
    };
  }
  const { data, error } = await supabase.rpc("save_briefing_board", {
    p_expected_version: version,
    p_scene: parsed.data,
  });
  if (error)
    return {
      error: isBriefingUnavailable(error)
        ? "Falta activar la pizarra en Supabase."
        : "No se guardo. Conserva esta pantalla y vuelve a intentarlo.",
    };
  return data as { ok: boolean; board: BriefingSnapshot };
}
