const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const userId = "00000000-0000-0000-0000-000000000001";
const expenseId = "00000000-0000-0000-0000-000000000002";

function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  const requireOriginal = mod.require.bind(mod);
  mod.require = (name) =>
    name in mocks
      ? mocks[name]
      : name.startsWith("@/")
        ? load(name.slice(2) + ".ts", mocks, cache)
        : requireOriginal(name);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  cache.set(filename, mod.exports);
  return mod.exports;
}
const shared = load("lib/expenseReceipts.ts");
function form(receipt) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    expense_id: expenseId,
    project_id: "",
    category: "Materiales",
    supplier: "",
    concept: "Pintura",
    amount: "12.50",
    expense_date: "2026-10-13",
    is_paid: "on",
    notes: "",
  }))
    data.set(key, value);
  if (receipt) data.set("uploaded_receipt", JSON.stringify(receipt));
  return data;
}
function setup(options = {}) {
  const calls = [];
  const rows = new Map();
  const invalidations = [];
  const bucket = {
    async info(file) {
      calls.push(["info", file]);
      return options.infoError
        ? { data: null, error: { message: "Storage unavailable" } }
        : {
            data: {
              size: options.size ?? 6 * 1024 * 1024,
              contentType: "image/png",
            },
            error: null,
          };
    },
    async upload(file) {
      calls.push(["upload", file]);
      return {
        error: options.uploadError ? { message: "Upload failed" } : null,
      };
    },
    async createSignedUploadUrl(file) {
      calls.push(["sign", file]);
      return { data: { token: "test-token" }, error: null };
    },
  };
  const db = {
    storage: {
      from() {
        return bucket;
      },
    },
    from(table) {
      let id;
      return {
        select() {
          return this;
        },
        eq(_key, value) {
          id = value;
          return this;
        },
        async maybeSingle() {
          return { data: rows.get(id) ?? null, error: null };
        },
        async limit() {
          return {
            data: [],
            error: options.schemaError
              ? {
                  code: "42703",
                  message: "column receipt_file_name does not exist",
                }
              : null,
          };
        },
        async insert(row) {
          calls.push(["insert", table]);
          if (options.insertError)
            return {
              error: {
                code: "42703",
                message: "column receipt_file_name does not exist",
              },
            };
          rows.set(row.id, { ...row });
          return { error: null };
        },
      };
    },
  };
  const mocks = {
    "@/lib/auth": {
      requireUserProfile: async () => ({ supabase: db, user: { id: userId } }),
    },
    "next/cache": { revalidatePath: (p) => invalidations.push(p) },
  };
  return {
    calls,
    rows,
    invalidations,
    mocks,
    actions: load("actions/financeActions.ts", mocks),
    prepare: load("actions/expenseReceiptActions.ts", mocks),
  };
}
const photo = {
  name: "ticket.png",
  type: "image/png",
  size: 6 * 1024 * 1024,
  path:
    shared.expenseReceiptPrefix(null, userId, expenseId) +
    "00000000-0000-0000-0000-000000000003.png",
};

test("accepts phone photos up to 10 MB, normalizes empty MIME, rejects unsupported files", () => {
  assert.throws(() => shared.expenseReceiptMetadata({ name: "ticket.png", type: "image/png", size: 0 }), /vacio/);
  assert.equal(
    shared.expenseReceiptMetadata({
      name: "TICKET.JPG",
      type: "",
      size: 6 * 1024 * 1024,
    }).type,
    "image/jpeg",
  );
  assert.equal(
    shared.expenseReceiptMetadata({
      name: "ticket.pdf",
      type: "application/octet-stream",
      size: 100,
    }).type,
    "application/pdf",
  );
  assert.throws(
    () => shared.expenseReceiptMetadata({ ...photo, size: 11 * 1024 * 1024 }),
    /10 MB/,
  );
  assert.throws(
    () =>
      shared.expenseReceiptMetadata({
        name: "ticket.svg",
        type: "image/svg+xml",
        size: 100,
      }),
    /Elige un PDF/,
  );
});
test("receipt paths are bound to the expense, user and project; traversal is rejected", () => {
  assert.equal(
    shared.validateExpenseReceiptPath(photo, null, userId, expenseId),
    true,
  );
  assert.equal(
    shared.validateExpenseReceiptPath(photo, null, expenseId, expenseId),
    false,
  );
  assert.equal(
    shared.validateExpenseReceiptPath(
      { ...photo, path: photo.path + "/../other.png" },
      null,
      userId,
      expenseId,
    ),
    false,
  );
});
test("missing receipt columns return an actionable error before uploading or inserting", async () => {
  const ctx = setup({ schemaError: true });
  const result = await ctx.prepare.prepareExpenseReceiptAction({
    ...photo,
    expense_id: expenseId,
    project_id: null,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /20260601_expense_receipts.sql/);
  assert.equal(ctx.calls.length, 0);
});
test("signed uploads are private, non-overwriting and scoped to the expense", async () => {
  const ctx = setup();
  const result = await ctx.prepare.prepareExpenseReceiptAction({
    ...photo,
    expense_id: expenseId,
    project_id: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.token, "test-token");
  assert.equal(
    shared.validateExpenseReceiptPath(result.receipt, null, userId, expenseId),
    true,
  );
});
test("a 6 MB photo bypasses Server Action payloads; cached retries do not upload again", async () => {
  let prepares = 0,
    uploads = 0;
  const mocks = {
    "@/actions/expenseReceiptActions": {
      prepareExpenseReceiptAction: async () => {
        prepares++;
        return { ok: true, token: "token", receipt: photo };
      },
    },
    "@/lib/supabaseClient": {
      createBrowserSupabaseClient: () => ({
        storage: {
          from: () => ({
            uploadToSignedUrl: async (_path, _token, file) => {
              uploads++;
              assert.equal(file.size, photo.size);
              return { error: null };
            },
          }),
        },
      }),
    },
  };
  const { prepareExpenseSubmission } = load(
    "lib/uploadExpenseReceipt.ts",
    mocks,
  );
  const file = new File([Buffer.alloc(photo.size)], photo.name, {
    type: photo.type,
  });
  const first = form();
  first.set("receipt", file);
  const result = await prepareExpenseSubmission(first, expenseId, null);
  assert.equal(result.formData.has("receipt"), false);
  assert.ok(JSON.stringify(Object.fromEntries(result.formData)).length < 2000);
  const second = form();
  second.set("receipt", file);
  await prepareExpenseSubmission(second, expenseId, result.cached);
  assert.equal(prepares, 1);
  assert.equal(uploads, 1);
});
test("storage verification failure never records a financial expense", async () => {
  const ctx = setup({ infoError: true });
  const result = await ctx.actions.createExpenseAction(form(photo));
  assert.equal(result.ok, false);
  assert.equal(ctx.rows.size, 0);
  assert.deepEqual(
    ctx.calls.map((c) => c[0]),
    ["info"],
  );
});
test("expense and receipt are committed in a single insert; retry does not duplicate", async () => {
  const ctx = setup();
  const first = await ctx.actions.createExpenseAction(form(photo));
  const retry = await ctx.actions.createExpenseAction(form(photo));
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(ctx.rows.size, 1);
  assert.equal(ctx.rows.get(expenseId).receipt_file_url, photo.path);
  assert.equal(ctx.rows.get(expenseId).amount, 12.5);
  assert.equal(ctx.calls.filter((c) => c[0] === "insert").length, 1);
  assert.ok(ctx.invalidations.includes("/finance"));
});
test("forged paths, missing columns and altered retries are recoverable errors", async () => {
  const forged = setup();
  assert.equal(
    (
      await forged.actions.createExpenseAction(
        form({ ...photo, path: "other-user/ticket.png" }),
      )
    ).ok,
    false,
  );
  assert.equal(forged.calls.length, 0);
  const schema = setup({ insertError: true });
  assert.equal(
    (await schema.actions.createExpenseAction(form(photo))).ok,
    false,
  );
  assert.equal(schema.rows.size, 0);
  const ctx = setup();
  await ctx.actions.createExpenseAction(form(photo));
  const changed = form(photo);
  changed.set("amount", "99");
  assert.equal((await ctx.actions.createExpenseAction(changed)).ok, false);
  assert.equal(ctx.rows.size, 1);
});
test("invalid inputs and failed legacy uploads do not create partial expenses", async () => {
  const ctx = setup({ uploadError: true });
  const invalid = form();
  invalid.set("concept", "");
  assert.equal((await ctx.actions.createExpenseAction(invalid)).ok, false);
  const legacy = form();
  legacy.set("receipt", new File(["png"], "ticket.png", { type: "image/png" }));
  assert.equal((await ctx.actions.createExpenseAction(legacy)).ok, false);
  assert.equal(ctx.rows.size, 0);
});
