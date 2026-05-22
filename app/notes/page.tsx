import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DailyNotesPanel } from "@/components/DailyNotesPanel";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import type { DailyNote, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const { supabase, profile } = await requireUserProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: dailyNotes, error: dailyNotesError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("daily_notes")
      .select("*")
      .eq("note_date", today)
      .order("is_done", { ascending: true })
      .order("created_at", { ascending: false })
      .returns<DailyNote[]>(),
    supabase.from("profiles").select("*").returns<Profile[]>(),
  ]);

  const dailyNotesUnavailable = isOptionalNotesError(dailyNotesError);

  if (profilesError || (!dailyNotesUnavailable && dailyNotesError)) {
    throw new Error(profilesError?.message ?? dailyNotesError?.message);
  }

  const profileNames = new Map((profiles ?? []).map((item) => [item.user_id, item.name]));
  const enrichedDailyNotes = (dailyNotesUnavailable ? [] : dailyNotes ?? []).map((note) => ({
    ...note,
    author_name: profileNames.get(note.created_by) ?? "Decoralia",
  }));

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-4xl px-4 py-5">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-black text-moss">
          <ArrowLeft size={17} />
          Inicio
        </Link>
        <DailyNotesPanel notes={enrichedDailyNotes} />
      </div>
    </main>
  );
}

function isOptionalNotesError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}
