import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyNotesPanel } from "@/components/DailyNotesPanel";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import type { DailyNote, Profile } from "@/lib/types";

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
  ]);

  const dailyNotesUnavailable = isOptionalNotesError(dailyNotesError);
  const recentNotesUnavailable = isOptionalNotesError(recentNotesError);

  if (profilesError || (!dailyNotesUnavailable && dailyNotesError) || (!recentNotesUnavailable && recentNotesError)) {
    throw new Error(profilesError?.message ?? dailyNotesError?.message ?? recentNotesError?.message);
  }

  const profileNames = new Map((profiles ?? []).map((item) => [item.user_id, item.name]));
  const enrichedDailyNotes = (dailyNotesUnavailable ? [] : dailyNotes ?? []).map((note) => ({
    ...note,
    author_name: profileNames.get(note.created_by) ?? "Decoralia",
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
        <DailyNotesPanel notes={enrichedDailyNotes} selectedDate={selectedDate} availableDates={availableDates} />
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
