"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUserProfile } from "@/lib/auth";

const noteIdSchema = z.string().uuid();
const noteTextSchema = z.string().trim().min(1).max(2000);
const noteDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const projectIdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid().nullable(),
);

const MAX_NOTE_PHOTO_SIZE = 10 * 1024 * 1024;
const NOTE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"]);

export async function createDailyNoteAction(formData: FormData) {
  const { supabase, user } = await requireUserProfile();
  const text = noteTextSchema.parse(formData.get("text"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));
  const projectId = projectIdSchema.parse(formData.get("project_id"));
  const photos = formData
    .getAll("photos")
    .filter((value): value is File => value instanceof File && value.size > 0);

  for (const photo of photos) {
    if (!NOTE_PHOTO_TYPES.has(photo.type)) {
      throw new Error("Solo se pueden subir fotos en las notas.");
    }

    if (photo.size > MAX_NOTE_PHOTO_SIZE) {
      throw new Error("Cada foto de una nota debe pesar menos de 10 MB.");
    }
  }

  const { data: note, error } = await supabase
    .from("daily_notes")
    .insert({
      text,
      note_date: noteDate,
      project_id: projectId,
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (photos.length > 0) {
    const fileRows = [];

    for (const photo of photos) {
      const filePath = `daily-notes/${noteDate}/${note.id}/${crypto.randomUUID()}-${sanitizeFileName(photo.name)}`;
      const { error: uploadError } = await supabase.storage.from("project-files").upload(filePath, photo, {
        contentType: photo.type,
        upsert: false,
      });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      fileRows.push({
        note_id: note.id,
        uploaded_by: user.id,
        file_name: photo.name,
        file_url: filePath,
        file_type: photo.type,
      });
    }

    const { error: filesError } = await supabase.from("daily_note_files").insert(fileRows);

    if (filesError) {
      await supabase.storage.from("project-files").remove(fileRows.map((file) => file.file_url));
      throw new Error(filesError.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  return { ok: true };
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

export async function updateDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));
  const text = noteTextSchema.parse(formData.get("text"));
  const projectId = projectIdSchema.parse(formData.get("project_id"));

  const { error } = await supabase
    .from("daily_notes")
    .update({
      text,
      project_id: projectId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  return { ok: true };
}

export async function deleteDailyNoteAction(formData: FormData) {
  const { supabase } = await requireUserProfile();
  const noteId = noteIdSchema.parse(formData.get("note_id"));
  const noteDate = noteDateSchema.parse(formData.get("note_date"));

  const { data: files } = await supabase
    .from("daily_note_files")
    .select("file_url")
    .eq("note_id", noteId)
    .returns<{ file_url: string }[]>();

  const { error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("id", noteId);

  if (error) {
    throw new Error(error.message);
  }

  if (files && files.length > 0) {
    await supabase.storage.from("project-files").remove(files.map((file) => file.file_url));
  }

  revalidatePath("/dashboard");
  revalidatePath("/notes");
  redirect(`/notes?date=${noteDate}`);
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
}
