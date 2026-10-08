const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const file = path.resolve(__dirname, "../lib/budgetConcepts.ts");
const compiled = new Module(file, module);
compiled.filename = file;
compiled.paths = module.paths;
compiled._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  file,
);
const { buildBudgetConceptCatalog, findBudgetConceptSuggestions } =
  compiled.exports;

test("historical concepts keep the latest description and override starter templates", () => {
  const catalog = buildBudgetConceptCatalog([
    { concept: "  Pintura paredes  ", notes: "Descripcion propia actual" },
    { concept: "PINTURA PAREDES", notes: "Descripcion antigua" },
    { concept: "Lacado a medida", notes: "Acabado personalizado" },
    { concept: "Sin descripcion", notes: " " },
  ]);
  assert.deepEqual(catalog[0], {
    concept: "Pintura paredes",
    notes: "Descripcion propia actual",
  });
  assert.equal(
    catalog.filter((item) => item.concept.toLowerCase() === "pintura paredes")
      .length,
    1,
  );
  assert.ok(catalog.some((item) => item.concept === "Lacado a medida"));
  assert.ok(!catalog.some((item) => item.concept === "Sin descripcion"));
});

test("search ignores accents, case and spacing, accepts free titles and limits results", () => {
  const catalog = buildBudgetConceptCatalog([
    { concept: "Restauraci\u00f3n de madera", notes: "Restauracion" },
    { concept: "Pintura de paredes", notes: "Acabado" },
  ]);
  assert.equal(
    findBudgetConceptSuggestions(catalog, " RESTAURACION   MADERA ")[0].concept,
    "Restauraci\u00f3n de madera",
  );
  assert.equal(
    findBudgetConceptSuggestions(catalog, "paredes pintura").length,
    2,
  );
  assert.deepEqual(
    findBudgetConceptSuggestions(catalog, "Titulo totalmente nuevo"),
    [],
  );
  assert.equal(findBudgetConceptSuggestions(catalog, "").length, 8);
});

test("empty histories still provide editable titles with useful descriptions", () => {
  const catalog = buildBudgetConceptCatalog([
    { concept: "Pintura paredes", notes: "" },
  ]);
  assert.ok(catalog.every((item) => item.concept && item.notes));
  const result = findBudgetConceptSuggestions(catalog, "Pintura paredes");
  assert.equal(result[0].concept, "Pintura paredes");
  assert.ok(result[0].notes.includes("Preparacion"));
  assert.equal("unit_price" in result[0], false);
});
