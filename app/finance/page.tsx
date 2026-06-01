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

  const financeTablesUnavailable = isOptionalFinanceError(expensesError) || isOptionalFinanceError(paymentsError) || isOptionalFinanceError(fixedCostsError);

  if (!financeTablesUnavailable && (expensesError || paymentsError || fixedCostsError)) {
    throw new Error(expensesError?.message ?? paymentsError?.message ?? fixedCostsError?.message);
  }

  const expensesWithSignedReceipts = await signExpenseReceipts(supabase, financeTablesUnavailable ? [] : (expenses ?? []));
  const paymentsWithSignedReceipts = await signPaymentReceipts(supabase, financeTablesUnavailable ? [] : (payments ?? []));

  return (
    <main className="min-h-screen pb-24">
      <TopBar profile={profile} />
      <div className="mx-auto max-w-6xl px-4 py-5">
        <FinanceDashboard
          projects={projects ?? []}
          budgetItems={sortBudgetItems(budgetItems ?? [])}
          expenses={expensesWithSignedReceipts}
          payments={paymentsWithSignedReceipts}
          fixedCosts={financeTablesUnavailable ? [] : (fixedCosts ?? [])}
          year={year}
          month={month}
          monthKey={key}
        />
      </div>
    </main>
  );
}

function isOptionalFinanceError(error: { code?: string } | null) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "42703" || error.code === "42501";
}

async function signPaymentReceipts(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  payments: ProjectPayment[],
) {
  return Promise.all(
    payments.map(async (payment) => {
      if (!payment.receipt_file_url) return payment;

      const { data } = await supabase.storage.from("project-files").createSignedUrl(payment.receipt_file_url, 60 * 60);
      return { ...payment, receipt_signed_url: data?.signedUrl };
    }),
  );
}

async function signExpenseReceipts(
  supabase: Awaited<ReturnType<typeof requireUserProfile>>["supabase"],
  expenses: ProjectExpense[],
) {
  return Promise.all(
    expenses.map(async (expense) => {
      if (!expense.receipt_file_url) return expense;

      const { data } = await supabase.storage.from("project-files").createSignedUrl(expense.receipt_file_url, 60 * 60);
      return { ...expense, receipt_signed_url: data?.signedUrl };
    }),
  );
}
