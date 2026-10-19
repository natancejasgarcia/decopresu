const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const load = require("./load-ts.cjs");
const {
  extractedInvoiceSchema,
  normalizeInvoiceDates,
  invoiceMonthRange,
  invoiceSchema,
} = load("lib/financeDocuments.ts");
const extraction = {
  direction: "income",
  party_name: "Cliente",
  tax_id: null,
  invoice_number: "F-septiembre",
  issue_date: "30/09/2026",
  due_date: "30/10/2026",
  payment_date: "02/10/2026",
  paid_amount: 50,
  currency: "EUR",
  concept: "Pintura",
  notes: null,
  subtotal: 100,
  tax: 21,
  total: 121,
  warnings: [],
};
const id = "d22939cf-9556-4cd5-86f5-1546ec74b150";
const nextLink = {
  __esModule: true,
  default: ({ children, ...props }) =>
    React.createElement("a", props, children),
};

test("AI date normalization keeps invoice, due and paid dates distinct without using upload day", () => {
  const d = normalizeInvoiceDates(extractedInvoiceSchema.parse(extraction));
  assert.equal(d.issue_date, "2026-09-30");
  assert.equal(d.due_date, "2026-10-30");
  assert.equal(d.payment_date, "2026-10-02");
  assert.equal(d.paid_amount, 50);
  const invalid = normalizeInvoiceDates(
    extractedInvoiceSchema.parse({
      ...extraction,
      issue_date: "31/09/2026",
      payment_date: "02/10",
      due_date: null,
    }),
  );
  assert.equal(invalid.issue_date, null);
  assert.equal(invalid.payment_date, null);
  assert.equal(invalid.due_date, null);
  assert.equal(invalid.paid_amount, null);
  assert.ok(invalid.warnings.length >= 3);
  const missing = normalizeInvoiceDates(
    extractedInvoiceSchema.parse({
      ...extraction,
      issue_date: null,
      payment_date: null,
      paid_amount: null,
    }),
  );
  assert.equal(missing.issue_date, null);
  assert.equal(missing.payment_date, null);
});

test("invoice month bounds support previous years and December rollover", () => {
  assert.deepEqual(invoiceMonthRange("2025-12"), {
    key: "2025-12",
    start: "2025-12-01",
    end: "2026-01-01",
  });
  assert.deepEqual(invoiceMonthRange("2024-02"), {
    key: "2024-02",
    start: "2024-02-01",
    end: "2024-03-01",
  });
  for (const value of [undefined, "2026-13", "2026-00", "2026-1", "0000-01"])
    assert.equal(invoiceMonthRange(value), null);
});

test("private PDF is passed natively to Responses and only saved as a reviewed draft", async () => {
  let saved,
    called = 0;
  const q = {
    select: () => q,
    eq: () => q,
    single: async () => ({
      data: saved
        ? { id }
        : {
            file_path: "finance-scans/owner/doc.pdf",
            file_name: "Factura.pdf",
            file_type: "application/pdf",
            file_size: 8,
            status: "draft",
          },
    }),
    update(value) {
      saved = value;
      return q;
    },
  };
  const actions = load("actions/financeDocumentActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        supabase: {
          from(table) {
            assert.equal(table, "finance_documents");
            return q;
          },
          storage: {
            from: () => ({
              download: async () => ({ data: new Blob(["%PDF-1.7"]) }),
            }),
          },
        },
      }),
    },
    "next/cache": { revalidatePath() {} },
    "@/lib/openAiFinance": {
      financeAI: async (body) => {
        called++;
        const content = body.input[0].content[1];
        assert.equal(content.type, "input_file");
        assert.equal(content.filename, "Factura.pdf");
        assert.match(content.file_data, /^data:application\/pdf;base64,/);
        assert.doesNotMatch(JSON.stringify(body), /file_url/);
        assert.match(body.instructions, /No confundas esas fechas/);
        return {};
      },
      aiText: () => JSON.stringify(extraction),
    },
  });
  const result = await actions.scanFinancePhoto(id);
  assert.equal(called, 1);
  assert.equal(result.extracted.issue_date, "2026-09-30");
  assert.equal(result.extracted.payment_date, "2026-10-02");
  assert.deepEqual(Object.keys(saved), ["extracted"]);
});

test("PDF upload preparation accepts private finance files without weakening reviewer checks", async () => {
  const actions = load("actions/privateUploadActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        user: { id: "owner" },
        profile: { access_role: "owner" },
        supabase: {
          storage: {
            from: () => ({
              createSignedUploadUrl: async (path) => {
                assert.match(path, /^finance-scans\/owner\/.*\.pdf$/);
                return { data: { token: "private" } };
              },
            }),
          },
        },
      }),
    },
  });
  assert.equal(
    (
      await actions.preparePrivateUpload({
        name: "Factura.pdf",
        size: 10,
        type: "application/pdf",
        folder: "finance-scans",
      })
    ).file.type,
    "application/pdf",
  );
  const reviewer = load("actions/privateUploadActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        user: { id: "reviewer" },
        profile: { access_role: "reviewer", permissions_ready: true },
        supabase: {
          rpc: async (name) =>
            name === "reviewer_invoice_uploads_ready"
              ? { data: true }
              : { error: { code: "PGRST202" } },
        },
      }),
    },
  });
  assert.match(
    (
      await reviewer.preparePrivateUpload({
        name: "Factura.pdf",
        size: 10,
        type: "application/pdf",
        folder: "finance-scans",
      })
    ).error,
    /20261020_finance_pdf_uploads/,
  );
});

test("month filter uses invoice date, not created_at, and survives pagination", async () => {
  const calls = [];
  const q = {
    select: () => q,
    eq: () => q,
    gte: (...a) => {
      calls.push(["gte", ...a]);
      return q;
    },
    lt: (...a) => {
      calls.push(["lt", ...a]);
      return q;
    },
    order: () => q,
    range: () => q,
    returns: async () => ({ data: [], count: 30 }),
  };
  const page = load("app/finance/scan/page.tsx", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        profile: { access_role: "owner" },
        user: { id: "owner" },
        supabase: {
          from: (table) =>
            table === "finance_documents"
              ? q
              : { select: () => ({ order: async () => ({ data: [] }) }) },
        },
      }),
    },
    "@/components/TopBar": { TopBar: () => null },
    "@/components/InvoiceScanner": { InvoiceScanner: () => null },
    "next/link": nextLink,
  });
  const markup = renderToStaticMarkup(
    await page.default({
      searchParams: { status: "posted", month: "2025-12" },
    }),
  );
  assert.deepEqual(calls, [
    ["gte", "invoice_data->>issue_date", "2025-12-01"],
    ["lt", "invoice_data->>issue_date", "2026-01-01"],
  ]);
  assert.match(markup, /month=2025-12&amp;page=2/);
});

test("PDF card never renders an image with PDF bytes and date fields remain editable", () => {
  const { InvoiceScanner } = load("components/InvoiceScanner.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": nextLink,
    "@/actions/financeDocumentActions": {},
    "@/lib/uploadPrivateFile": {},
  });
  const markup = renderToStaticMarkup(
    React.createElement(InvoiceScanner, {
      aiReady: true,
      projects: [],
      documents: [
        {
          id,
          file_name: "Factura.pdf",
          file_type: "application/pdf",
          status: "draft",
          extracted: normalizeInvoiceDates(
            extractedInvoiceSchema.parse(extraction),
          ),
          invoice_data: {},
          created_at: "2026-10-19",
        },
      ],
    }),
  );
  assert.match(markup, /Subir PDF o fotos/);
  assert.match(markup, /Abrir PDF/);
  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, /name="issue_date"[^>]*value="2026-09-30"/);
  assert.match(markup, /name="payment_date"[^>]*value="2026-10-02"/);
});

test("invoice validation never substitutes missing or impossible dates", () => {
  const value = {
    ...extraction,
    issue_date: "2026-09-30",
    due_date: "2026-10-30",
    payment_date: "2026-10-02",
    project_id: null,
    tax_id: "",
    notes: "",
    method: "Transferencia",
    category: "Otros",
  };
  assert.equal(invoiceSchema.safeParse(value).success, true);
  for (const change of [
    { issue_date: "" },
    { issue_date: "2026-02-30" },
    { due_date: "2026-13-01" },
    { payment_date: null },
  ])
    assert.equal(
      invoiceSchema.safeParse({ ...value, ...change }).success,
      false,
    );
});

test("posting returns the months actually stored, including a retry with edited dates", async () => {
  const invoice = {
    ...extraction,
    issue_date: "2026-09-30",
    due_date: "2026-10-30",
    payment_date: "2026-10-02",
    project_id: null,
    tax_id: "",
    notes: "",
    method: "Transferencia",
    category: "Otros",
  };
  const actions = load("actions/financeDocumentActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        supabase: {
          rpc: async () => ({ error: null }),
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { status: "posted", invoice_data: invoice },
                }),
              }),
            }),
          }),
        },
      }),
    },
    "next/cache": { revalidatePath() {} },
  });
  const result = await actions.postFinanceDocument(id, {
    ...invoice,
    issue_date: "2026-11-01",
    payment_date: "2026-11-02",
  });
  assert.equal(result.invoiceMonth, "2026-09");
  assert.equal(result.financeMonth, "2026-10");
  assert.equal(result.invoice.issue_date, "2026-09-30");
});

test("private PDF originals retain authentication, MIME and no-cache headers", async () => {
  const filters = [];
  const q = {
    select: () => q,
    eq: (...v) => {
      filters.push(v);
      return q;
    },
    single: async () => ({
      data: {
        file_path: "finance-scans/reviewer/doc.pdf",
        file_type: "application/pdf",
      },
    }),
  };
  const route = load("app/finance/scan/[id]/file/route.ts", {
    "@/lib/auth": {
      requireUserProfile: async (access) => {
        assert.equal(access, "uploads");
        return {
          user: { id: "reviewer" },
          profile: { access_role: "reviewer", permissions_ready: true },
          supabase: {
            from: () => q,
            storage: {
              from: () => ({
                download: async () => ({ data: new Blob(["%PDF-1.7"]) }),
              }),
            },
          },
        };
      },
    },
  });
  const response = await route.GET({}, { params: { id } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "%PDF-1.7");
  assert.ok(
    filters.some(
      ([key, value]) => key === "created_by" && value === "reviewer",
    ),
  );
  assert.ok(
    filters.some(([key, value]) => key === "status" && value === "draft"),
  );
});
