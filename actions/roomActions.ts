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
  notes: z.string().trim().optional(),
});

export async function createRoomAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const parsed = roomSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("rooms").insert({
    ...parsed,
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
