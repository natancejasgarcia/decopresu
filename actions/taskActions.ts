"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const taskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(2),
  due_date: z.string().trim().optional(),
});

export async function createTaskAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const parsed = taskSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase.from("project_tasks").insert({
    project_id: parsed.project_id,
    title: parsed.title,
    due_date: parsed.due_date || null,
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", parsed.project_id);

  revalidatePath(`/projects/${parsed.project_id}`);
  revalidatePath("/dashboard");
}

export async function toggleTaskAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const isDone = z.coerce.boolean().parse(formData.get("is_done"));

  const { error } = await supabase
    .from("project_tasks")
    .update({ is_done: isDone })
    .eq("id", taskId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function deleteTaskAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const projectId = z.string().uuid().parse(formData.get("project_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));

  const { error } = await supabase
    .from("project_tasks")
    .delete()
    .eq("id", taskId)
    .eq("project_id", projectId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("projects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}
