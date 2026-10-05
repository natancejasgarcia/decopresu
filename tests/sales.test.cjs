const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(relative) {
  const file = path.join(root, relative);
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = module.paths;
  const original = compiled.require.bind(compiled);
  compiled.require = (name) =>
    name.startsWith("@/") ? load(name.slice(2) + ".ts") : original(name);
  compiled._compile(code, file);
  cache.set(file, compiled.exports);
  return compiled.exports;
}
const sales = load("lib/sales.ts");
const pdf = load("lib/salesPdf.ts");
const line = {
  concept: "Restauracion de madera",
  notes: "",
  quantity: 2,
  unit: "ud",
  unit_price: 130,
  vat_rate: 21,
};
const input = {
  client_name: "Cliente de prueba",
  client_tax_id: "B12345678",
  client_address: "Direccion de prueba",
  client_email: "",
  issue_date: "2026-10-05",
  due_date: "",
  notes: "",
  lines: [line],
};

test("line rounding and multiple VAT rates match the stored document", () => {
  const result = sales.salesTotals([
    line,
    { ...line, quantity: 3, unit_price: 0.335, vat_rate: 10 },
    { ...line, quantity: 1, unit_price: 80, vat_rate: 0 },
  ]);
  assert.equal(result.subtotal, 341.01);
  assert.equal(result.tax, 54.7);
  assert.equal(result.total, 395.71);
  assert.deepEqual(
    result.groups.map(([rate]) => rate),
    [0, 10, 21],
  );
});
test("validation handles decimal commas and rejects invalid amounts and dates", () => {
  const parsed = sales.salesDraftSchema.parse({
    ...input,
    lines: [{ ...line, quantity: "56,86", unit_price: "95" }],
  });
  assert.equal(parsed.lines[0].quantity, 56.86);
  for (const quantity of [0, -1, NaN, Infinity])
    assert.equal(
      sales.salesDraftSchema.safeParse({
        ...input,
        lines: [{ ...line, quantity }],
      }).success,
      false,
    );
  assert.equal(
    sales.salesDraftSchema.safeParse({ ...input, issue_date: "2026-02-30" })
      .success,
    false,
  );
  assert.equal(
    sales.salesDraftSchema.safeParse({ ...input, due_date: "2026-10-04" })
      .success,
    false,
  );
  assert.equal(
    sales.salesDraftSchema.safeParse({ ...input, lines: [] }).success,
    false,
  );
});
test("partial collections are isolated by invoice and never generate negative outstanding", () => {
  const doc = { id: "a", total: 314.6 };
  assert.deepEqual(
    sales.documentBalance(doc, [
      { sales_document_id: "a", amount: 100 },
      { sales_document_id: "b", amount: 900 },
    ]),
    { paid: 100, outstanding: 214.6 },
  );
  assert.deepEqual(
    sales.documentBalance(doc, [{ sales_document_id: "a", amount: 314.6 }]),
    { paid: 314.6, outstanding: 0 },
  );
});
test("PDF generation produces A4 pages for long descriptions and unsupported characters", async () => {
  const { PDFDocument } = require("pdf-lib");
  const document = {
    ...input,
    id: "test",
    kind: "invoice",
    status: "draft",
    number: null,
    source_label: "Obra ejemplo",
    lines: Array.from({ length: 18 }, (_, i) => ({
      ...line,
      concept: `Concepto ${i + 1} - pintura y restauracion`,
      notes:
        "Lijado, proteccion y dos manos de acabado. ".repeat(20) +
        "\nAcabado especial 🎨",
    })),
  };
  const bytes = await pdf.generateSalesPdf(document, {
    ...sales.DEFAULT_COMPANY,
    address: "Direccion de prueba",
    tax_id: "B12345678",
  });
  const result = await PDFDocument.load(bytes);
  assert.ok(result.getPageCount() > 2);
  for (const page of result.getPages()) {
    assert.equal(page.getWidth(), 595.28);
    assert.equal(page.getHeight(), 841.89);
  }
});
