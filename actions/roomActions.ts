"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const roomSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().trim().min(2),
  length: z.coerce.number().positive(),
  width: z.coerce.number().positive(),
  height: z.coerce.number().positive(),
  openings_area: z.coerce.number().min(0).default(0),
  paint_scope: z.enum(["walls_and_ceiling", "ceiling_only"]).default("walls_and_ceiling"),
  unit_price: z.coerce.number().min(0).default(6),
  notes: z.string().trim().optional(),
});

export async function createRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = roomSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("rooms").insert({
    ...parsed,
    openings_area: parsed.paint_scope === "ceiling_only" ? 0 : parsed.openings_area,
    notes: parsed.notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function updateRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const roomId = z.string().uuid().parse(formData.get("room_id"));
  const parsed = roomSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("rooms")
    .update({
      ...parsed,
      openings_area: parsed.paint_scope === "ceiling_only" ? 0 : parsed.openings_area,
      notes: parsed.notes || null,
    })
    .eq("id", roomId)
    .eq("project_id", parsed.project_id);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
}

export async function deleteRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const roomId = z.string().uuid().parse(formData.get("room_id"));

  const { error } = await supabase
    .from("rooms")
    .delete()
    .eq("id", roomId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
}
