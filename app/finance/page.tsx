import { FinanceDashboard } from "@/components/FinanceDashboard";
import { TopBar } from "@/components/TopBar";
import { requireUserProfile } from "@/lib/auth";
import { sortBudgetItems } from "@/lib/budget";
import { parseMonthKey } from "@/lib/finance";
import { signProjectFileUrls } from "@/lib/signedProjectFiles";
import type { BudgetItem, FixedCost, Project, ProjectExpense, ProjectPayment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const expenseRows = financeTablesUnavailable ? [] : (expenses ?? []);
  const paymentRows = financeTablesUnavailable ? [] : (payments ?? []);
  const receiptUrls = await signProjectFileUrls(supabase, [
    ...expenseRows.map((expense) => expense.receipt_file_url),
    ...paymentRows.map((payment) => payment.receipt_file_url),
  ]);
  const expensesWithSignedReceipts = expenseRows.map((expense) => ({ ...expense, receipt_signed_url: expense.receipt_file_url ? receiptUrls.get(expense.receipt_file_url) : undefined }));
  const paymentsWithSignedReceipts = paymentRows.map((payment) => ({ ...payment, receipt_signed_url: payment.receipt_file_url ? receiptUrls.get(payment.receipt_file_url) : undefined }));

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
