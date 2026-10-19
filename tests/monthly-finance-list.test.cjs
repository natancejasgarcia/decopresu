const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-ts.cjs");
const { MonthlyFinanceList } = load("components/MonthlyFinanceList.tsx");

function rows(count) {
  return Array.from({ length: count }, (_, i) =>
    React.createElement("article", { key: i }, `Movimiento ${i + 1}`),
  );
}
test("monthly expense lists retain every row and provide access beyond the first eight", () => {
  const html = renderToStaticMarkup(
    React.createElement(MonthlyFinanceList, {
      kind: "gastos",
      children: rows(14),
    }),
  );
  assert.equal((html.match(/<article/g) || []).length, 14);
  assert.match(html, /Ver 6 gastos restantes/);
  assert.match(html, /Ocultar gastos adicionales/);
  const before = html.slice(0, html.indexOf("<details"));
  assert.equal((before.match(/<article/g) || []).length, 8);
  assert.match(html.slice(html.indexOf("<details")), /Movimiento 14/);
});
test("small lists do not show an unnecessary disclosure and cash receipts use correct singular labels", () => {
  for (const count of [0, 3, 8]) {
    const html = renderToStaticMarkup(
      React.createElement(MonthlyFinanceList, {
        kind: "gastos",
        children: rows(count),
      }),
    );
    assert.doesNotMatch(html, /<details/);
    assert.equal((html.match(/<article/g) || []).length, count);
  }
  const html = renderToStaticMarkup(
    React.createElement(MonthlyFinanceList, {
      kind: "cobros",
      children: rows(9),
    }),
  );
  assert.match(html, /Ver 1 cobro restante/);
});
test("finance dashboard exposes all monthly expenses, attachments and totals without including other months", () => {
  const { FinanceDashboard } = load("components/FinanceDashboard.tsx", {
    "next/link": {
      __esModule: true,
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    },
    "@/actions/financeActions": {},
    "@/components/ExpenseForm": { ExpenseForm: () => null },
    "@/components/FinanceAssistant": { FinanceAssistant: () => null },
  });
  const expenses = Array.from({ length: 14 }, (_, i) => ({
    id: String(i),
    project_id: null,
    category: "Otros",
    concept: `Factura octubre ${i + 1}`,
    amount: 10,
    expense_date: "2026-10-06",
    receipt_file_name: `factura${i}.pdf`,
    receipt_signed_url: `/receipt/${i}`,
  }));
  const html = renderToStaticMarkup(
    React.createElement(FinanceDashboard, {
      projects: [],
      budgetItems: [],
      expenses: [
        ...expenses,
        {
          ...expenses[0],
          id: "September",
          concept: "Gasto septiembre",
          expense_date: "2026-09-30",
        },
      ],
      payments: [],
      fixedCosts: [],
      year: 2026,
      month: 9,
      monthKey: "2026-10",
    }),
  );
  assert.match(html, /Gastos del mes \(14\)/);
  assert.match(html, /Factura octubre 14/);
  assert.match(html, /href="\/receipt\/13"/);
  assert.match(html, /140,00/);
  assert.doesNotMatch(html, /Gasto septiembre/);
});
