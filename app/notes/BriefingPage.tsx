import Link from "next/link";
import { ArrowLeft, CalendarDays, PenTool } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { BriefingBoard } from "@/components/BriefingBoard";
import { requireUserProfile } from "@/lib/auth";
import { EMPTY_BRIEFING, isBriefingUnavailable } from "@/lib/briefing";
import type { BriefingSnapshot, BriefingProject } from "@/lib/briefing";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function BriefingPage() {
  const { supabase, profile } = await requireUserProfile();
  const [boardResult, projectResult, budgetResult] = await Promise.all([
    supabase
      .from("briefing_boards")
      .select("scene,version,updated_at,updated_by")
      .eq("id", "shared")
      .single(),
    supabase
      .from("projects")
      .select("id,name,client_name,status")
      .order("last_activity_at", { ascending: false }),
    loadBudgetTotals(supabase),
  ]);
  if (
    projectResult.error ||
    budgetResult.error ||
    (boardResult.error && !isBriefingUnavailable(boardResult.error))
  ) {
    throw new Error("No se pudo cargar la pizarra. Vuelve a intentarlo.");
  }
  const totals = new Map<string, number>();
  for (const item of budgetResult.data ?? [])
    totals.set(
      item.project_id,
      (totals.get(item.project_id) ?? 0) + Number(item.total ?? 0),
    );
  const projects: BriefingProject[] = (projectResult.data ?? []).map((p) => ({
    ...p,
    total: totals.get(p.id) ?? 0,
  }));
  const initial: BriefingSnapshot = boardResult.data ?? {
    scene: EMPTY_BRIEFING,
    version: 0,
    updated_at: "",
    updated_by: null,
  };
  return (
    <main className="briefing-page">
      <TopBar profile={profile} />
      <nav className="briefing-tabs" aria-label="Notas">
        <Link href="/dashboard" title="Inicio" aria-label="Inicio">
          <ArrowLeft size={21} />
        </Link>
        <Link href="/notes" aria-current="page">
          <PenTool size={18} /> Pizarra
        </Link>
        <Link href="/notes?view=history">
          <CalendarDays size={18} /> Apuntes por dia
        </Link>
      </nav>
      <BriefingBoard
        initial={initial}
        projects={projects}
        available={!boardResult.error}
        userId={profile.user_id}
      />
    </main>
  );
}

async function loadBudgetTotals(supabase: SupabaseClient) {
  const data: { project_id: string; total: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase
      .from("budget_items")
      .select("project_id,total")
      .order("id")
      .range(offset, offset + 999)
      .returns<{ project_id: string; total: number }[]>();
    if (result.error) return { data: null, error: result.error };
    data.push(...result.data);
    if (result.data.length < 1000) return { data, error: null };
  }
}
