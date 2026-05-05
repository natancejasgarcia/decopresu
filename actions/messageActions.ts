"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const messageSchema = z.object({
  project_id: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

export async function sendMessageAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = messageSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("messages").insert({
    project_id: parsed.project_id,
    user_id: user.id,
    text: parsed.text,
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
