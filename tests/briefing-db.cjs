const {
  PGlite,
} = require("../tmp/sales-verification/node_modules/@electric-sql/pglite");
const fs = require("node:fs");
const assert = require("node:assert/strict");

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(user_id uuid primary key);
      create function public.is_decoralia_user() returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from profiles where user_id=auth.uid()) $$;
      grant usage on schema auth,public to anon,authenticated;
    `);
    const sql = fs.readFileSync(
      "supabase/migrations/20261008_briefing_board.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    const user = "00000000-0000-0000-0000-000000000001";
    const other = "00000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into profiles values ('${user}'),('${other}'); select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`,
    );
    const scene = {
      elements: [{ id: "card-1" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };
    async function save(version, content) {
      return (
        await db.query("select save_briefing_board($1,$2) as result", [
          version,
          JSON.stringify(content),
        ])
      ).rows[0].result;
    }
    const first = await save(0, scene);
    assert.equal(first.ok, true);
    assert.equal(first.board.version, 1);
    assert.equal(first.board.updated_by, user);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    const stale = await save(0, { ...scene, elements: [] });
    assert.equal(stale.ok, false);
    assert.deepEqual(stale.board.scene, scene);
    const next = await save(1, {
      ...scene,
      elements: [...scene.elements, { id: "card-2" }],
    });
    assert.equal(next.ok, true);
    assert.equal(next.board.version, 2);
    assert.equal(next.board.updated_by, other);
    await assert.rejects(
      () => db.query("update briefing_boards set scene='{}'"),
      /permission denied/,
    );
    await assert.rejects(
      () => save(2, { elements: null, appState: {}, files: {} }),
      /no valida/,
    );
    await assert.rejects(
      () => save(2, { ...scene, files: { giant: "x".repeat(8_388_608) } }),
      /demasiado grande/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      "00000000-0000-0000-0000-000000000099",
    ]);
    assert.equal(
      (await db.query("select * from briefing_boards")).rows.length,
      0,
    );
    await assert.rejects(() => save(2, scene), /No autorizado/);
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      () => db.query("select * from briefing_boards"),
      /permission denied/,
    );
    await assert.rejects(() => save(2, scene), /permission denied/);
    console.log(
      "PASS briefing migration: idempotent, shared users, CAS conflict, limits and RLS.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
