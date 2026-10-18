const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-ts.cjs");
const { invoiceSchema } = load("lib/financeDocuments.ts");
const { fallbackAccess, reviewerPathAllowed } = load("lib/access.ts");

test("reviewer dashboard renders exactly two links without querying business data", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const page = load("app/dashboard/page.tsx", {
    "@/lib/auth": {
      requireUserProfile: async (access) => {
        assert.equal(access, "dashboard");
        return {
          profile: { access_role: "reviewer", name: "Decoralia" },
          supabase: {
            from: () => {
              throw new Error("Unexpected business query");
            },
          },
        };
      },
    },
    "@/components/TopBar": { TopBar: () => null },
    "@/lib/sales": {},
    "next/link": {
      __esModule: true,
      default: (props) => React.createElement("a", props),
    },
  });
  const markup = renderToStaticMarkup(await page.default());
  assert.equal((markup.match(/href=/g) || []).length, 2);
  assert.match(markup, /href="\/validations"/);
  assert.match(markup, /href="\/finance\/scan"/);
  assert.doesNotMatch(
    markup,
    /Empresa|Contabilidad|Nueva obra|Correos|Clientes/,
  );
});

test("reviewer uploads page never queries projects or exposes posting controls", async () => {
  const React = require("react"),
    { renderToStaticMarkup } = require("react-dom/server");
  const calls = [];
  const q = {
    select: (value) => {
      calls.push(["select", value]);
      return q;
    },
    eq: (...args) => {
      calls.push(["eq", ...args]);
      return q;
    },
    order: () => q,
    range: () => q,
    returns: async () => ({
      data: [
        {
          id: "file",
          file_name: "Propia.png",
          status: "draft",
          created_at: "2026-10-18",
        },
      ],
      count: 1,
    }),
  };
  const page = load("app/finance/scan/page.tsx", {
    "@/lib/auth": {
      requireUserProfile: async (access) => {
        assert.equal(access, "uploads");
        return {
          profile: { access_role: "reviewer", permissions_ready: true },
          user: { id: "reviewer" },
          supabase: {
            rpc: async () => ({ data: true }),
            from: (table) => {
              assert.equal(table, "finance_documents");
              return q;
            },
          },
        };
      },
    },
    "@/components/TopBar": { TopBar: () => null },
    "@/components/InvoiceScanner": {
      InvoiceScanner: (props) => {
        assert.equal(props.uploadOnly, true);
        assert.equal(props.aiReady, false);
        assert.deepEqual(props.projects, []);
        assert.deepEqual(props.documents[0].invoice_data, {});
        return React.createElement("span", null, "Subir fotos");
      },
    },
    "next/link": {
      __esModule: true,
      default: (props) => React.createElement("a", props),
    },
  });
  const markup = renderToStaticMarkup(
    await page.default({ searchParams: { status: "posted" } }),
  );
  assert.ok(
    calls.some(
      (c) => c[0] === "eq" && c[1] === "created_by" && c[2] === "reviewer",
    ),
  );
  assert.ok(
    calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "draft"),
  );
  assert.doesNotMatch(markup, /Contabilizadas|Volver a Finanzas/);
  assert.match(markup, /Volver al inicio/);
});

test("reviewer cannot prepare validation uploads or bypass missing upload permissions", async () => {
  const actions = load("actions/privateUploadActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        profile: { access_role: "reviewer", permissions_ready: true },
        user: { id: "reviewer" },
        supabase: {
          rpc: async () => ({ error: { message: "missing" } }),
          storage: {
            from: () => {
              throw new Error("Unexpected storage access");
            },
          },
        },
      }),
    },
  });
  assert.match(
    (
      await actions.preparePrivateUpload({
        folder: "validations",
        name: "x.pdf",
        type: "application/pdf",
        size: 10,
      })
    ).error,
    /Solo puedes/,
  );
  assert.match(
    (
      await actions.preparePrivateUpload({
        folder: "finance-scans",
        name: "x.png",
        type: "image/png",
        size: 10,
      })
    ).error,
    /Falta activar/,
  );
});

test("server authorization blocks direct pages/actions for reviewer and reserves history for owner", async () => {
  let role = "reviewer";
  const db = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user", email: "decoralia1977@gmail.com" } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { user_id: "user", name: "Decoralia", role: "admin" },
          }),
        }),
      }),
    }),
    rpc: async () => ({ data: role, error: null }),
  };
  const auth = load("lib/auth.ts", {
    "next/navigation": {
      redirect: (path) => {
        throw new Error(`redirect:${path}`);
      },
    },
    "@/lib/supabaseServer": { createServerSupabaseClient: () => db },
  });
  await assert.rejects(() => auth.requireUserProfile(), /redirect:\/dashboard/);
  assert.equal(
    (await auth.requireUserProfile("validations")).profile.access_role,
    "reviewer",
  );
  assert.equal(
    (await auth.requireUserProfile("dashboard")).profile.access_role,
    "reviewer",
  );
  assert.equal(
    (await auth.requireUserProfile("uploads")).profile.access_role,
    "reviewer",
  );
  role = "workspace";
  await assert.rejects(
    () => auth.requireUserProfile("owner"),
    /redirect:\/validations/,
  );
  role = "owner";
  assert.equal(
    (await auth.requireUserProfile("owner")).profile.access_role,
    "owner",
  );
});

test("scanned invoice totals separate income, expenses and pending amounts", async () => {
  const result = await data.readFinanceDataset(
    client([
      {
        status: "posted",
        invoice_data: {
          direction: "income",
          subtotal: 100,
          tax: 21,
          total: 121,
          paid_amount: 47.7,
        },
      },
      {
        status: "posted",
        invoice_data: {
          direction: "expense",
          subtotal: 10,
          tax: 2.1,
          total: 12.1,
          paid_amount: 12.1,
        },
      },
    ]),
    {
      dataset: "scanned_invoices",
      project_id: null,
      from: null,
      to: null,
      search: null,
    },
  );
  assert.equal(result.totals, null);
  assert.equal(
    result.groups["posted / income"].totals.pending_at_registration,
    73.3,
  );
  assert.equal(result.groups["posted / expense"].totals.total, 12.1);
});

test("vision reads private image into a reviewed draft, never auto-posts", async () => {
  let written;
  const extracted = {
    direction: "expense",
    party_name: "Proveedor",
    tax_id: "B1",
    invoice_number: "F1",
    issue_date: "2026-10-18",
    currency: "EUR",
    concept: "Pintura",
    notes: null,
    subtotal: 100,
    tax: 21,
    total: 121,
    warnings: [],
  };
  const db = {
    from: (table) => {
      assert.equal(table, "finance_documents");
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => ({
          data: written
            ? { id: "document" }
            : {
                file_path: "private/photo.png",
                file_type: "image/png",
                file_size: 3,
                status: "draft",
              },
        }),
        update: (value) => {
          written = value;
          return q;
        },
      };
      return q;
    },
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob(["png"], { type: "image/png" }),
        }),
      }),
    },
  };
  const actions = load("actions/financeDocumentActions.ts", {
    "@/lib/auth": { requireUserProfile: async () => ({ supabase: db }) },
    "next/cache": { revalidatePath() {} },
    "@/lib/openAiFinance": {
      financeAI: async (body) => {
        assert.equal(body.text.format.strict, true);
        assert.match(
          body.input[0].content[1].image_url,
          /^data:image\/png;base64,/,
        );
        return {};
      },
      aiText: () => JSON.stringify(extracted),
    },
  });
  const result = await actions.scanFinancePhoto(crypto.randomUUID());
  assert.equal(result.extracted.total, 121);
  assert.deepEqual(Object.keys(written), ["extracted"]);
});
const invoice = {
  direction: "expense",
  project_id: null,
  party_name: "Proveedor",
  tax_id: "B12345678",
  invoice_number: "F1",
  issue_date: "2026-10-18",
  currency: "EUR",
  subtotal: 100,
  tax: 21,
  total: 121,
  paid_amount: 0,
  payment_date: null,
  method: "Transferencia",
  category: "Materiales",
  concept: "Pintura",
  notes: "",
};
test("re-registering the same uploaded photo never deletes its original", async () => {
  const removed = [];
  const original = "finance-scans/user/original.png";
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "existing", status: "draft", file_path: original },
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        info: async () => ({ data: { size: 3, contentType: "image/png" } }),
        download: async () => ({ data: new Blob(["png"]) }),
        remove: async (paths) => {
          removed.push(...paths);
          return {};
        },
      }),
    },
  };
  const actions = load("actions/financeDocumentActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        supabase: db,
        user: { id: "user" },
        profile: { access_role: "owner" },
      }),
    },
    "next/cache": { revalidatePath() {} },
  });
  const metadata = {
    path: original,
    name: "factura.png",
    type: "image/png",
    size: 3,
  };
  assert.equal((await actions.registerFinancePhoto(metadata)).duplicate, true);
  assert.deepEqual(removed, []);
  await actions.registerFinancePhoto({
    ...metadata,
    path: "finance-scans/user/copy.png",
  });
  assert.deepEqual(removed, ["finance-scans/user/copy.png"]);
});
test("mobile files with an empty MIME get a verified upload content type", async () => {
  let contentType;
  const uploads = load("lib/uploadPrivateFile.ts", {
    "@/actions/privateUploadActions": {
      preparePrivateUpload: async (input) => {
        assert.equal(input.type, "application/pdf");
        return {
          token: "test",
          file: {
            path: "validations/user/file.pdf",
            name: input.name,
            type: input.type,
            size: input.size,
          },
        };
      },
    },
    "@/lib/supabaseClient": {
      createBrowserSupabaseClient: () => ({
        storage: {
          from: () => ({
            uploadToSignedUrl: async (_path, _token, _file, options) => {
              contentType = options.contentType;
              return { error: null };
            },
          }),
        },
      }),
    },
  });
  await uploads.uploadPrivateFile(
    new File(["pdf"], "factura.pdf"),
    "validations",
  );
  assert.equal(contentType, "application/pdf");
});
test("reviewer never inherits legacy admin rights", () => {
  assert.equal(fallbackAccess("decoralia1977@gmail.com", "admin"), "reviewer");
  assert.equal(fallbackAccess("other@example.test", "admin"), "owner");
  for (const path of ["/finance", "/projects", "/notes", "/sales"])
    assert.equal(reviewerPathAllowed(path), false);
  assert.equal(reviewerPathAllowed("/validations/id/pdf"), true);
  for (const path of ["/dashboard", "/finance/scan", "/finance/scan/id/file"])
    assert.equal(reviewerPathAllowed(path), true);
  for (const path of [
    "/dashboard/secret",
    "/finance/scan/id/delete",
    "/finance/assistant",
  ])
    assert.equal(reviewerPathAllowed(path), false);
});
test("invoice requires matching totals and real dates", () => {
  assert.equal(invoiceSchema.safeParse(invoice).success, true);
  for (const value of [
    { total: 120 },
    { paid_amount: 122, payment_date: "2026-10-18" },
    { paid_amount: 10 },
    { issue_date: "2026-02-30" },
    { total: 121.001 },
    { currency: "USD" },
    { direction: "unknown" },
  ])
    assert.equal(
      invoiceSchema.safeParse({ ...invoice, ...value }).success,
      false,
      JSON.stringify(value),
    );
});
function client(rows, options = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(["table", table]);
      const q = {
        select(...args) {
          calls.push(["select", ...args]);
          return q;
        },
        order() {
          return q;
        },
        range(from, to) {
          q.offset = from;
          q.to = to;
          return q;
        },
        eq(...a) {
          calls.push(["eq", ...a]);
          return q;
        },
        gte(...a) {
          calls.push(["gte", ...a]);
          return q;
        },
        lt(...a) {
          calls.push(["lt", ...a]);
          return q;
        },
        ilike(...a) {
          calls.push(["ilike", ...a]);
          return q;
        },
        then(resolve) {
          resolve(
            options.error
              ? { error: { message: "missing" }, data: null, count: null }
              : {
                  error: null,
                  data: rows.slice(q.offset, q.to + 1),
                  count: rows.length,
                },
          );
        },
      };
      return q;
    },
  };
}
const data = load("lib/financeAssistantData.ts");
const filters = {
  dataset: "payments",
  project_id: null,
  from: null,
  to: null,
  search: null,
};
test("assistant computes full paginated cents totals, not first 25 details", async () => {
  const db = client(
    Array.from({ length: 1101 }, (_, i) => ({ id: String(i), amount: "0.10" })),
  );
  const result = await data.readFinanceDataset(db, filters);
  assert.equal(result.count, 1101);
  assert.equal(result.totals.amount, 110.1);
  assert.equal(result.details.length, 25);
  assert.equal(result.complete, true);
});
test("assistant refuses arbitrary tables, SQL and unknown arguments", async () => {
  const db = client([]);
  for (const input of [
    { ...filters, dataset: "auth.users" },
    { ...filters, sql: "delete from projects" },
    { ...filters, project_id: "x or 1=1" },
  ])
    assert.match(
      (await data.readFinanceDataset(db, input)).error,
      /no permitida/,
    );
  assert.equal(db.calls.length, 0);
});
test("truncated data and failed queries never become complete totals", async () => {
  const result = await data.readFinanceDataset(
    client(Array.from({ length: 5001 }, () => ({ amount: 100 }))),
    filters,
  );
  assert.equal(result.complete, false);
  assert.equal(result.totals, null);
  const failed = await data.readFinanceDataset(
    client([], { error: true }),
    filters,
  );
  assert.match(failed.error, /No asumir/);
});
test("date ranges are inclusive and text search stays a parameter", async () => {
  const db = client([]);
  await data.readFinanceDataset(db, {
    ...filters,
    from: "2026-10-01",
    to: "2026-10-31",
    search: "paint%_",
  });
  assert.ok(db.calls.some((c) => c[0] === "lt" && c[2] === "2026-11-01"));
  assert.ok(db.calls.some((c) => c[0] === "ilike" && c[2] === "%paint  %"));
});
test("timestamp date filters use Madrid midnight across daylight saving", async () => {
  const db = client([]);
  await data.readFinanceDataset(db, {
    ...filters,
    dataset: "budgets",
    from: "2026-10-01",
    to: "2026-10-31",
  });
  assert.ok(
    db.calls.some((c) => c[0] === "gte" && c[2] === "2026-09-30T22:00:00.000Z"),
  );
  assert.ok(
    db.calls.some((c) => c[0] === "lt" && c[2] === "2026-10-31T23:00:00.000Z"),
  );
});
test("fixed costs are normalized, never described as cash payments", async () => {
  const result = await data.readFinanceDataset(
    client([
      { amount: 1200, frequency: "Anual", is_active: true },
      { amount: 600, frequency: "Trimestral", is_active: true },
      { amount: 100, frequency: "Mensual", is_active: false },
    ]),
    { ...filters, dataset: "fixed_costs" },
  );
  assert.equal(result.monthly_fixed_cost_forecast, 300);
});
test("private upload verifies owner prefix, type and size", async () => {
  const { verifiedUpload } = load("lib/privateUploads.ts");
  const db = {
    storage: {
      from: () => ({
        info: async () => ({
          data: { size: 10, contentType: "image/png" },
          error: null,
        }),
      }),
    },
  };
  const file = {
    path: "finance-scans/user/a.png",
    size: 10,
    type: "image/png",
    name: "a.png",
  };
  assert.equal(await verifiedUpload(db, "user", "finance-scans", file), true);
  assert.equal(await verifiedUpload(db, "other", "finance-scans", file), false);
  assert.equal(
    await verifiedUpload(db, "user", "finance-scans", { ...file, size: 11 }),
    false,
  );
});
test("review mutations require configured permissions before calling RPC", async () => {
  let called = false;
  const actions = load("actions/budgetValidationActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        profile: { permissions_ready: false },
        supabase: {
          rpc: () => {
            called = true;
          },
        },
      }),
    },
    "next/cache": { revalidatePath() {} },
  });
  const result = await actions.reviewValidation({
    id: crypto.randomUUID(),
    operation: "approve",
  });
  assert.match(result.error, /migracion/);
  assert.equal(called, false);
});
test("assistant round trip executes only read tool with session client", async () => {
  let rounds = 0;
  const db = client([{ amount: 477 }]);
  const actions = load("actions/financeAssistantActions.ts", {
    "@/lib/auth": {
      requireUserProfile: async () => ({
        profile: { permissions_ready: true },
        supabase: db,
      }),
    },
    "@/lib/openAiFinance": {
      financeAI: async (body) => {
        rounds++;
        assert.equal(body.tools[0].name, "consultar_datos");
        if (rounds === 1)
          return {
            output: [
              {
                type: "function_call",
                name: "consultar_datos",
                call_id: "call1",
                arguments: JSON.stringify(filters),
              },
            ],
          };
        const output = JSON.parse(body.input.at(-1).output);
        assert.equal(output.totals.amount, 477);
        return {
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Cobrado: 477 EUR." }],
            },
          ],
        };
      },
      aiText: (response) => response.output[0].content[0].text,
    },
  });
  const result = await actions.askFinanceAssistant([
    { role: "user", content: "Cuanto hemos cobrado?" },
  ]);
  assert.match(result.answer, /477/);
  assert.equal(result.sources[0].count, 1);
  assert.equal(rounds, 2);
});
test("OpenAI helper uses Responses, server key and store false", async () => {
  const old = global.fetch;
  const key = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-not-a-real-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    return {
      ok: true,
      json: async () => ({ status: "completed", output: [] }),
    };
  };
  try {
    await load("lib/openAiFinance.ts").financeAI({ input: "test" });
  } finally {
    global.fetch = old;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
});
