import type { BudgetItem, FixedCost, Project, ProjectExpense, ProjectPayment, ProjectStatus } from "@/lib/types";

export const FINANCE_STATUSES: ProjectStatus[] = ["Aprobado", "En ejecución", "Terminado", "Cobrado"];

export function projectBudgetTotals(items: BudgetItem[]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(item.project_id, (totals.get(item.project_id) ?? 0) + Number(item.total));
  }

  return totals;
}

export function monthlyFixedCostAmount(cost: FixedCost) {
  const amount = Number(cost.amount);

  if (cost.frequency === "Anual") return amount / 12;
  if (cost.frequency === "Trimestral") return amount / 3;
  return amount;
}

export function isInMonth(dateValue: string | null | undefined, year: number, month: number) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return date.getFullYear() === year && date.getMonth() === month;
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
}

export function monthKeyFromDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey: string | undefined) {
  const fallback = new Date();
  const match = monthKey?.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return { year: fallback.getFullYear(), month: fallback.getMonth(), key: monthKeyFromDate(fallback) };
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return { year, month, key: `${year}-${String(month + 1).padStart(2, "0")}` };
}

export function buildMonthlyFinance({
  projects,
  budgetItems,
  expenses,
  payments,
  fixedCosts,
  year,
  month,
}: {
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
  fixedCosts: FixedCost[];
  year: number;
  month: number;
}) {
  const budgetTotals = projectBudgetTotals(budgetItems);
  const approvedProjects = projects.filter((project) => FINANCE_STATUSES.includes(project.status));
  const approvedAmount = approvedProjects.reduce((sum, project) => sum + (budgetTotals.get(project.id) ?? 0), 0);
  const quotedAmount = projects
    .filter((project) => project.status === "Presupuestado")
    .reduce((sum, project) => sum + (budgetTotals.get(project.id) ?? 0), 0);
  const monthPayments = payments.filter((payment) => isInMonth(payment.payment_date, year, month));
  const collectedAmount = monthPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const linkedCollectedAmount = monthPayments.filter((payment) => payment.project_id).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const monthExpenses = expenses.filter((expense) => isInMonth(expense.expense_date, year, month));
  const expenseAmount = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const fixedCostAmount = fixedCosts.filter((cost) => cost.is_active).reduce((sum, cost) => sum + monthlyFixedCostAmount(cost), 0);
  const profit = collectedAmount - expenseAmount - fixedCostAmount;
  const pendingCollection = Math.max(approvedAmount - linkedCollectedAmount, 0);

  return {
    budgetTotals,
    approvedAmount,
    quotedAmount,
    collectedAmount,
    expenseAmount,
    fixedCostAmount,
    profit,
    pendingCollection,
    monthExpenses,
    monthPayments,
    approvedProjects,
  };
}

export function buildDailyFinanceSeries({
  year,
  month,
  expenses,
  payments,
  fixedCosts,
}: {
  year: number;
  month: number;
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
  fixedCosts: FixedCost[];
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let incomeRunning = 0;
  let expenseRunning = 0;
  const fixedCostMonthlyTotal = fixedCosts.filter((cost) => cost.is_active).reduce((sum, cost) => sum + monthlyFixedCostAmount(cost), 0);
  const fixedCostPerDay = fixedCostMonthlyTotal / daysInMonth;

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const income = payments
      .filter((payment) => isSameDay(payment.payment_date, year, month, day))
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const expensesForDay = expenses
      .filter((expense) => isSameDay(expense.expense_date, year, month, day))
      .reduce((sum, expense) => sum + Number(expense.amount), 0);

    incomeRunning += income;
    expenseRunning += expensesForDay + fixedCostPerDay;

    return {
      label: String(day),
      income: incomeRunning,
      expenses: expenseRunning,
      profit: incomeRunning - expenseRunning,
    };
  });
}

function isSameDay(dateValue: string | null | undefined, year: number, month: number, day: number) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
}
