const { PGlite } = require('../tmp/sales-verification/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  const db = new PGlite();
  const schema = fs.readFileSync('supabase/schema.sql', 'utf8').replace('create extension if not exists "pgcrypto";', '');
  const migration = fs.readFileSync('supabase/migrations/20261022_project_highlight.sql', 'utf8');
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      grant usage on schema auth,public to authenticated,anon;`);
    await db.exec(schema);
    const row = (await db.query(`insert into projects(name,client_name,client_phone,address,description)
      values('Obra ficticia','Cliente ficticio','600000000','Calle de prueba','Prueba') returning *`)).rows[0];
    assert.equal(row.is_highlighted, false);
    await db.exec(migration); await db.exec(migration);
    await db.exec(`grant select,update on projects to authenticated;
      create or replace function public.is_decoralia_user() returns boolean language sql stable as $$ select true $$;
      set role authenticated;`);
    for (const value of [true, true, false]) {
      const changed = (await db.query('update projects set is_highlighted=$1 where id=$2 returning *', [value,row.id])).rows[0];
      assert.equal(changed.is_highlighted, value);
      for (const field of ['status','last_activity_at','name','description']) assert.deepEqual(changed[field], row[field]);
    }
    await db.exec(`reset role; create or replace function public.is_decoralia_user() returns boolean language sql stable as $$ select false $$; set role authenticated;`);
    assert.equal((await db.query('update projects set is_highlighted=true returning id')).rows.length, 0);
    await db.exec('reset role');
    assert.equal((await db.query('select is_highlighted from projects')).rows[0].is_highlighted, false);
    console.log('PASS: repeatable migration; persisted reversible highlights; unchanged project status/activity; existing RLS preserved.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
