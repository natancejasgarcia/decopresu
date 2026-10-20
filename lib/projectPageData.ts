import type { SupabaseClient } from "@supabase/supabase-js";
import { sortBudgetItems } from "@/lib/budget";
import { buildBudgetConceptCatalog, type BudgetConceptSuggestion } from "@/lib/budgetConcepts";
import type { ProjectTab } from "@/lib/projectTabs";
import { signProjectFileUrls } from "@/lib/signedProjectFiles";
import type { BudgetItem, Message, Profile, ProjectExpense, ProjectFile, ProjectPayment, Room, RoomModule } from "@/lib/types";

// Keep the overview independent of chat history, attachments and finance data.
export async function loadProjectPageData(supabase: SupabaseClient, projectId: string, tab: ProjectTab) {
  const needsRooms = tab === "Medidas" || tab === "Presupuesto";
  const empty = Promise.resolve({ data: [], error: null });
  const [budget, messages, files, rooms, modules, concepts, profiles, expenses, payments] = await Promise.all([
    supabase.from("budget_items").select(tab === "Presupuesto" ? "*" : "total").eq("project_id", projectId).order("created_at", { ascending: true }).returns<BudgetItem[]>(),
    tab === "Chat" ? supabase.from("messages").select("*").eq("project_id", projectId).order("created_at", { ascending: true }).returns<Message[]>() : empty,
    tab === "Archivos" ? supabase.from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).returns<ProjectFile[]>() : empty,
    needsRooms ? supabase.from("rooms").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).returns<Room[]>() : empty,
    needsRooms ? supabase.from("room_modules").select("*").eq("project_id", projectId).order("created_at", { ascending: true }).returns<RoomModule[]>() : empty,
    tab === "Presupuesto" ? supabase.from("budget_items").select("concept,notes").not("notes", "is", null).neq("notes", "").order("created_at", { ascending: false }).limit(500).returns<BudgetConceptSuggestion[]>() : empty,
    tab === "Chat" ? supabase.from("profiles").select("user_id,name").returns<Pick<Profile, "user_id" | "name">[]>() : empty,
    tab === "Gastos" ? supabase.from("project_expenses").select("*").eq("project_id", projectId).order("expense_date", { ascending: false }).returns<ProjectExpense[]>() : empty,
    tab === "Gastos" ? supabase.from("project_payments").select("*").eq("project_id", projectId).order("payment_date", { ascending: false }).returns<ProjectPayment[]>() : empty,
  ]);

  for (const result of [budget, messages, files, rooms, profiles]) {
    if (result.error) throw new Error(result.error.message);
  }
  for (const result of [modules, expenses, payments]) {
    if (result.error && !["42P01", "42703", "42501", "PGRST205"].includes(result.error.code)) {
      throw new Error(result.error.message);
    }
  }
  if (concepts.error) console.error("[Decoralia budget concepts]", concepts.error.code);

  const modulesByRoom = new Map<string, RoomModule[]>();
  for (const module of modules.data ?? []) {
    const group = modulesByRoom.get(module.room_id) ?? [];
    group.push(module);
    modulesByRoom.set(module.room_id, group);
  }
  const names = new Map((profiles.data ?? []).map((profile) => [profile.user_id, profile.name]));
  const fileRows = files.data ?? [];
  const expenseRows = expenses.data ?? [];
  const paymentRows = payments.data ?? [];
  const urls = await signProjectFileUrls(supabase, [
    ...fileRows.map((file) => file.file_url),
    ...expenseRows.map((expense) => expense.receipt_file_url),
    ...paymentRows.map((payment) => payment.receipt_file_url),
  ]);

  return {
    budgetTotal: (budget.data ?? []).reduce((sum, item) => sum + Number(item.total), 0),
    budgetItems: tab === "Presupuesto" ? sortBudgetItems(budget.data ?? []) : [],
    budgetConceptSuggestions: tab === "Presupuesto" ? buildBudgetConceptCatalog(concepts.data ?? []) : [],
    messages: (messages.data ?? []).map((message) => ({ ...message, user_name: names.get(message.user_id) ?? "Decoralia" })),
    files: fileRows.map((file) => ({ ...file, signed_url: urls.get(file.file_url) })),
    rooms: (rooms.data ?? []).map((room) => ({ ...room, modules: modulesByRoom.get(room.id) ?? [] })),
    expenses: expenseRows.map((expense) => ({ ...expense, receipt_signed_url: expense.receipt_file_url ? urls.get(expense.receipt_file_url) : undefined })),
    payments: paymentRows.map((payment) => ({ ...payment, receipt_signed_url: payment.receipt_file_url ? urls.get(payment.receipt_file_url) : undefined })),
  };
}
