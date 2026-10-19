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
  lines: sales.partialInvoiceLines({
    amount: 1210,
    vat_rate: 21,
    concept: "Factura parcial",
    notes: "",
  }),
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
  assert.match(html, /Importe final, IVA incluido/);
  assert.doesNotMatch(html, /Importe sin IVA/);
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
  assert.match(html, /Importe cobrado, IVA incluido/);
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

test("missing company fiscal data is visible before issue and can be completed inline", () => {
  const html = renderToStaticMarkup(
    React.createElement(SalesDocumentEditor, {
      document: doc,
      payments: [],
      initialCompany: sales.DEFAULT_COMPANY,
    }),
  );
  assert.match(html, /Faltan datos fiscales para emitir/);
  assert.match(html, /NIF \/ CIF, dirección fiscal/);
  assert.match(html, /Completar datos de la empresa/);
  assert.match(html, /button[^>]*disabled=""[^>]*>[\s\S]*?Emitir/);
  assert.deepEqual(sales.missingCompanyFields(sales.DEFAULT_COMPANY), [
    "NIF / CIF",
    "dirección fiscal",
  ]);
  assert.equal(
    sales.companySchema.safeParse(sales.DEFAULT_COMPANY).success,
    false,
  );
});

function harness(file, name, props, actions) {
  let cursor = 0;
  const state = [],
    navigation = [];
  const fakeReact = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state))
        state[index] = typeof initial === "function" ? initial() : initial;
      return [
        state[index],
        (next) => {
          state[index] = typeof next === "function" ? next(state[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect() {},
  };
  const Component = load(file, {
    ...mocks,
    react: fakeReact,
    "@/actions/salesActions": actions,
    "next/navigation": {
      useRouter: () => ({
        push(path) {
          navigation.push(path);
        },
        replace(path) {
          navigation.push(path);
        },
        refresh() {},
      }),
    },
  })[name];
  const render = () => {
    cursor = 0;
    return Component(props);
  };
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join("");
    if (typeof node === "string" || typeof node === "number")
      return String(node);
    return node ? text(node.props?.children) : "";
  }
  function button(tree, label) {
    if (Array.isArray(tree)) {
      for (const child of tree) {
        const result = button(child, label);
        if (result) return result;
      }
      return null;
    }
    if (!tree || typeof tree !== "object") return null;
    if (tree.type === "button" && text(tree) === label) return tree;
    return button(tree.props?.children, label);
  }
  return { render, button, text, navigation };
}
const settled = () => new Promise((resolve) => setImmediate(resolve));

test("creation stays locked through slow navigation, including a second click after the action returns", async () => {
  let creates = 0,
    release;
  const h = harness(
    "components/SalesWorkspace.tsx",
    "SalesWorkspace",
    {
      documents: [],
      payments: [],
      projects: [],
      initialKind: "invoice",
      available: true,
    },
    {
      createSalesDocumentAction: async () => {
        creates++;
        await new Promise((resolve) => {
          release = resolve;
        });
        return { ok: true, id: doc.id };
      },
    },
  );
  h.button(h.render(), "Nueva factura").props.onClick();
  const start = h.button(h.render(), "Crear factura en borrador").props.onClick;
  start();
  start();
  assert.equal(creates, 1);
  release();
  await settled();
  const tree = h.render();
  assert.equal(h.button(tree, "Abriendo borrador…").props.disabled, true);
  start();
  await settled();
  assert.equal(creates, 1);
  assert.ok(h.navigation.every((path) => path === `/sales/${doc.id}`));
});

test("an existing draft is reopened instead of creating another document at the same project", async () => {
  let creates = 0;
  const h = harness(
    "components/SalesWorkspace.tsx",
    "SalesWorkspace",
    {
      documents: [doc],
      payments: [],
      projects: [],
      projectId: doc.project_id,
      initialKind: "invoice",
      available: true,
    },
    {
      createSalesDocumentAction: async () => {
        creates++;
        return { ok: true, id: "other" };
      },
    },
  );
  h.button(h.render(), "Nueva factura").props.onClick();
  h.button(h.render(), "Continuar borrador").props.onClick();
  assert.equal(creates, 0);
  assert.deepEqual(h.navigation, [`/sales/${doc.id}`]);
});

test("issue errors remain in the dialog; success immediately locks the draft and opens collections without navigation", async () => {
  let issues = 0,
    fail = true;
  const h = harness(
    "components/SalesDocumentEditor.tsx",
    "SalesDocumentEditor",
    { document: doc, payments: [] },
    {
      saveSalesDocumentAction: async () => ({ ok: true }),
      issueSalesDocumentAction: async () => {
        issues++;
        return fail
          ? { ok: false, error: "Completa los datos fiscales de la empresa." }
          : { ok: true, number: "F/2026/0001" };
      },
    },
  );
  h.button(h.render(), "Emitir factura").props.onClick();
  const confirm = h.button(h.render(), "Confirmar emisión").props.onClick;
  confirm();
  confirm();
  await settled();
  let tree = h.render();
  assert.equal(issues, 1);
  assert.ok(h.button(tree, "Confirmar emisión"));
  assert.match(h.text(tree), /Completa los datos fiscales/);
  fail = false;
  h.button(tree, "Confirmar emisión").props.onClick();
  await settled();
  tree = h.render();
  assert.match(h.text(tree), /Factura emitida. ¿Registrar cobro/);
  assert.equal(h.button(tree, "Emitir factura"), null);
  assert.deepEqual(h.navigation, []);
});

test("an unconfirmed creation cannot be retried until the document list has been checked", async () => {
  let creates = 0;
  const h = harness(
    "components/SalesWorkspace.tsx",
    "SalesWorkspace",
    {
      documents: [],
      payments: [],
      projects: [],
      initialKind: "invoice",
      available: true,
    },
    {
      createSalesDocumentAction: async () => {
        creates++;
        throw new Error("Connection lost after insert");
      },
    },
  );
  h.button(h.render(), "Nueva factura").props.onClick();
  h.button(h.render(), "Crear factura en borrador").props.onClick();
  await settled();
  const tree = h.render();
  assert.ok(h.button(tree, "Actualizar lista y comprobar borradores"));
  assert.equal(h.button(tree, "Abriendo borrador…").props.disabled, true);
  h.button(tree, "Abriendo borrador…").props.onClick();
  await settled();
  assert.equal(creates, 1);
});

test("an unconfirmed receipt is locked instead of blindly repeating a potentially saved partial collection", async () => {
  let receipts = 0;
  const h = harness(
    "components/SalesDocumentEditor.tsx",
    "SalesDocumentEditor",
    {
      document: { ...doc, status: "issued", number: "F/2026/0001" },
      payments: [],
      initialCollect: true,
    },
    {
      recordSalesPaymentAction: async () => {
        receipts++;
        throw new Error("Connection lost after receipt insert");
      },
    },
  );
  function paymentForm(tree) {
    if (Array.isArray(tree)) {
      for (const node of tree) {
        const found = paymentForm(node);
        if (found) return found;
      }
      return null;
    }
    if (!tree || typeof tree !== "object") return null;
    if (tree.type?.name === "SalesPaymentForm") return tree;
    return paymentForm(tree.props?.children);
  }
  const values = new FormData();
  values.set("amount", "100");
  paymentForm(h.render()).props.onSave(values);
  await settled();
  const tree = h.render();
  assert.equal(paymentForm(tree).props.pending, true);
  assert.ok(h.button(tree, "Actualizar factura y comprobar cobros"));
  paymentForm(tree).props.onSave(values);
  await settled();
  assert.equal(receipts, 1);
});
