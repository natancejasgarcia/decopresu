const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-ts.cjs");
const sales = load("lib/sales.ts");
const doc = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "invoice",
  status: "draft",
  number: null,
  project_id: "00000000-0000-4000-8000-000000000010",
  source_document_id: null,
  source_label: "Obra ejemplo",
  client_name: "Cliente",
  client_tax_id: "B12345678",
  client_address: "Calle ejemplo",
  client_email: "",
  issue_date: "2026-10-19",
  due_date: null,
  notes: "",
  lines: [
    sales.partialInvoiceLine({
      amount: 1000,
      vat_rate: 21,
      concept: "Factura parcial",
      notes: "",
    }),
  ],
  subtotal: 1000,
  tax_total: 210,
  total: 1210,
  issuer: null,
  created_at: "2026-10-19",
  issued_at: null,
};
const mocks = {
  "next/link": {
    __esModule: true,
    default: ({ children, ...props }) =>
      React.createElement("a", props, children),
  },
  "next/navigation": {
    useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  },
  "@/actions/salesActions": {},
};
const { SalesDocumentEditor } = load(
  "components/SalesDocumentEditor.tsx",
  mocks,
);
test("a partial draft exposes amount and VAT controls and keeps its normal editable concepts", () => {
  const html = renderToStaticMarkup(
    React.createElement(SalesDocumentEditor, {
      document: doc,
      payments: [],
      initialPartial: true,
    }),
  );
  assert.match(html, /Importe sin IVA/);
  assert.match(html, /Usar este importe/);
  assert.match(html, /Trabajo o material/);
  assert.match(html, /Factura parcial/);
  assert.doesNotMatch(html, /Registrar cobro/);
});
test("after issue, the payment question offers an actual dated receipt or the option to skip", () => {
  const html = renderToStaticMarkup(
    React.createElement(SalesDocumentEditor, {
      document: { ...doc, status: "issued", number: "F\/2026\/0001" },
      payments: [],
      initialCollect: true,
    }),
  );
  assert.match(html, /Factura emitida. ¿Registrar cobro/);
  assert.match(html, /name="amount"[^>]*max="1210"/);
  assert.match(html, /name="date"/);
  assert.match(html, /Guardar cobro/);
  assert.match(html, /Ahora no/);
  assert.match(html, /Pendiente/);
});
test("paid invoices and delivery notes never prompt another collection", () => {
  for (const props of [
    {
      document: { ...doc, status: "issued", number: "F/2026/0001" },
      payments: [
        {
          id: "payment",
          sales_document_id: doc.id,
          amount: 1210,
          method: "Transferencia",
          payment_date: "2026-10-19",
        },
      ],
    },
    {
      document: {
        ...doc,
        kind: "delivery_note",
        status: "issued",
        number: "A/2026/0001",
      },
      payments: [],
    },
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(SalesDocumentEditor, {
        ...props,
        initialCollect: true,
      }),
    );
    assert.doesNotMatch(html, /role="dialog"/);
    assert.doesNotMatch(html, /Guardar cobro/);
  }
});
test("issuance creates no receipt until the user explicitly registers it", async () => {
  const calls = [],
    refreshes = [];
  const actions = load("actions/salesActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        supabase: {
          rpc: async (name, values) => {
            calls.push({ name, values });
            return {
              data:
                name === "issue_sales_document" ? "F/2026/0001" : "payment-id",
              error: null,
            };
          },
        },
      }),
    },
    "next/cache": { revalidatePath: (path) => refreshes.push(path) },
  });
  assert.equal((await actions.issueSalesDocumentAction(doc.id)).ok, true);
  assert.deepEqual(
    calls.map((call) => call.name),
    ["issue_sales_document"],
  );
  const values = new FormData();
  values.set("amount", "477,50");
  values.set("date", "2026-11-03");
  values.set("method", "Transferencia");
  assert.deepEqual(await actions.recordSalesPaymentAction(doc.id, values), {
    ok: true,
    id: "payment-id",
  });
  assert.deepEqual(calls[1], {
    name: "record_sales_payment",
    values: {
      p_id: doc.id,
      p_amount: 477.5,
      p_date: "2026-11-03",
      p_method: "Transferencia",
    },
  });
  assert.ok(refreshes.includes("/finance"));
  assert.ok(refreshes.includes("/sales"));
  values.set("amount", "-2");
  assert.equal(
    (await actions.recordSalesPaymentAction(doc.id, values)).ok,
    false,
  );
  assert.equal(calls.length, 2);
});
