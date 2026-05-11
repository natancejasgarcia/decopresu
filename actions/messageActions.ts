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
  const now = new Date().toISOString();

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
    .update({ last_activity_at: now })
    .eq("id", parsed.project_id);

  const { error: readError } = await supabase.from("project_reads").upsert(
    {
      project_id: parsed.project_id,
      user_id: user.id,
      last_read_at: now,
    },
    { onConflict: "project_id,user_id" },
  );

  if (readError) {
    throw new Error(readError.message);
  }

  revalidatePath(`/projects/${parsed.project_id}`);
  revalidatePath("/dashboard");
}

export async function markProjectReadAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));

  const { error } = await supabase.from("project_reads").upsert(
    {
      project_id: projectId,
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}
