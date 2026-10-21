const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
const { NextRequest } = require("next/server");
const load = require("./load-ts.cjs");
const { navigationUser } = load("lib/navigationIdentity.ts");
const { loadProjectsList, projectsPageHref, PROJECTS_PAGE_SIZE } = load("lib/projectsList.ts");

test("server functions run beside the Ireland database, without multi-region expansion", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  assert.deepEqual(config.regions, ["dub1"]);
});

test("menus and dashboard shortcuts do not eagerly load authenticated pages", () => {
  for (const file of ["components/MainNavigation.tsx", "components/ReviewerDashboard.tsx", "components/ProjectTabs.tsx", "app/dashboard/page.tsx"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const links = source.match(/<Link\b[^>]*>/g) ?? [];
    assert.ok(links.length, file);
    for (const link of links) assert.match(link, /prefetch=\{false\}/, file);
  }
});

test("navigation uses real ES256 signature verification: forged or expired tokens fail closed", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test", alg: "ES256", use: "sig" };
  const client = createClient("https://example.test", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async () => { throw new Error("Unexpected auth network request"); } } });
  function jwt(exp) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "ES256", kid: "test", typ: "JWT" })}.${encode({ sub: "user", email: "user@example.test", aud: "authenticated", exp })}`;
    return `${unsigned}.${crypto.sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  }
  const valid = jwt(Math.floor(Date.now() / 1000) + 60);
  let token = valid;
  const auth = { getClaims: () => client.auth.getClaims(token, { jwks: { keys: [jwk] } }), getUser: () => { throw new Error("Duplicate user lookup"); } };
  assert.deepEqual(await navigationUser(auth), { id: "user", email: "user@example.test" });
  const parts = valid.split(".");
  const signature = Buffer.from(parts[2], "base64url"); signature[0] ^= 1;
  token = `${parts[0]}.${parts[1]}.${signature.toString("base64url")}`;
  assert.equal(await navigationUser(auth), null);
  token = jwt(Math.floor(Date.now() / 1000) - 60);
  assert.equal(await navigationUser(auth), null);
});

test("older SDK compatibility still uses a verified user lookup, never raw cookie claims", async () => {
  assert.equal(await navigationUser({ getClaims: async () => ({ data: null, error: null }) }), null);
  assert.equal(await navigationUser({ getUser: async () => ({ data: { user: null }, error: { message: "Denied" } }) }), null);
  assert.deepEqual(await navigationUser({ getUser: async () => ({ data: { user: { id: "user" } }, error: null }) }), { id: "user" });
});

function dbFixture({ count = 79, budgetCount = 3, optionalReads = false } = {}) {
  const calls = [];
  const db = { calls, from(table) {
    const call = { table, filters: [], orders: [] };
    const query = {
      select(columns, options) { call.columns = columns; call.count = options?.count; return query; },
      order(field, options) { call.orders.push([field, options]); return query; },
      eq(field, value) { call.filters.push(["eq", field, value]); return query; },
      neq(field, value) { call.filters.push(["neq", field, value]); return query; },
      in(field, value) { call.filters.push(["in", field, value]); return query; },
      or(value) { call.search = value; return query; },
      range(start, end) { call.range = [start, end]; return query; },
      returns() { return query; },
      then(resolve, reject) {
        calls.push(call);
        const ids = Array.from({ length: Math.min(PROJECTS_PAGE_SIZE, count - (call.range?.[0] ?? 0)) }, (_, i) => ({ id: `project-${(call.range?.[0] ?? 0) + i}`, name: `Project ${i}` }));
        let rows;
        if (table === "projects") rows = ids;
        if (table === "budget_items") rows = Array.from({ length: budgetCount }, () => ({ project_id: "project-0", total: 10 })).slice(call.range[0], call.range[1] + 1);
        if (table === "messages") rows = [{ project_id: "project-0", created_at: "2026-10-20T10:00:00Z" }, { project_id: "project-0", created_at: "2026-10-21T10:00:00Z" }];
        if (table === "project_reads") rows = [{ project_id: "project-0", last_read_at: "2026-10-20T18:00:00Z" }];
        return Promise.resolve({ data: rows, error: table === "project_reads" && optionalReads ? { code: "42P01" } : null, count: table === "projects" ? count : undefined }).then(resolve, reject);
      },
    };
    return query;
  } };
  return db;
}
const filters = { q: "", status: "Todos", type: "Todos" };

test("79 projects render in bounded pages; related totals/unread queries only cover the visible project IDs", async () => {
  const db = dbFixture();
  const result = await loadProjectsList(db, "user", filters);
  assert.equal(result.projects.length, 24);
  assert.equal(result.total, 79);
  assert.equal(result.pages, 4);
  assert.equal(result.budgetTotals.get("project-0"), 30);
  assert.equal(result.unreadCounts.get("project-0"), 1);
  assert.deepEqual(db.calls[0].range, [0, 23]);
  for (const call of db.calls.slice(1)) assert.deepEqual(call.filters.find(([op]) => op === "in")[2], result.projects.map((project) => project.id));
  assert.equal(db.calls.find((call) => call.table === "messages").columns, "project_id,created_at");
  assert.ok(db.calls.find((call) => call.table === "messages").filters.some(([op, field, value]) => op === "neq" && field === "user_id" && value === "user"));
});

test("project pagination preserves server-side filters and does not truncate totals at 1000 rows", async () => {
  const db = dbFixture({ budgetCount: 1001 });
  const result = await loadProjectsList(db, "user", { ...filters, q: "Calle", status: "Aprobado", type: "Laca" });
  assert.equal(result.budgetTotals.get("project-0"), 10010);
  assert.equal(db.calls.filter((call) => call.table === "budget_items").length, 2);
  assert.match(db.calls[0].search, /Calle/);
  assert.ok(db.calls[0].filters.some(([, field, value]) => field === "status" && value === "Aprobado"));
  assert.equal(projectsPageHref({ ...filters, q: "Juan Garcia", type: "Laca" }, 2), "/projects?q=Juan+Garcia&type=Laca&page=2");
  assert.equal(projectsPageHref(filters, 1), "/projects");
  const last = await loadProjectsList(dbFixture(), "user", { ...filters, page: "999" });
  assert.equal(last.page, 4);
  assert.equal(last.projects.length, 7);
  const empty = dbFixture({ count: 0 });
  assert.equal((await loadProjectsList(empty, "user", filters)).projects.length, 0);
  assert.equal(empty.calls.length, 1);
});

test("legacy read tables may be unavailable without hiding budgets or dropping unread messages", async () => {
  const result = await loadProjectsList(dbFixture({ optionalReads: true }), "user", filters);
  assert.equal(result.budgetTotals.get("project-0"), 30);
  assert.equal(result.unreadCounts.get("project-0"), 2);
});

test("finance signs only the selected month's receipts, retaining historical amounts for profitability", async () => {
  const receipts = [], captured = {};
  const expenses = [{ id: "new", project_id: "project", amount: 10, expense_date: "2026-10-05", receipt_file_url: "current.pdf" }, { id: "old", project_id: "project", amount: 20, expense_date: "2026-09-05", receipt_file_url: "old.pdf" }];
  const payments = [{ id: "pay", amount: 100, payment_date: "2026-10-10", receipt_file_url: "payment.pdf" }];
  const { default: Page } = load("app/finance/page.tsx", {
    "@/lib/auth": { requireUserProfile: async () => ({ profile: {}, supabase: { from(table) {
      const query = { select(value) { captured[table] = value; return query; }, order() { return query; }, returns: async () => ({ data: { projects: [], budget_items: [], project_expenses: expenses, project_payments: payments, fixed_costs: [] }[table], error: null }) };
      return query;
    } } }) },
    "@/lib/signedProjectFiles": { signProjectFileUrls: async (_db, paths) => { receipts.push(...paths); return new Map(paths.map((path) => [path, `signed:${path}`])); } },
    "@/components/TopBar": { TopBar: () => null },
    "@/components/FinanceDashboard": { FinanceDashboard: () => null },
  });
  const tree = await Page({ searchParams: { month: "2026-10" } });
  assert.deepEqual(receipts, ["current.pdf", "payment.pdf"]);
  assert.equal(captured.budget_items, "project_id,total");
  const dashboard = tree.props.children[1].props.children;
  assert.equal(dashboard.props.expenses.length, 2);
  assert.equal(dashboard.props.expenses[0].receipt_signed_url, "signed:current.pdf");
  assert.equal(dashboard.props.expenses[1].amount, 20);
});

test("slow-query diagnostics never log URLs, credentials, filters or customer data", async () => {
  const originalFetch = global.fetch, originalInfo = console.info;
  const logs = [];
  try {
    console.info = (...args) => logs.push(args.join(" "));
    global.fetch = async () => new Response("unavailable", { status: 503 });
    const { timedSupabaseFetch } = load("lib/supabaseTiming.ts");
    const response = await timedSupabaseFetch("server")("https://example.test/rest/v1/projects?client_name=PRIVATE", { headers: { authorization: "Bearer SECRET" } });
    assert.equal(response.status, 503);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /db.projects/);
    assert.match(logs[0], /executionRegion/);
    assert.doesNotMatch(logs[0], /PRIVATE|SECRET|example.test|authorization|client_name/);
  } finally { global.fetch = originalFetch; console.info = originalInfo; }
});
