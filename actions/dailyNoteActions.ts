"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const noteIdSchema = z.string().uuid();
const noteTextSchema = z.string().trim().min(1).max(2000);
const noteDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function createDailyNoteAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const text = noteTextSchema.parse(formData.get("text"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));

  const { error } = await supabase.from("daily_notes").insert({
    text,
    note_date: noteDate,
    created_by: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  redirect(`/notes?date=${noteDate}`);
}

export async function toggleDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));
  const isDone = z.enum(["true", "false"]).transform((value) => value === "true").parse(formData.get("is_done"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));

  const { error } = await supabase
    .from("daily_notes")
    .update({ is_done: isDone })
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  redirect(`/notes?date=${noteDate}`);
}

export async function deleteDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));

  const { error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  redirect(`/notes?date=${noteDate}`);
}
