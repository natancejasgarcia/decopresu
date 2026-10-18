const {
  PGlite,
} = require("../tmp/sales-verification/node_modules/@electric-sql/pglite");
const fs = require("node:fs");
const assert = require("node:assert/strict");
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
    create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon;`);
    await db.exec(
      fs
        .readFileSync("supabase/schema.sql", "utf8")
        .replace('create extension if not exists "pgcrypto";', ""),
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261005_sales_documents.sql",
        "utf8",
      ),
    );
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261008_briefing_board.sql",
        "utf8",
      ),
    );
    const owner = "00000000-0000-0000-0000-000000000001",
      reviewer = "00000000-0000-0000-0000-000000000002",
      member = "00000000-0000-0000-0000-000000000003";
    await db.exec(`insert into auth.users values('${owner}','owner@example.test'),('${reviewer}','decoralia1977@gmail.com'),('${member}','member@example.test');
    insert into profiles(user_id,name,role) values('${owner}','José Antonio','admin'),('${reviewer}','Decoralia','admin'),('${member}','Otro','member');
    insert into projects(name,client_name,client_phone,address,description) values('Obra','Cliente','600000000','Calle','Pintura');
    insert into fixed_costs(name,amount,created_by) values('Alquiler',10000,'${owner}');
    insert into budget_validations(name,file_name,file_url,created_by) values('Pendiente','p.pdf','pending.pdf','${owner}'),('OK','o.pdf','approved.pdf','${owner}');
    update budget_validations set is_validated=true where name='OK';
    insert into storage.objects(bucket_id,name) values('project-files','pending.pdf'),('project-files','approved.pdf'),('project-files','secret.png');
    grant select,insert,update,delete on all tables in schema public,storage to authenticated;`);
    const migration = fs.readFileSync(
      "supabase/migrations/20261018_access_and_finance_ai.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const uploadMigration = fs.readFileSync(
      "supabase/migrations/20261019_reviewer_invoice_uploads.sql",
      "utf8",
    );
    await db.exec(uploadMigration);
    await db.exec(uploadMigration);
    async function login(id, email) {
      await db.exec(
        `reset role;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.email','${email}',false);set role authenticated;`,
      );
    }
    async function one(sql, args = []) {
      return (await db.query(sql, args)).rows[0];
    }
    await login(reviewer, "decoralia1977@gmail.com");
    assert.equal((await one("select app_access_role() role")).role, "reviewer");
    for (const table of [
      "projects",
      "project_expenses",
      "project_payments",
      "fixed_costs",
      "finance_documents",
      "daily_notes",
      "sales_documents",
      "briefing_boards",
      "company_settings",
      "messages",
      "project_files",
      "rooms",
      "room_modules",
      "budget_items",
      "sent_emails",
    ])
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        0,
        table,
      );
    assert.equal(
      (await db.query("select * from budget_validations")).rows.length,
      1,
    );
    assert.deepEqual(
      (await db.query("select name from storage.objects")).rows.map(
        (r) => r.name,
      ),
      ["pending.pdf"],
    );
    assert.equal(
      (
        await db.query(
          "update profiles set name='José Antonio',role='admin' where user_id=$1 returning *",
          [reviewer],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("insert into workspace_access values($1,'owner')", [reviewer]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("select create_sales_document('invoice')"),
      /no autorizado/,
    );
    const pending = await one("select id from budget_validations limit 1");
    await db.query(
      "select review_budget_validation($1,'notes','Revisar color')",
      [pending.id],
    );
    await db.query("select review_budget_validation($1,'approve')", [
      pending.id,
    ]);
    assert.equal(
      (await db.query("select * from budget_validations")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.query("select review_budget_validation($1,'notes','Cambiar')", [
          pending.id,
        ]),
      /no disponible/,
    );
    await assert.rejects(
      () => db.query("select post_finance_document(gen_random_uuid(),'{}')"),
      /No autorizado/,
    );
    const photoPath = `finance-scans/${reviewer}/00000000-0000-0000-0000-000000000099.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name) values('project-files',$1)",
      [photoPath],
    );
    const uploaded = await one(
      "insert into finance_documents(created_by,file_path,file_name,file_type,file_size,file_hash) values($1,$2,'Subida.png','image/png',10,$3) returning id",
      [reviewer, photoPath, "a".repeat(64)],
    );
    assert.equal(
      (await db.query("select * from finance_documents")).rows.length,
      1,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name) values('project-files',$1)",
          [`finance-scans/${owner}/00000000-0000-0000-0000-000000000099.png`],
        ),
      /row-level security/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into storage.objects(bucket_id,name) values('project-files','project/budget-validations/new.pdf')",
        ),
      /row-level security/,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into finance_documents(created_by,file_path,file_name,file_type,file_size,file_hash) values($1,'outside.png','Otro.png','image/png',10,$2)",
          [reviewer, "b".repeat(64)],
        ),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          "update finance_documents set extracted='{}' where id=$1 returning id",
          [uploaded.id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from finance_documents where id=$1 returning id",
          [uploaded.id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning name",
          [photoPath],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () => db.query("select post_finance_document($1,'{}')", [uploaded.id]),
      /No autorizado/,
    );
    await login(member, "member@example.test");
    assert.equal(
      (await db.query("select * from budget_validations")).rows.length,
      0,
    );
    await login(owner, "owner@example.test");
    assert.equal(
      (await db.query("select * from budget_validations")).rows.length,
      2,
    );
    assert.equal(
      (
        await one(
          "select validation_notes from budget_validations where id=$1",
          [pending.id],
        )
      ).validation_notes,
      null,
    );
    const invoice = {
      direction: "expense",
      project_id: null,
      party_name: "Proveedor",
      tax_id: "B1",
      invoice_number: "F1",
      issue_date: "2026-10-18",
      currency: "EUR",
      subtotal: 100,
      tax: 21,
      total: 121,
      paid_amount: 0,
      payment_date: null,
      method: "Transferencia",
      category: "Materiales",
      concept: "Pintura",
      notes: "",
    };
    let seq = 0;
    async function draft() {
      seq++;
      return one(
        "insert into finance_documents(created_by,file_path,file_name,file_type,file_size,file_hash) values($1,$2,'factura.png','image/png',10,$3) returning id",
        [
          owner,
          `finance-scans/${owner}/${seq}.png`,
          String(seq).padStart(64, "0"),
        ],
      );
    }
    let d = await draft();
    await assert.rejects(
      () =>
        db.query("update finance_documents set status='posted' where id=$1", [
          d.id,
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select post_finance_document($1,$2)", [
          d.id,
          { ...invoice, total: 999 },
        ]),
      /Revisa/,
    );
    await db.query("select post_finance_document($1,$2)", [d.id, invoice]);
    await db.query("select post_finance_document($1,$2)", [d.id, invoice]);
    assert.equal(
      (await one("select count(*)::int n from project_expenses")).n,
      1,
    );
    assert.equal(
      (await one("select is_paid from project_expenses")).is_paid,
      false,
    );
    assert.equal(
      (await one("select count(*)::int n from project_payments")).n,
      0,
    );
    const duplicate = await draft();
    await assert.rejects(
      () =>
        db.query("select post_finance_document($1,$2)", [
          duplicate.id,
          invoice,
        ]),
      /duplicate key/,
    );
    assert.equal(
      (await one("select count(*)::int n from project_expenses")).n,
      1,
      "duplicate rolls back expense insert",
    );
    d = await draft();
    await db.query("select post_finance_document($1,$2)", [
      d.id,
      {
        ...invoice,
        direction: "income",
        invoice_number: "F2",
        paid_amount: 47.7,
        payment_date: "2026-10-18",
      },
    ]);
    assert.equal(
      Number((await one("select amount from project_payments")).amount),
      47.7,
    );
    d = await draft();
    await db.query("select post_finance_document($1,$2)", [
      d.id,
      { ...invoice, direction: "income", invoice_number: "F3" },
    ]);
    assert.equal(
      (await one("select count(*)::int n from project_payments")).n,
      1,
      "unpaid income is not a cash receipt",
    );
    assert.equal(
      Number((await one("select amount from fixed_costs")).amount),
      10000,
      "existing costs preserved",
    );
    assert.ok(
      await one("select id from finance_documents where id=$1", [uploaded.id]),
      "owner sees reviewer uploads",
    );
    await db.query("select post_finance_document($1,$2)", [
      uploaded.id,
      { ...invoice, direction: "income", invoice_number: "Uploaded" },
    ]);
    await login(reviewer, "decoralia1977@gmail.com");
    assert.equal(
      (await db.query("select * from finance_documents")).rows.length,
      0,
      "reviewer cannot see owner documents or posted uploads",
    );
    console.log(
      "OK: migration twice; reviewer isolation; private PDFs; OK transitions; owner-only history; invoice posting atomic/idempotent; duplicate rollback; partial/unpaid receipts; existing costs preserved.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
