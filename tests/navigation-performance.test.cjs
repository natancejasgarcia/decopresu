const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-ts.cjs");
const { NextRequest } = require("next/server");
const { loadProjectPageData } = load("lib/projectPageData.ts");
const tabs = load("lib/projectTabs.ts");

function database(rows = {}, errors = {}) {
  const calls = [], signs = [];
  return {
    calls, signs,
    storage: { from(bucket) {
      assert.equal(bucket, "project-files");
      return { async createSignedUrls(paths, expires) {
        signs.push({ paths, expires });
        return { data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null };
      } };
    } },
    from(table) {
      const request = { table, filters: [] };
      const query = {
        select(columns) { request.columns = columns; return query; },
        eq(key, value) { request.filters.push([key, value]); return query; },
        not() { return query; }, neq() { return query; }, order() { return query; }, limit() { return query; },
        async returns() {
          calls.push(request);
          return { data: rows[table] ?? [], error: errors[table] ?? null };
        },
      };
      return query;
    },
  };
}

test("overview needs only budget totals, not files, finance, chat or concept history", async () => {
  const db = database({ budget_items: [{ total: 12.5 }, { total: "20" }] });
  const result = await loadProjectPageData(db, "project-a", "Resumen");
  assert.deepEqual(db.calls, [{ table: "budget_items", columns: "total", filters: [["project_id", "project-a"]] }]);
  assert.equal(result.budgetTotal, 32.5);
  for (const key of ["budgetItems", "files", "messages", "payments", "expenses", "rooms", "budgetConceptSuggestions"]) assert.deepEqual(result[key], []);
  assert.equal(db.signs.length, 0);
});

test("each project section loads only the data it uses", async () => {
  const expected = {
    Cliente: ["budget_items"],
    Chat: ["budget_items", "messages", "profiles"],
    Archivos: ["budget_items", "project_files"],
    Medidas: ["budget_items", "rooms", "room_modules"],
    Presupuesto: ["budget_items", "rooms", "room_modules", "budget_items"],
    Gastos: ["budget_items", "project_expenses", "project_payments"],
  };
  for (const [tab, tables] of Object.entries(expected)) {
    const db = database();
    await loadProjectPageData(db, "project-a", tab);
    assert.deepEqual(db.calls.map((call) => call.table), tables, tab);
    for (const call of db.calls) {
      if (call.table === "profiles" || call.columns === "concept,notes") continue;
      assert.deepEqual(call.filters, [["project_id", "project-a"]]);
    }
  }
});

test("files and receipts are signed in one deduplicated batch, not one request per file", async () => {
  const db = database({
    project_expenses: [{ id: "expense", receipt_file_url: "receipt.pdf" }],
    project_payments: [{ id: "payment", receipt_file_url: "receipt.pdf" }, { id: "cash", receipt_file_url: null }],
  });
  const data = await loadProjectPageData(db, "project-a", "Gastos");
  assert.deepEqual(db.signs, [{ paths: ["receipt.pdf"], expires: 3600 }]);
  assert.equal(data.expenses[0].receipt_signed_url, "signed:receipt.pdf");
  assert.equal(data.payments[0].receipt_signed_url, "signed:receipt.pdf");
  assert.equal(data.payments[1].receipt_signed_url, undefined);
  const files = database({ project_files: Array.from({ length: 300 }, (_, i) => ({ id: i, file_url: `${i}.png` })) });
  assert.equal((await loadProjectPageData(files, "project-a", "Archivos")).files.length, 300);
  assert.equal(files.signs.length, 1);
  assert.equal(files.signs[0].paths.length, 300);
});

test("chat names, budget order, room modules and legacy missing tables are preserved", async () => {
  const chat = database({ messages: [{ user_id: "user", text: "Hola" }], profiles: [{ user_id: "user", name: "Autor" }] });
  assert.equal((await loadProjectPageData(chat, "project-a", "Chat")).messages[0].user_name, "Autor");
  const db = database({
    budget_items: [{ id: "b", concept: "Dos", total: 2, sort_order: 2 }, { id: "a", concept: "Uno", total: 1, sort_order: 1 }],
    rooms: [{ id: "room" }], room_modules: [{ id: "module", room_id: "room" }],
  });
  const data = await loadProjectPageData(db, "project-a", "Presupuesto");
  assert.deepEqual(data.budgetItems.map((item) => item.id), ["a", "b"]);
  assert.equal(data.rooms[0].modules[0].id, "module");
  await loadProjectPageData(database({}, { room_modules: { code: "42P01" } }), "project-a", "Medidas");
  await assert.rejects(loadProjectPageData(database({}, { budget_items: { message: "DB unavailable" } }), "project-a", "Resumen"), /DB unavailable/);
});

test("tab URLs preserve deep links and reject unknown tabs", () => {
  assert.equal(tabs.parseProjectTab("Archivos"), "Archivos");
  assert.equal(tabs.parseProjectTab("unknown"), "Resumen");
  assert.equal(tabs.projectTabHref("id", "Presupuesto"), "/projects/id?tab=Presupuesto");
  assert.equal(tabs.projectTabHref("id", "Resumen"), "/projects/id");
});

function auth(role = "owner", mode = "workspace", options = {}) {
  let rpcStarted = false;
  let releaseProfile;
  const profileReady = new Promise((resolve) => { releaseProfile = resolve; });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user", email: options.email ?? "owner@example.test" } } }) },
    from() { return { select() { return this; }, eq() { return this; }, async single() {
      await profileReady;
      assert.equal(rpcStarted, true, "role lookup must start without waiting for profile lookup");
      return { data: { user_id: "user", name: "Owner", role: "admin" } };
    } }; },
    async rpc() { rpcStarted = true; releaseProfile(); return { data: role, error: options.error ?? null }; },
  };
  const { requireUserProfile } = load("lib/auth.ts", {
    "@/lib/supabaseServer": { createServerSupabaseClient: () => client },
    "next/navigation": { redirect(url) { throw new Error(`Redirect: ${url}`); } },
  });
  return requireUserProfile(mode);
}

test("parallel access checks still enforce owner and reviewer restrictions", async () => {
  assert.equal((await auth()).profile.access_role, "owner");
  assert.equal((await auth("reviewer", "dashboard")).profile.access_role, "reviewer");
  await assert.rejects(auth("reviewer", "workspace"), /Redirect: \/dashboard/);
  await assert.rejects(auth("workspace", "owner"), /Redirect: \/validations/);
  assert.equal((await auth(null, "dashboard", { error: { code: "missing" }, email: "decoralia1977@gmail.com" })).profile.access_role, "reviewer");
});

test("middleware avoids duplicate page role queries and keeps reviewer redirects and PDF guards", async () => {
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test";
  try {
    let calls = 0, checks = 0, signedIn = true;
    const { middleware } = load("middleware.ts", {
      "./lib/access": load("lib/access.ts"),
      "@supabase/ssr": { createServerClient: () => ({
        auth: { getUser: async () => { checks++; return { data: { user: signedIn ? { email: "decoralia1977@gmail.com" } : null } }; } },
        rpc: async () => { calls++; return { data: "reviewer" }; },
      }) },
    });
    for (const path of ["/dashboard", "/validations", "/finance/scan", "/login", "/logout"]) await middleware(new NextRequest(`https://example.test${path}`));
    assert.equal(calls, 0);
    assert.equal(checks, 5);
    const restricted = await middleware(new NextRequest("https://example.test/projects"));
    assert.equal(calls, 0);
    assert.equal(restricted.headers.get("location"), "https://example.test/dashboard");
    await middleware(new NextRequest("https://example.test/projects/project/budget/pdf"));
    assert.equal(calls, 1);
    signedIn = false;
    const loggedOut = await middleware(new NextRequest("https://example.test/dashboard"));
    assert.equal(loggedOut.headers.get("location"), "https://example.test/login");
  } finally {
    for (const [i, name] of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].entries()) {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    }
  }
});
