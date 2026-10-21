const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
module.exports = function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const original = mod.require.bind(mod);
  mod.require = (name) =>
    name in mocks
      ? mocks[name]
      : name.startsWith("@/")
        ? load(
            name.slice(2) +
              (fs.existsSync(path.resolve(name.slice(2) + ".ts"))
                ? ".ts"
                : ".tsx"),
            mocks,
            cache,
          )
        : name.startsWith(".") && fs.existsSync(path.resolve(path.dirname(filename), name + ".ts"))
          ? load(path.resolve(path.dirname(filename), name + ".ts"), mocks, cache)
          : original(name);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  cache.set(filename, mod.exports);
  return mod.exports;
};
