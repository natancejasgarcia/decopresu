import { FinanceDashboard } from "@/components/FinanceDashboard";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import { sortBudgetItems } from "@/lib/budget";
import { parseMonthKey } from "@/lib/finance";
import type { BudgetItem, FixedCost, Project, ProjectExpense, ProjectPayment } from "@/lib/types";

export const dynamic = "force-dynamic";

type FinancePageProps = {
  searchParams: {
    month?: string;
  };
};

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const { supabase, profile } = await requireUserProfile();
  const { year, month, key } = parseMonthKey(searchParams.month);

  const [
    { data: projects, error: projectsError },
    { data: budgetItems, error: budgetItemsError },
    { data: expenses, error: expensesError },
    { data: payments, error: paymentsError },
    { data: fixedCosts, error: fixedCostsError },
  ] = await Promise.all([
    supabase.from("projects").select("*").order("last_activity_at", { ascending: false }).returns<Project[]>(),
    supabase.from("budget_items").select("*").order("created_at", { ascending: true }).returns<BudgetItem[]>(),
    supabase.from("project_expenses").select("*").order("expense_date", { ascending: false }).returns<ProjectExpense[]>(),
    supabase.from("project_payments").select("*").order("payment_date", { ascending: false }).returns<ProjectPayment[]>(),
    supabase.from("fixed_costs").select("*").order("created_at", { ascending: false }).returns<FixedCost[]>(),
  ]);

  if (projectsError || budgetItemsError) {
    throw new Error(projectsError?.message ?? budgetItemsError?.message);
  }

  const financeTablesMissing = expensesError?.code === "42P01" || paymentsError?.code === "42P01" || fixedCostsError?.code === "42P01";

  if (!financeTablesMissing && (expensesError || paymentsError || fixedCostsError)) {
    throw new Error(expensesError?.message ?? paymentsError?.message ?? fixedCostsError?.message);
  }

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <FinanceDashboard
          projects={projects ?? []}
          budgetItems={sortBudgetItems(budgetItems ?? [])}
          expenses={financeTablesMissing ? [] : (expenses ?? [])}
          payments={financeTablesMissing ? [] : (payments ?? [])}
          fixedCosts={financeTablesMissing ? [] : (fixedCosts ?? [])}
          year={year}
          month={month}
          monthKey={key}
        />
      </div>
    </main>
  );
}
