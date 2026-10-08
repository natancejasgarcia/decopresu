const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const path = require("node:path");
const filename = path.resolve("lib/briefing.ts");
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  filename,
);
const { briefingSceneSchema, briefingFingerprint, EMPTY_BRIEFING } =
  compiled.exports;
const item = {
  id: "test",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 330,
  height: 200,
  version: 1,
  versionNonce: 5,
  isDeleted: false,
};

test("scene keeps native drawing data and private photos, never iframe/SVG", () => {
  const scene = {
    ...EMPTY_BRIEFING,
    elements: [{ ...item, customData: { kind: "note" }, groupIds: ["group"] }],
  };
  assert.deepEqual(briefingSceneSchema.parse(scene), scene);
  assert.equal(
    briefingSceneSchema.safeParse({
      ...scene,
      elements: [{ ...item, type: "iframe" }],
    }).success,
    false,
  );
  const files = {
    photo: {
      id: "photo",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,AQ==",
      created: 1,
    },
  };
  assert.equal(
    briefingSceneSchema.safeParse({ ...scene, files }).success,
    true,
  );
  assert.equal(
    briefingSceneSchema.safeParse({
      ...scene,
      files: {
        photo: { ...files.photo, dataURL: "https://example.com/photo.png" },
      },
    }).success,
    false,
  );
});
test("scene rejects excessive payloads, duplicate elements and invalid coordinates", () => {
  assert.equal(
    briefingSceneSchema.safeParse({ ...EMPTY_BRIEFING, elements: [item, item] })
      .success,
    false,
  );
  assert.equal(
    briefingSceneSchema.safeParse({
      ...EMPTY_BRIEFING,
      elements: [{ ...item, x: Infinity }],
    }).success,
    false,
  );
  assert.equal(
    briefingSceneSchema.safeParse({
      ...EMPTY_BRIEFING,
      elements: [{ ...item, text: "x".repeat(3_500_000) }],
    }).success,
    false,
  );
});
test("fingerprint tracks drawings, deletes and background, not selection or viewport", () => {
  const scene = { ...EMPTY_BRIEFING, elements: [item] };
  assert.notEqual(
    briefingFingerprint(scene),
    briefingFingerprint({ ...scene, elements: [{ ...item, version: 2 }] }),
  );
  assert.notEqual(
    briefingFingerprint(scene),
    briefingFingerprint({ ...scene, elements: [{ ...item, isDeleted: true }] }),
  );
  assert.notEqual(
    briefingFingerprint(scene),
    briefingFingerprint({
      ...scene,
      appState: { viewBackgroundColor: "#ff0000" },
    }),
  );
  assert.equal(
    briefingFingerprint(scene),
    briefingFingerprint({
      ...scene,
      selectedElementIds: { test: true },
      scrollX: 5,
    }),
  );
});
