const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const load = require("./load-ts.cjs");
const id = "00000000-0000-4000-8000-000000000001";

function actionHarness(result = { data: { id, is_highlighted: true }, error: null }) {
  const calls = [], paths = [];
  const query = {};
  for (const method of ["update", "eq", "select"]) query[method] = (...args) => {
    calls.push([method, ...args]); return query;
  };
  query.single = async () => result;
  const { setProjectHighlightAction } = load("actions/projectActions.ts", {
    "@/lib/auth": { requireUserProfile: async () => {
      calls.push(["auth"]);
      return { supabase: { from: table => { calls.push(["from", table]); return query; } } };
    } },
    "next/cache": { revalidatePath: path => paths.push(path) },
    "next/navigation": { redirect() {} },
  });
  return { action: setProjectHighlightAction, calls, paths };
}

test("highlight is authenticated, persisted as a boolean and never changes status or activity", async () => {
  const h = actionHarness();
  assert.deepEqual(await h.action({ project_id: id, highlighted: true }), { highlighted: true });
  assert.deepEqual(h.calls, [["auth"], ["from", "projects"], ["update", { is_highlighted: true }], ["eq", "id", id], ["select", "id, is_highlighted"]]);
  assert.deepEqual(h.paths, ["/projects"]);
  const clear = actionHarness({ data: { id, is_highlighted: false }, error: null });
  assert.deepEqual(await clear.action({ project_id: id, highlighted: false }), { highlighted: false });
});

test("invalid, missing and rejected records never report a successful save", async () => {
  const h = actionHarness();
  for (const input of [{ project_id: "bad", highlighted: true }, { project_id: id, highlighted: "false" }]) assert.ok((await h.action(input)).error);
  assert.equal(h.calls.length, 0);
  for (const result of [{ data: null, error: null }, { data: null, error: { code: "42501" } }]) {
    const failed = actionHarness(result);
    assert.ok((await failed.action({ project_id: id, highlighted: true })).error);
    assert.equal(failed.paths.length, 0);
  }
});

function cardHarness(action, initialHighlighted = false) {
  let cursor = 0;
  const state = [];
  const fakeReact = {
    ...React,
    useEffect() {},
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], next => { state[i] = typeof next === "function" ? next(state[i]) : next; }];
    },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
  };
  const { ProjectCardFrame } = load("components/ProjectCardFrame.tsx", {
    react: fakeReact,
    "@/actions/projectActions": { setProjectHighlightAction: action },
    "@/components/ProjectCardActions": { ProjectCardActions() {} },
  });
  const render = () => {
    cursor = 0;
    return ProjectCardFrame({ projectId: id, projectName: "Obra ficticia", initialHighlighted, statusClasses: "bg-red-50/30", unreadCount: 0, children: "Contenido" });
  };
  const button = tree => tree.props.children[1].props.highlightControl;
  return { render, button };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("card locks duplicate clicks, turns green after save and can return to its status color", async () => {
  let resolve, calls = 0;
  const h = cardHarness(input => { calls++; return new Promise(done => { resolve = () => done({ highlighted: input.highlighted }); }); });
  const click = h.button(h.render()).props.onClick;
  click(); click();
  assert.equal(calls, 1);
  assert.equal(h.button(h.render()).props.disabled, true);
  resolve(); await settle();
  assert.match(h.render().props.className, /bg-emerald-100/);
  assert.equal(h.button(h.render()).props["aria-pressed"], true);
  h.button(h.render()).props.onClick(); resolve(); await settle();
  assert.match(h.render().props.className, /bg-red-50\/30/);
  assert.equal(h.button(h.render()).props["aria-pressed"], false);
});

test("a failed or interrupted save keeps the original color and permits retry", async () => {
  for (const action of [async () => ({ error: "Error de prueba" }), async () => { throw Error("offline"); }]) {
    const h = cardHarness(action, true);
    h.button(h.render()).props.onClick(); await settle();
    assert.match(h.render().props.className, /bg-emerald-100/);
    assert.equal(h.render().props.children[2].props.role, "alert");
    assert.equal(h.button(h.render()).props.disabled, false);
  }
});
