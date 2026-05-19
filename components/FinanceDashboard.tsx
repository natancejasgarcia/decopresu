import Link from "next/link";
import { BarChart3, Banknote, CreditCard, Euro, ReceiptText, Trash2, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { createExpenseAction, createFixedCostAction, createPaymentAction, deleteExpenseAction, deleteFixedCostAction, deletePaymentAction } from "@/actions/financeActions";
import { formatCurrency } from "@/lib/calculations";
import { buildDailyFinanceSeries, buildMonthlyFinance, monthLabel, monthlyFixedCostAmount } from "@/lib/finance";
import {
  EXPENSE_CATEGORIES,
  FIXED_COST_FREQUENCIES,
  PAYMENT_METHODS,
  type BudgetItem,
  type ExpenseCategory,
  type FixedCost,
  type FixedCostFrequency,
  type PaymentMethod,
  type Project,
  type ProjectExpense,
  type ProjectPayment,
} from "@/lib/types";

type FinanceDashboardProps = {
  projects: Project[];
  budgetItems: BudgetItem[];
  expenses: ProjectExpense[];
  payments: ProjectPayment[];
  fixedCosts: FixedCost[];
  year: number;
  month: number;
  monthKey: string;
};

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function FinanceDashboard({ projects, budgetItems, expenses, payments, fixedCosts, year, month, monthKey }: FinanceDashboardProps) {
  const finance = buildMonthlyFinance({ projects, budgetItems, expenses, payments, fixedCosts, year, month });
  const series = buildDailyFinanceSeries({ year, month, expenses: finance.monthExpenses, payments: finance.monthPayments, fixedCosts });
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const expensesByCategory = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: finance.monthExpenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount), 0),
  })).filter((item) => item.amount > 0);
  const projectProfitRows = projects
    .map((project) => {
      const budget = finance.budgetTotals.get(project.id) ?? 0;
      const projectExpenses = expenses.filter((expense) => expense.project_id === project.id).reduce((sum, expense) => sum + Number(expense.amount), 0);
      const projectPayments = payments.filter((payment) => payment.project_id === project.id).reduce((sum, payment) => sum + Number(payment.amount), 0);
      return { project, budget, expenses: projectExpenses, payments: projectPayments, profit: budget - projectExpenses };
    })
    .filter((row) => row.budget > 0 || row.expenses > 0 || row.payments > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8);

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-clay">Finanzas</p>
            <h1 className="mt-1 text-3xl font-black leading-tight text-ink sm:text-4xl">Control financiero</h1>
            <p className="mt-2 text-sm font-semibold text-muted">Resumen de {monthLabel(year, month)} conectado a proyectos, gastos, cobros y costes fijos.</p>
          </div>
          <form className="flex gap-2">
            <input className="form-input h-12 py-0" name="month" type="month" defaultValue={monthKey} />
            <button className="h-12 rounded-lg bg-moss px-5 font-black text-white">Ver mes</button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Euro size={20} />} label="Cobrado este mes" value={formatCurrency(finance.collectedAmount)} detail={`${finance.monthPayments.length} cobros`} tone="green" />
        <StatCard icon={<ReceiptText size={20} />} label="Gastos de obras" value={formatCurrency(finance.expenseAmount)} detail={`${finance.monthExpenses.length} gastos`} tone="red" />
        <StatCard icon={<WalletCards size={20} />} label="Costes fijos mes" value={formatCurrency(finance.fixedCostAmount)} detail={`${fixedCosts.filter((cost) => cost.is_active).length} activos`} tone="blue" />
        <StatCard icon={finance.profit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />} label="Resultado del mes" value={formatCurrency(finance.profit)} detail={`Pendiente ${formatCurrency(finance.pendingCollection)}`} tone={finance.profit >= 0 ? "green" : "red"} />
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-clay">Grafica mensual</p>
            <h2 className="text-2xl font-black text-ink">Evolucion financiera</h2>
            <p className="mt-1 text-sm font-semibold text-muted">Compara cobrado, gastos de obra, costes fijos y beneficio con la misma escala.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-3 text-sm font-black text-moss">
            <BarChart3 size={20} />
            {monthLabel(year, month)}
          </div>
        </div>
        <FinanceOverviewChart
          income={finance.collectedAmount}
          projectExpenses={finance.expenseAmount}
          fixedCosts={finance.fixedCostAmount}
          profit={finance.profit}
          points={series}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Legend color="bg-emerald-500" label="Ingresos" />
          <Legend color="bg-red-400" label="Gastos totales" />
          <Legend color="bg-steel" label="Beneficio" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          <FinanceFormPanel title="Anadir gasto o material" icon={<ReceiptText size={18} />}>
            <form action={createExpenseAction} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Concepto">
                  <input className="form-input" name="concept" placeholder="Pintura, lijas, gasolina..." required />
                </Field>
                <Field label="Proyecto">
                  <select className="form-input" name="project_id" defaultValue="">
                    <option value="">Gasto general</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Categoria">
                  <select className="form-input" name="category" defaultValue="Materiales">
                    {EXPENSE_CATEGORIES.map((category: ExpenseCategory) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Proveedor">
                  <input className="form-input" name="supplier" placeholder="Proveedor opcional" />
                </Field>
                <Field label="Importe">
                  <input className="form-input" name="amount" type="number" min="0" step="0.01" defaultValue="0" required />
                </Field>
                <Field label="Fecha">
                  <input className="form-input" name="expense_date" type="date" defaultValue={todayValue()} />
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
                <input className="h-4 w-4 accent-moss" name="is_paid" type="checkbox" defaultChecked />
                Pagado
              </label>
              <textarea className="form-input min-h-20" name="notes" placeholder="Notas, ticket, material..." />
              <button className="h-11 rounded-lg bg-moss font-black text-white">Guardar gasto</button>
            </form>
          </FinanceFormPanel>

          <FinanceFormPanel title="Registrar cobro" icon={<CreditCard size={18} />}>
            <form action={createPaymentAction} encType="multipart/form-data" className="grid gap-3">
              <Field label="Proyecto">
                <select className="form-input" name="project_id" required>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Importe">
                  <input className="form-input" name="amount" type="number" min="0" step="0.01" defaultValue="0" required />
                </Field>
                <Field label="Metodo">
                  <select className="form-input" name="method" defaultValue="Transferencia">
                    {PAYMENT_METHODS.map((method: PaymentMethod) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fecha">
                  <input className="form-input" name="payment_date" type="date" defaultValue={todayValue()} />
                </Field>
              </div>
              <textarea className="form-input min-h-20" name="notes" placeholder="Senal, pago final, transferencia..." />
              <Field label="PDF justificante">
                <input className="form-input file:mr-3 file:rounded-md file:border-0 file:bg-moss file:px-3 file:py-2 file:text-sm file:font-black file:text-white" name="receipt" type="file" accept="application/pdf,.pdf" />
              </Field>
              <button className="h-11 rounded-lg bg-moss font-black text-white">Guardar cobro</button>
            </form>
          </FinanceFormPanel>
        </div>

        <FinanceFormPanel title="Costes fijos" icon={<Banknote size={18} />}>
          <form action={createFixedCostAction} className="grid gap-3">
            <Field label="Concepto">
              <input className="form-input" name="name" placeholder="Autonomo, gestoria, seguro..." required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Importe">
                <input className="form-input" name="amount" type="number" min="0" step="0.01" defaultValue="0" required />
              </Field>
              <Field label="Frecuencia">
                <select className="form-input" name="frequency" defaultValue="Mensual">
                  {FIXED_COST_FREQUENCIES.map((frequency: FixedCostFrequency) => (
                    <option key={frequency} value={frequency}>{frequency}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Proximo pago">
              <input className="form-input" name="next_payment_date" type="date" />
            </Field>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line bg-white px-3 text-sm font-black text-ink">
              <input className="h-4 w-4 accent-moss" name="is_active" type="checkbox" defaultChecked />
              Activo
            </label>
            <textarea className="form-input min-h-20" name="notes" placeholder="Notas internas..." />
            <button className="h-11 rounded-lg bg-moss font-black text-white">Guardar coste fijo</button>
          </form>

          <div className="mt-4 grid gap-2">
            {fixedCosts.length === 0 ? (
              <p className="rounded-lg bg-paper p-3 text-sm font-semibold text-muted">No hay costes fijos.</p>
            ) : (
              fixedCosts.map((cost) => (
                <article key={cost.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-line p-3">
                  <div>
                    <strong className="text-sm text-ink">{cost.name}</strong>
                    <p className="text-xs font-semibold text-muted">{cost.frequency} - mensual aprox. {formatCurrency(monthlyFixedCostAmount(cost))}</p>
                  </div>
                  <strong className="text-ink">{formatCurrency(Number(cost.amount))}</strong>
                  <form action={deleteFixedCostAction}>
                    <input type="hidden" name="fixed_cost_id" value={cost.id} />
                    <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700" title="Borrar" type="submit">
                      <Trash2 size={17} />
                    </button>
                  </form>
                </article>
              ))
            )}
          </div>
        </FinanceFormPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataPanel title="Gastos por categoria">
          {expensesByCategory.length === 0 ? (
            <Empty text="No hay gastos este mes." />
          ) : (
            expensesByCategory.map((item) => (
              <BarRow key={item.category} label={item.category} amount={item.amount} max={Math.max(...expensesByCategory.map((row) => row.amount), 1)} />
            ))
          )}
        </DataPanel>

        <DataPanel title="Rentabilidad por obra">
          {projectProfitRows.length === 0 ? (
            <Empty text="No hay datos de rentabilidad todavia." />
          ) : (
            projectProfitRows.map((row) => (
              <Link key={row.project.id} href={`/projects/${row.project.id}`} className="grid gap-1 rounded-lg border border-line p-3 hover:border-moss">
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-sm text-ink">{row.project.name}</strong>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${row.profit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                    {formatCurrency(row.profit)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-muted">
                  Presupuesto {formatCurrency(row.budget)} - gastos {formatCurrency(row.expenses)} - cobrado {formatCurrency(row.payments)}
                </p>
              </Link>
            ))
          )}
        </DataPanel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <DataPanel title="Ultimos gastos">
          {finance.monthExpenses.length === 0 ? <Empty text="No hay gastos este mes." /> : finance.monthExpenses.slice(0, 8).map((expense) => (
            <FinanceRow
              key={expense.id}
              title={expense.concept}
              meta={`${expense.category} - ${projectNames.get(expense.project_id ?? "") ?? "General"} - ${expense.expense_date}`}
              amount={Number(expense.amount)}
              deleteAction={deleteExpenseAction}
              hiddenInputs={{ expense_id: expense.id, project_id: expense.project_id ?? "" }}
            />
          ))}
        </DataPanel>
        <DataPanel title="Ultimos cobros">
          {finance.monthPayments.length === 0 ? <Empty text="No hay cobros este mes." /> : finance.monthPayments.slice(0, 8).map((payment) => (
            <FinanceRow
              key={payment.id}
              title={projectNames.get(payment.project_id) ?? "Proyecto"}
              meta={`${payment.method} - ${payment.payment_date}`}
              amount={Number(payment.amount)}
              deleteAction={deletePaymentAction}
              hiddenInputs={{ payment_id: payment.id, project_id: payment.project_id }}
              receiptName={payment.receipt_file_name}
              receiptUrl={payment.receipt_signed_url}
            />
          ))}
        </DataPanel>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "green" | "red" | "warm" | "blue" }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "bg-rose-50 text-rose-700"
        : tone === "blue"
          ? "bg-sky-50 text-sky-700"
          : "bg-orange-50 text-orange-700";
  const accentClass =
    tone === "green"
      ? "from-emerald-500/16"
      : tone === "red"
        ? "from-rose-500/16"
        : tone === "blue"
          ? "from-sky-500/16"
          : "from-orange-500/16";

  return (
    <article className={`relative overflow-hidden rounded-xl border border-line bg-white p-5 shadow-soft`}>
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accentClass} to-transparent`} />
      <div className="relative">
      <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${toneClass}`}>{icon}</div>
      <p className="text-xs font-black uppercase text-muted">{label}</p>
      <strong className="mt-1 block text-2xl text-ink">{value}</strong>
      <p className="mt-1 text-sm font-semibold text-muted">{detail}</p>
      </div>
    </article>
  );
}

function FinanceOverviewChart({
  income,
  projectExpenses,
  fixedCosts,
  profit,
  points,
}: {
  income: number;
  projectExpenses: number;
  fixedCosts: number;
  profit: number;
  points: Array<{ label: string; income: number; expenses: number; profit: number }>;
}) {
  const safeIncome = safeNumber(income);
  const safeProjectExpenses = safeNumber(projectExpenses);
  const safeFixedCosts = safeNumber(fixedCosts);
  const safeProfit = safeNumber(profit);
  const totalExpenses = safeProjectExpenses + safeFixedCosts;
  const maxBar = safeMax([safeIncome, safeProjectExpenses, safeFixedCosts, totalExpenses, Math.abs(safeProfit), 1]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-xl border border-line bg-gradient-to-br from-white to-paper p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-muted">Resultado</p>
              <strong className={`mt-1 block text-3xl ${safeProfit >= 0 ? "text-emerald-800" : "text-rose-700"}`}>{formatCurrency(safeProfit)}</strong>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${safeProfit >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
              {safeProfit >= 0 ? "Beneficio" : "Perdida"}
            </span>
          </div>
          <div className="grid gap-3">
            <FinanceBar label="Cobrado" amount={safeIncome} max={maxBar} color="bg-gradient-to-r from-emerald-400 to-emerald-600" />
            <FinanceBar label="Gastos de obra" amount={safeProjectExpenses} max={maxBar} color="bg-gradient-to-r from-rose-300 to-rose-500" />
            <FinanceBar label="Costes fijos" amount={safeFixedCosts} max={maxBar} color="bg-gradient-to-r from-sky-300 to-blue-500" />
            <FinanceBar label="Gastos totales" amount={totalExpenses} max={maxBar} color="bg-gradient-to-r from-orange-400 to-rose-600" strong />
          </div>
        </div>
        <FinanceLineChart points={points} maxValue={maxBar} />
      </div>
    </div>
  );
}

function FinanceBar({ label, amount, max, color, strong = false }: { label: string; amount: number; max: number; color: string; strong?: boolean }) {
  const safeAmount = safeNumber(amount);
  const safeMaxValue = Math.max(safeNumber(max), 1);
  const width = Math.min(100, Math.max((Math.abs(safeAmount) / safeMaxValue) * 100, safeAmount > 0 ? 4 : 0));

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm ${strong ? "font-black text-ink" : "font-bold text-muted"}`}>{label}</span>
        <span className="text-sm font-black text-ink">{formatCurrency(safeAmount)}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-white ring-1 ring-line">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function FinanceLineChart({ points, maxValue }: { points: Array<{ label: string; income: number; expenses: number; profit: number }>; maxValue: number }) {
  const width = 760;
  const height = 250;
  const padding = { top: 22, right: 20, bottom: 36, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const safePoints = points.length ? points : [{ label: "1", income: 0, expenses: 0, profit: 0 }];
  const lineMax = safeMax([...safePoints.flatMap((point) => [point.income, point.expenses, Math.abs(point.profit)]), maxValue, 1]);
  const incomePoints = buildPoints(safePoints.map((point) => point.income), lineMax, chartWidth, chartHeight, padding);
  const expensePoints = buildPoints(safePoints.map((point) => point.expenses), lineMax, chartWidth, chartHeight, padding);
  const profitPoints = buildPoints(safePoints.map((point) => Math.max(safeNumber(point.profit), 0)), lineMax, chartWidth, chartHeight, padding);

  return (
    <svg className="h-auto w-full rounded-xl bg-[#f8faf8] p-2 ring-1 ring-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafica financiera mensual">
      <defs>
        <linearGradient id="financeIncomeArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="financeExpenseArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </linearGradient>
        <filter id="financeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#1f2a2b" floodOpacity="0.12" />
        </filter>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((value) => {
        const y = padding.top + chartHeight - chartHeight * value;
        return (
          <g key={value}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#d9e0db" strokeDasharray="5 6" />
            <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted text-[10px] font-bold">{shortMoney(lineMax * value)}</text>
          </g>
        );
      })}
      <path d={buildAreaPath(incomePoints, height - padding.bottom)} fill="url(#financeIncomeArea)" />
      <path d={buildAreaPath(expensePoints, height - padding.bottom)} fill="url(#financeExpenseArea)" />
      <polyline points={incomePoints} fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" filter="url(#financeGlow)" />
      <polyline points={expensePoints} fill="none" stroke="#fb7185" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" filter="url(#financeGlow)" />
      <polyline points={profitPoints} fill="none" stroke="#335f82" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      {incomePoints.split(" ").filter(Boolean).map((point, index) => {
        if (index !== 0 && index !== safePoints.length - 1 && index % 5 !== 0) return null;
        const [x, y] = point.split(",").map(Number);
        return <circle key={`income-${index}`} cx={x} cy={y} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="2" />;
      })}
      {expensePoints.split(" ").filter(Boolean).map((point, index) => {
        if (index !== 0 && index !== safePoints.length - 1 && index % 5 !== 0) return null;
        const [x, y] = point.split(",").map(Number);
        return <circle key={`expense-${index}`} cx={x} cy={y} r="4" fill="#fb7185" stroke="#ffffff" strokeWidth="2" />;
      })}
      {safePoints.map((point, index) => {
        if (index !== 0 && index !== safePoints.length - 1 && index % 5 !== 0) return null;
        const x = padding.left + (chartWidth / Math.max(safePoints.length - 1, 1)) * index;
        return <text key={point.label} x={x} y={height - 12} textAnchor="middle" className="fill-muted text-[10px] font-bold">{point.label}</text>;
      })}
    </svg>
  );
}

function FinanceFormPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800">{icon}</div>
        <h2 className="text-lg font-black text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <h2 className="mb-3 text-lg font-black text-ink">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="form-label">{label}</span>
      {children}
    </label>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm font-black text-ink">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function BarRow({ label, amount, max }: { label: string; amount: number; max: number }) {
  const safeAmount = safeNumber(amount);
  const safeMaxValue = Math.max(safeNumber(max), 1);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-ink">{label}</span>
        <span className="text-sm font-black text-ink">{formatCurrency(safeAmount)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, Math.max((safeAmount / safeMaxValue) * 100, safeAmount > 0 ? 4 : 0))}%` }} />
      </div>
    </div>
  );
}

function FinanceRow({
  title,
  meta,
  amount,
  deleteAction,
  hiddenInputs,
  receiptName,
  receiptUrl,
}: {
  title: string;
  meta: string;
  amount: number;
  deleteAction: (formData: FormData) => Promise<void>;
  hiddenInputs: Record<string, string>;
  receiptName?: string | null;
  receiptUrl?: string;
}) {
  return (
    <article className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg border border-line p-3">
      <div>
        <strong className="block text-sm text-ink">{title}</strong>
        <p className="text-xs font-semibold text-muted">{meta}</p>
        {receiptUrl ? (
          <a className="mt-1 inline-flex text-xs font-black text-moss underline" href={receiptUrl} target="_blank" rel="noreferrer">
            Ver PDF {receiptName ? `- ${receiptName}` : ""}
          </a>
        ) : null}
      </div>
      <strong className="whitespace-nowrap text-ink">{formatCurrency(amount)}</strong>
      <form action={deleteAction}>
        {Object.entries(hiddenInputs).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button className="grid h-10 w-10 place-items-center rounded-lg border border-line text-red-700" title="Borrar" type="submit">
          <Trash2 size={17} />
        </button>
      </form>
    </article>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg bg-paper p-3 text-sm font-semibold text-muted">{text}</p>;
}

function buildPoints(values: number[], maxValue: number, width: number, height: number, padding: { top: number; left: number }) {
  const divisor = Math.max(values.length - 1, 1);
  const safeMaxValue = Math.max(safeNumber(maxValue), 1);

  return values
    .map((value, index) => {
      const x = padding.left + (width / divisor) * index;
      const y = padding.top + height - (Math.max(safeNumber(value), 0) / safeMaxValue) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points: string, baselineY: number) {
  const splitPoints = points.split(" ").filter(Boolean);
  if (splitPoints.length === 0) return "";
  const first = splitPoints[0];
  const last = splitPoints[splitPoints.length - 1];
  const firstX = first.split(",")[0];
  const lastX = last.split(",")[0];

  return `M ${firstX},${baselineY} L ${splitPoints.join(" L ")} L ${lastX},${baselineY} Z`;
}

function shortMoney(value: number) {
  const safeValue = safeNumber(value);
  if (safeValue >= 1000) return `${Math.round(safeValue / 1000)}k`;
  return `${Math.round(safeValue)}`;
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function safeMax(values: number[]) {
  return Math.max(...values.map(safeNumber), 1);
}
