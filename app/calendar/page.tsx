import { TopBar } from "@/components/TopBar";
import {
  ProjectCalendar,
  type CalendarProject,
} from "@/components/ProjectCalendar";
import { requireUserProfile } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function CalendarPage() {
  const { supabase, profile } = await requireUserProfile();
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,client_name,address,status,project_type,created_at")
    .order("created_at")
    .returns<CalendarProject[]>();
  if (error) throw new Error("No se pudo cargar la agenda.");
  return (
    <main>
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-3xl font-bold">Agenda de obras</h1>
        <ProjectCalendar
          projects={data ?? []}
          initialYear={new Date().getFullYear()}
          initialMonth={new Date().getMonth()}
        />
      </div>
    </main>
  );
}
