import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyNotesPanel } from "@/components/DailyNotesPanel";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import type { DailyNote, DailyNoteFile, Profile, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

type NotesPageProps = {
  searchParams?: {
    date?: string;
  };
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const { supabase, profile } = await requireUserProfile();
  const selectedDate = getSelectedDate(searchParams?.date);

  const [
    { data: dailyNotes, error: dailyNotesError },
    { data: recentNotes, error: recentNotesError },
    { data: profiles, error: profilesError },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    supabase
      .from("daily_notes")
      .select("*")
      .eq("note_date", selectedDate)
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<DailyNote[]>(),
    supabase
      .from("daily_notes")
      .select("note_date")
      .order("note_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(80)
      .returns<Pick<DailyNote, "note_date">[]>(),
    supabase.from("profiles").select("*").returns<Profile[]>(),
    supabase
      .from("projects")
      .select("id,name,client_name")
      .order("last_activity_at", { ascending: false })
      .returns<Pick<Project, "id" | "name" | "client_name">[]>(),
  ]);

  const dailyNotesUnavailable = isOptionalNotesError(dailyNotesError);
  const recentNotesUnavailable = isOptionalNotesError(recentNotesError);

  if (profilesError || projectsError || (!dailyNotesUnavailable && dailyNotesError) || (!recentNotesUnavailable && recentNotesError)) {
    throw new Error(profilesError?.message ?? projectsError?.message ?? dailyNotesError?.message ?? recentNotesError?.message);
  }

  const baseNotes = dailyNotesUnavailable ? [] : dailyNotes ?? [];
  const noteIds = baseNotes.map((note) => note.id);
  const { data: noteFiles, error: noteFilesError } = noteIds.length
    ? await supabase
        .from("daily_note_files")
        .select("*")
        .in("note_id", noteIds)
        .order("created_at", { ascending: true })
        .returns<DailyNoteFile[]>()
    : { data: [] as DailyNoteFile[], error: null };
  const noteFilesUnavailable = isOptionalNotesError(noteFilesError);

  if (!noteFilesUnavailable && noteFilesError) {
    throw new Error(noteFilesError.message);
  }

  const signedFiles = await Promise.all(
    (noteFilesUnavailable ? [] : noteFiles ?? []).map(async (file) => {
      const { data } = await supabase.storage.from("project-files").createSignedUrl(file.file_url, 60 * 60);
      return { ...file, signed_url: data?.signedUrl };
    }),
  );

  const profileNames = new Map((profiles ?? []).map((item) => [item.user_id, item.name]));
  const projectsById = new Map((projects ?? []).map((project) => [project.id, project]));
  const filesByNote = new Map<string, DailyNoteFile[]>();

  for (const file of signedFiles) {
    const files = filesByNote.get(file.note_id) ?? [];
    files.push(file);
    filesByNote.set(file.note_id, files);
  }

  const enrichedDailyNotes = baseNotes.map((note) => ({
    ...note,
    author_name: profileNames.get(note.created_by) ?? "Decoralia",
    project_name: note.project_id ? projectsById.get(note.project_id)?.name : undefined,
    project_client_name: note.project_id ? projectsById.get(note.project_id)?.client_name : undefined,
    files: filesByNote.get(note.id) ?? [],
  }));
  const availableDates = [...new Set((recentNotesUnavailable ? [] : recentNotes ?? []).map((note) => note.note_date))];

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-4xl px-4 py-5">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Inicio
        </Link>
        <DailyNotesPanel
          notes={enrichedDailyNotes}
          selectedDate={selectedDate}
          availableDates={availableDates}
          projects={projects ?? []}
        />
      </div>
    </main>
  );
}

function getSelectedDate(date?: string) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date().toISOString().slice(0, 10);
}

function isOptionalNotesError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}
