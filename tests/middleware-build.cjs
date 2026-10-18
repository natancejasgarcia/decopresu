const assert = require("node:assert/strict");
const esbuild = require("../tmp/sales-verification/node_modules/esbuild");

async function main() {
  const result = await esbuild.build({
    entryPoints: ["middleware.ts"], bundle: true, write: false,
    platform: "browser", format: "esm", packages: "external", metafile: true,
    tsconfigRaw: { compilerOptions: {} },
  });
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  assert.ok(!imports.some(item => item.path.startsWith("@/")), "Standalone Edge bundle must not contain unresolved Next.js aliases");
  assert.ok(Object.keys(result.metafile.inputs).some(file => file.replaceAll("\\", "/").endsWith("lib/access.ts")), "The local access rules must be bundled, not left as an unsupported module");
  console.log("PASS: standalone Edge middleware includes access rules without Next.js aliases.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
