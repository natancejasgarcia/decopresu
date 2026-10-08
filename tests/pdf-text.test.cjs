const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PDFDocument, PDFPage, StandardFonts } = require("pdf-lib");

const root = path.resolve(__dirname, "..");
const project = {
  id: "d22939cf-9556-4cd5-86f5-1546ec74b150",
  name: "Calle Luja - prueba de PDF",
  client_name: "Comunidad Calle Luja",
  client_phone: "",
  client_email: "",
  address: "Calle Luja",
  created_at: "2026-10-08T09:00:00Z",
};
const notes = "Gesti\u00f3n y tramitaci\u00f3n de licencia de obras, seg\u00fan corresponda, y autorizaci\u00f3n de ocupaci\u00f3n de v\u00eda p\u00fablica para plataforma elevadora y vallado de protecci\u00f3n. Incluye redacci\u00f3n del Estudio B\u00e1sico de Seguridad y Salud por t\u00e9cnico competente.\r\nNo incluye tasas municipales, tasas de ocupaci\u00f3n de v\u00eda p\u00fablica";
const items = [
  { concept: "Fachada Calle Luja/Ribera del marisco", notes: "Limpieza general de fachada mediante agua a alta presi\u00f3n.\nReparaci\u00f3n del soporte y aplicaci\u00f3n de dos manos de revestimiento.", quantity: 1266, unit: "m2", unit_price: 23.6, total: 29877.6 },
  { concept: "Pintado rejas", notes: "Limpieza, lijado y preparaci\u00f3n de rejas.\nAplicaci\u00f3n de imprimaci\u00f3n antioxidante y acabado con esmalte sint\u00e9tico.", quantity: 472, unit: "m2", unit_price: 15.3, total: 7221.6 },
  { concept: "Medios auxiliares", notes: "Montaje, alquiler y desmontaje de andamio y/o plataforma elevadora.", quantity: 1, unit: "", unit_price: 3800, total: 3800 },
  { concept: "Gesti\u00f3n de permisos y estudio b\u00e1sico", notes, quantity: 1, unit: "", unit_price: 960, total: 960 },
].map((item, index) => ({ ...item, id: String(index), sort_order: index + 1, created_at: project.created_at }));

function load(relative) {
  const file = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = module.paths;
  const original = compiled.require.bind(compiled);
  compiled.require = (name) => {
    if (name === "@/lib/supabaseServer") return {
      createServerSupabaseClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
        from(table) {
          const data = { profiles: { id: "profile" }, projects: project, budget_items: items, rooms: [] }[table];
          const query = {
            select() { return query; }, eq() { return query; }, order() { return query; },
            single: async () => ({ data }), returns: async () => ({ data }),
          };
          return query;
        },
      }),
    };
    return name.startsWith("@/") ? load(name.slice(2) + ".ts") : original(name);
  };
  compiled._compile(code, file);
  return compiled.exports;
}
const { safePdfText } = load("lib/pdfText.ts");

test("paragraph separators never become question marks", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  assert.throws(() => font.encodeText("\r"));
  assert.equal(safePdfText("competente.\r\nNo incluye tasas.\nOtra frase.\rFin.", font), "competente.\nNo incluye tasas.\nOtra frase.\nFin.");
  assert.equal(safePdfText("Uno\u2028Dos\u2029Tres\tCuatro", font), "Uno\nDos\nTres Cuatro");
});

test("accents, euro and genuine questions survive unsupported symbols", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const result = safePdfText("\u00bfIncluye IVA? S\u00ed: 960,00 \u20ac. \ud83d\ude00\u0000\u200b", font);
  assert.equal(result, "\u00bfIncluye IVA? S\u00ed: 960,00 \u20ac.  ");
  font.encodeText(result);
  assert.equal(safePdfText("\u201cTexto\u201d \u2014 \u2022 final\u2026", font), '"Texto" - - final...');
});

test("budget endpoint renders Calle Luja paragraphs separately without placeholders", async () => {
  const { GET } = load("app/projects/[id]/budget/pdf/route.ts");
  const drawn = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (text, options) {
    drawn.push(text);
    return original.call(this, text, options);
  };
  try {
    const response = await GET({}, { params: { id: project.id } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.ok(drawn.some(text => text.startsWith("No incluye tasas municipales")));
    assert.ok(drawn.every(text => !text.includes("?")));
    assert.ok(drawn.some(text => text.includes("41.859,20")));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 0);
    if (process.env.PDF_TEXT_PREVIEW) {
      const file = path.join(root, "tmp/pdfs/calle-luja-regression.pdf");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
    }
  } finally {
    PDFPage.prototype.drawText = original;
  }
});
