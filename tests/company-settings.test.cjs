const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { NextRequest } = require("next/server");
const { redirect } = require("next/navigation");
const load = require("./load-ts.cjs");
const company = { id: 1, legal_name: "EMPRESA FICTICIA", tax_id: "NIF-FICTICIO", address: "Direccion ficticia", email: "", phone: "", iban: "CUENTA-DE-PRUEBA", invoice_series: "F", delivery_series: "A" };

function saveAction(options = {}) {
  let writes = 0, stored;
  const invalidations = [];
  const { saveCompanyAction } = load("actions/salesActions.ts", {
    "@/lib/auth": { requireUserProfile: async () => ({ supabase: { from(table) {
      assert.equal(table, "company_settings");
      return {
        upsert(value) { writes++; stored = value; return this; },
        select(columns) { assert.equal(columns, "*"); return this; },
        single: async () => ({ data: options.noData ? null : stored, error: options.error ?? null }),
      };
    } } }) },
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
  });
  return { save: saveCompanyAction, invalidations, writes: () => writes, stored: () => stored };
}

test("company save returns the actual persisted settings including IBAN, not just an unconfirmed OK", async () => {
  const action = saveAction();
  const result = await action.save({ ...company, id: 999 });
  assert.deepEqual(result, { ok: true, settings: company });
  assert.equal(action.stored().id, 1);
  assert.deepEqual(action.invalidations, [["/settings"], ["/sales", "layout"]]);
  assert.equal((await saveAction({ noData: true }).save(company)).ok, false);
  assert.match((await saveAction({ error: { code: "42501", message: "denied" } }).save(company)).error, /permiso/);
});

test("invalid fiscal data, email, IBAN length and invoice series never reach the database", async () => {
  for (const [field, value, expected] of [["tax_id", "", /NIF/], ["email", "invalid", /correo/], ["iban", "X".repeat(41), /IBAN/], ["invoice_series", "lowercase", /series/]]) {
    const action = saveAction();
    const result = await action.save({ ...company, [field]: value });
    assert.equal(result.ok, false);
    assert.match(result.error, expected);
    assert.equal(action.writes(), 0);
  }
});

function request(body = company, headers = {}) {
  return new NextRequest("https://example.test/settings/company", { method: "PUT", headers: { "content-type": "application/json", origin: "https://example.test", ...headers }, body: JSON.stringify(body) });
}

test("JSON endpoint returns success, validation failures and expired sessions without redirecting the form", async () => {
  let call = 0, behavior = () => ({ ok: true, settings: company });
  const { PUT } = load("app/settings/company/route.ts", { "@/actions/salesActions": { saveCompanyAction: async () => { call++; return behavior(); } } });
  let response = await PUT(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, settings: company });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const internal = new NextRequest("http://localhost:3035/settings/company", { method: "PUT", headers: { "content-type": "application/json", host: "127.0.0.1:3035", origin: "http://127.0.0.1:3035" }, body: JSON.stringify(company) });
  assert.equal((await PUT(internal)).status, 200);
  behavior = () => ({ ok: false, error: "Revisa el NIF" });
  assert.equal((await PUT(request())).status, 422);
  behavior = () => redirect("/login");
  response = await PUT(request());
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("location"), null);
  behavior = () => redirect("/dashboard");
  assert.equal((await PUT(request())).status, 403);
  const before = call;
  assert.equal((await PUT(request(company, { origin: "https://other.test" }))).status, 403);
  assert.equal((await PUT(request(company, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await PUT(request(company, { "content-length": "20000" }))).status, 413);
  assert.equal(call, before);
});

test("route keeps the real authorization guard: reviewer and missing-profile users cannot save", async () => {
  let role = "reviewer", hasProfile = true, hasUser = true, writes = 0;
  const { PUT } = load("app/settings/company/route.ts", {
    "@/lib/supabaseServer": { createServerSupabaseClient: () => ({
      auth: { getUser: async () => ({ data: { user: hasUser ? { id: "user", email: "user@example.test" } : null } }) },
      from(table) {
        if (table === "company_settings") { writes++; throw new Error("Unexpected write"); }
        return { select() { return this; }, eq() { return this; }, single: async () => ({ data: hasProfile ? { user_id: "user", name: "User", role: "admin" } : null }) };
      },
      rpc: async () => ({ data: role, error: null }),
    }) },
    "next/cache": { revalidatePath() {} },
  });
  assert.equal((await PUT(request())).status, 403);
  role = "workspace"; hasProfile = false;
  assert.equal((await PUT(request())).status, 403);
  hasUser = false;
  assert.equal((await PUT(request())).status, 401);
  assert.equal(writes, 0);
});

test("browser transport handles 401, HTML redirects and network failures without discarding the submitted settings", async () => {
  const originalFetch = global.fetch;
  const { saveCompanySettings } = load("lib/companySettingsClient.ts");
  try {
    let response = new Response(JSON.stringify({ ok: true, settings: company }), { status: 200 });
    global.fetch = async (url, options) => {
      assert.equal(url, "/settings/company"); assert.equal(options.method, "PUT"); assert.equal(options.redirect, "error");
      assert.equal(JSON.parse(options.body).iban, company.iban);
      return response;
    };
    assert.deepEqual(await saveCompanySettings(company), { ok: true, settings: company });
    response = new Response("{}", { status: 401 });
    assert.equal((await saveCompanySettings(company)).requiresLogin, true);
    response = new Response("<html>Login</html>", { status: 200 });
    assert.match((await saveCompanySettings(company)).error, /confirmar/);
    response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    assert.equal((await saveCompanySettings(company)).ok, false);
    global.fetch = async () => { throw new Error("Network failed"); };
    assert.match((await saveCompanySettings(company)).error, /conexion/);
    assert.equal(company.iban, "CUENTA-DE-PRUEBA");
  } finally { global.fetch = originalFetch; }
});

function formHarness(save, onSaved) {
  const state = []; let cursor = 0;
  const react = {
    ...React,
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next) => { state[i] = typeof next === "function" ? next(state[i]) : next; }]; },
    useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  };
  const { CompanySettingsForm } = load("components/CompanySettingsForm.tsx", { react, "@/lib/companySettingsClient": { saveCompanySettings: save } });
  return { render() { cursor = 0; return CompanySettingsForm({ initial: company, available: true, onSaved }); } };
}
function find(node, condition) {
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, condition); if (found) return found; } return null; }
  if (!node || typeof node !== "object") return null;
  return condition(node) ? node : find(node.props?.children, condition);
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node ? text(node.props?.children) : "";
}

test("form preserves the IBAN after a failed save, unlocks retry, and reports success only after confirmation", async () => {
  let release, saves = 0, saved;
  const h = formHarness(async () => { saves++; return new Promise((resolve) => { release = resolve; }); }, (value) => { saved = value; });
  let tree = h.render();
  const iban = find(tree, (node) => node.type === "input" && node.props.value === company.iban);
  iban.props.onChange({ target: { value: "CUENTA-FICTICIA-EDITADA" } });
  tree = h.render();
  const submit = () => h.render().props.onSubmit({ preventDefault() {} });
  submit(); submit();
  assert.equal(saves, 1);
  assert.equal(find(h.render(), (node) => node.type === "button").props.disabled, true);
  release({ ok: false, requiresLogin: true, error: "Sesion caducada" });
  await new Promise((resolve) => setImmediate(resolve));
  tree = h.render();
  assert.ok(find(tree, (node) => node.type === "input" && node.props.value === "CUENTA-FICTICIA-EDITADA"));
  assert.equal(find(tree, (node) => node.type === "button").props.disabled, false);
  assert.equal(find(tree, (node) => node.type === "a").props.target, "_blank");
  assert.equal(saved, undefined);
  submit();
  release({ ok: true, settings: { ...company, iban: "CUENTA-FICTICIA-EDITADA" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(text(h.render()), /Datos de empresa guardados/);
  assert.equal(saved.iban, "CUENTA-FICTICIA-EDITADA");
});

test("middleware preserves every refreshed session cookie, including on redirects; JSON handler owns save authorization", async () => {
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], previous = names.map((key) => process.env[key]);
  process.env[names[0]] = "https://example.test"; process.env[names[1]] = "test";
  try {
    let user = null;
    const { middleware } = load("middleware.ts", {
      "./lib/access": load("lib/access.ts"),
      "@supabase/ssr": { createServerClient: (_url, _key, { cookies }) => ({
        auth: { getUser: async () => {
          cookies.set("session.0", "part-one", { path: "/" });
          cookies.set("session.1", "part-two", { path: "/" });
          cookies.remove("session.2", { path: "/", maxAge: 0 });
          return { data: { user } };
        } },
        rpc: async () => ({ data: "workspace" }),
      }) },
    });
    for (const req of [new NextRequest("https://example.test/settings"), request()]) {
      const response = await middleware(req);
      assert.equal(response.cookies.get("session.0").value, "part-one");
      assert.equal(response.cookies.get("session.1").value, "part-two");
      assert.equal(response.cookies.get("session.2").value, "");
      if (req.method === "PUT") assert.equal(response.headers.get("location"), null);
      else assert.equal(response.headers.get("location"), "https://example.test/login");
    }
    user = { id: "user", email: "user@example.test" };
    const login = await middleware(new NextRequest("https://example.test/login"));
    assert.equal(login.headers.get("location"), "https://example.test/dashboard");
    assert.equal(login.cookies.get("session.0").value, "part-one");
    assert.equal(login.cookies.get("session.1").value, "part-two");
  } finally { names.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
});
