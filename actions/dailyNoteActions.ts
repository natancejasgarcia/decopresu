"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const noteIdSchema = z.string().uuid();
const noteTextSchema = z.string().trim().min(1).max(500);

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function createDailyNoteAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const text = noteTextSchema.parse(formData.get("text"));

  const { error } = await supabase.from("daily_notes").insert({
    text,
    note_date: todayDate(),
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}

export async function toggleDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));
  const isDone = z.enum(["true", "false"]).transform((value) => value === "true").parse(formData.get("is_done"));

  const { error } = await supabase
    .from("daily_notes")
    .update({ is_done: isDone })
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}

export async function deleteDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));

  const { error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}
