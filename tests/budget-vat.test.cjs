const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { PDFPage, PDFDocument } = require("pdf-lib");
const load = require("./load-ts.cjs");
const vat = load("lib/budgetVat.ts");
const project = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "OBRA DE PRUEBA",
  client_name: "CLIENTE FICTICIO",
  client_phone: "",
  client_email: "",
  address: "Direccion ficticia",
  created_at: "2026-10-19T09:00:00Z",
};
const items = [
  {
    id: "item",
    concept: "Pintura de prueba",
    notes: "Preparacion y acabado",
    quantity: 100,
    unit: "m2",
    unit_price: 10,
    total: 1000,
    created_at: project.created_at,
  },
];

test("only 10 and 21 percent are accepted; old download links keep 21 percent", () => {
  for (const value of [undefined, null, 21, "21"])
    assert.equal(vat.budgetVatSchema.parse(value), 21);
  for (const value of [10, "10"])
    assert.equal(vat.budgetVatSchema.parse(value), 10);
  for (const value of [0, "", "abc", 4, -10, 22, "Infinity"])
    assert.equal(vat.budgetVatSchema.safeParse(value).success, false);
  assert.deepEqual(vat.budgetVatTotals(1000, 10), {
    taxableBase: 1000,
    vat: 100,
    total: 1100,
  });
  assert.deepEqual(vat.budgetVatTotals(1000, 21), {
    taxableBase: 1000,
    vat: 210,
    total: 1210,
  });
  assert.deepEqual(vat.budgetVatTotals(41859.2, 10), {
    taxableBase: 41859.2,
    vat: 4185.92,
    total: 46045.12,
  });
  assert.deepEqual(vat.budgetVatTotals(41859.2, 21), {
    taxableBase: 41859.2,
    vat: 8790.43,
    total: 50649.63,
  });
  assert.deepEqual(vat.budgetVatTotals(21.35, 10), {
    taxableBase: 21.35,
    vat: 2.14,
    total: 23.49,
  });
});

test("budget UI exposes both VAT choices beside download and a VAT-inclusive total", () => {
  const { BudgetBuilder } = load("components/BudgetBuilder.tsx", {
    "@/actions/budgetActions": {},
    "@/actions/projectVatActions": {},
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
  });
  const html = renderToStaticMarkup(
    React.createElement(BudgetBuilder, {
      projectId: project.id,
      items,
      rooms: [],
    }),
  );
  assert.match(html, /IVA de la obra/);
  assert.match(html, /type="radio"[^>]*value="10"/);
  assert.match(html, /type="radio"[^>]*checked=""[^>]*value="21"/);
  assert.match(html, /Descargar PDF/);
  assert.match(html, /Total con IVA/);
  assert.match(html, /1210,00/);
});

test("PDF endpoint prints the selected VAT and matching rounded totals; rejects unsupported VAT", async () => {
  const { GET } = load("app/projects/[id]/budget/pdf/route.ts", {
    "@/lib/supabaseServer": {
      createServerSupabaseClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "test" } } }) },
        from(table) {
          const query = {
            select() {
              return query;
            },
            eq() {
              return query;
            },
            order() {
              return query;
            },
            single: async () => ({
              data: table === "profiles" ? { id: "profile" } : project,
            }),
            returns: async () => ({
              data: table === "budget_items" ? items : [],
            }),
          };
          return query;
        },
      }),
    },
  });
  const original = PDFPage.prototype.drawText;
  let texts = [];
  PDFPage.prototype.drawText = function (text, options) {
    texts.push(text);
    return original.call(this, text, options);
  };
  try {
    for (const [rate, total] of [
      [10, "1100,00"],
      [21, "1210,00"],
    ]) {
      texts = [];
      const response = await GET(
        {
          nextUrl: new URL(
            `https://example.test/projects/${project.id}/budget/pdf?vat_rate=${rate}`,
          ),
        },
        { params: { id: project.id } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /application\/pdf/);
      assert.ok(texts.includes(`IVA (${rate}%):`));
      assert.ok(texts.some((text) => text.includes("CIF/NIF: B05673124")));
      assert.ok(texts.some((text) => text.includes("Calle Fenix, bloque 10, 2B")));
      assert.ok(texts.some((text) => text.includes(total)));
      assert.ok(!texts.includes(`IVA (${rate === 10 ? 21 : 10}%):`));
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
      if (process.env.BUDGET_VAT_PREVIEW) {
        fs.mkdirSync(path.resolve("tmp/pdfs"), { recursive: true });
        fs.writeFileSync(
          path.resolve(`tmp/pdfs/presupuesto-iva-${rate}.pdf`),
          bytes,
        );
      }
    }
    const invalid = await GET(
      { nextUrl: new URL("https://example.test/pdf?vat_rate=5") },
      { params: { id: project.id } },
    );
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /10 % o del 21 %/);
  } finally {
    PDFPage.prototype.drawText = original;
  }
});

test("print view uses the same selected VAT and totals as the downloadable PDF", async () => {
  const { default: PrintPage } = load(
    "app/projects/[id]/budget/print/page.tsx",
    {
      "@/lib/auth": {
        requireUserProfile: async () => ({
          supabase: {
            from(table) {
              const query = {
                select() {
                  return query;
                },
                eq() {
                  return query;
                },
                order() {
                  return query;
                },
                single: async () => ({ data: project }),
                returns: async () => ({ data: items }),
              };
              return query;
            },
          },
        }),
      },
      "next/link": {
        __esModule: true,
        default: ({ children, ...props }) =>
          React.createElement("a", props, children),
      },
      "next/navigation": {
        notFound() {
          throw new Error("Not found");
        },
      },
    },
  );
  for (const [rate, total] of [
    ["10", "1100,00"],
    ["21", "1210,00"],
  ]) {
    const html = renderToStaticMarkup(
      await PrintPage({
        params: { id: project.id },
        searchParams: { vat_rate: rate },
      }),
    );
    assert.ok(html.includes(`IVA (${rate}%):`));
    assert.ok(html.includes("CIF/NIF: B05673124"));
    assert.ok(html.includes("Calle Fénix, bloque 10, 2B"));
    assert.ok(html.includes(total));
  }
});
