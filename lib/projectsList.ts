import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, ProjectStatus, ProjectType } from "@/lib/types";

export const PROJECTS_PAGE_SIZE = 24;
type Filters = { q: string; status: ProjectStatus | "Todos"; type: ProjectType | "Todos"; page?: string };
type QueryError = { code?: string; message: string };

async function allRows<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: QueryError | null }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await read(offset, offset + 999);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return { data: rows, error: null };
  }
}

export function projectsPageHref(filters: Omit<Filters, "page">, page: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "Todos") params.set("status", filters.status);
  if (filters.type !== "Todos") params.set("type", filters.type);
  if (page > 1) params.set("page", String(page));
  return `/projects${params.size ? `?${params}` : ""}`;
}

export async function loadProjectsList(supabase: SupabaseClient, userId: string, filters: Filters) {
  const requested = Number(filters.page ?? 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1;
  let query = supabase.from("projects").select("*", { count: "exact" }).order("last_activity_at", { ascending: false }).order("id");
  if (filters.status !== "Todos") query = query.eq("status", filters.status);
  if (filters.type !== "Todos") query = query.eq("project_type", filters.type);
  if (filters.q) {
    const term = `%${filters.q.replaceAll("%", "")}%`;
    query = query.or(`name.ilike.${term},client_name.ilike.${term},address.ilike.${term}`);
  }
  const { data, error, count } = await query.range((page - 1) * PROJECTS_PAGE_SIZE, page * PROJECTS_PAGE_SIZE - 1).returns<Project[]>();
  if (error) throw new Error(error.message);
  const projects = data ?? [];
  const total = count ?? projects.length;
  const pages = Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE));
  if (page > pages) return loadProjectsList(supabase, userId, { ...filters, page: String(pages) });
  const ids = projects.map((project) => project.id);
  const budgetTotals = new Map<string, number>();
  const unreadCounts = new Map<string, number>();
  if (!ids.length) return { projects, total, page, pages, budgetTotals, unreadCounts };

  // Scope related rows to visible cards; never fetch the text of every conversation.
  const [budgets, messages, reads] = await Promise.all([
    allRows<{ project_id: string; total: number }>((start, end) => supabase.from("budget_items").select("project_id,total").in("project_id", ids).order("id").range(start, end)),
    allRows<{ project_id: string; created_at: string }>((start, end) => supabase.from("messages").select("project_id,created_at").in("project_id", ids).neq("user_id", userId).order("id").range(start, end)),
    supabase.from("project_reads").select("project_id,last_read_at").eq("user_id", userId).in("project_id", ids).returns<{ project_id: string; last_read_at: string }[]>(),
  ]);
  const readsUnavailable = reads.error && ["42P01", "42703", "42501"].includes(reads.error.code);
  if (budgets.error || messages.error || (reads.error && !readsUnavailable)) throw new Error(budgets.error?.message ?? messages.error?.message ?? reads.error?.message);
  for (const item of budgets.data ?? []) budgetTotals.set(item.project_id, (budgetTotals.get(item.project_id) ?? 0) + Number(item.total));
  const lastRead = new Map((readsUnavailable ? [] : reads.data ?? []).map((read) => [read.project_id, new Date(read.last_read_at).getTime()]));
  for (const message of messages.data ?? []) {
    if (new Date(message.created_at).getTime() > (lastRead.get(message.project_id) ?? 0)) unreadCounts.set(message.project_id, (unreadCounts.get(message.project_id) ?? 0) + 1);
  }
  return { projects, total, page, pages, budgetTotals, unreadCounts };
}
