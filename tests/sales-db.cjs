const {
  PGlite,
} = require("../tmp/sales-verification/node_modules/@electric-sql/pglite");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { partialInvoiceLines } = require("./load-ts.cjs")("lib/sales.ts");
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text);
      grant usage on schema auth, public to authenticated, anon;
    `);
    // gen_random_uuid is built into PostgreSQL; PGlite doesn't ship pgcrypto.
    await db.exec(
      fs
        .readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8")
        .replace('create extension if not exists "pgcrypto";', ""),
    );
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        "../supabase/migrations/20261005_sales_documents.sql",
      ),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const user = "00000000-0000-0000-0000-000000000001";
    const project = "00000000-0000-0000-0000-000000000010";
    await db.exec(`
      insert into auth.users(id) values ('${user}');
      insert into public.profiles(user_id,name,role) values ('${user}','Prueba','admin');
      insert into public.projects(id,name,client_name,client_phone,address,description) values ('${project}','Obra de prueba','Cliente','600000000','Direccion ejemplo','Pintura');
      insert into public.budget_items(project_id,concept,quantity,unit,unit_price) values ('${project}','Pintura paredes',56.86,'m2',95);
      grant select,insert,update,delete on public.project_payments to authenticated;
      grant select on public.budget_items to authenticated;
      select set_config('request.jwt.claim.sub','${user}',false);
      set role authenticated;
    `);
    async function one(sql, args = []) {
      return (await db.query(sql, args)).rows[0];
    }
    const draft = await one(
      "select public.create_sales_document($1,$2) as id",
      ["delivery_note", project],
    );
    let doc = await one("select * from public.sales_documents where id=$1", [
      draft.id,
    ]);
    assert.equal(Number(doc.subtotal), 5401.7);
    assert.equal(Number(doc.tax_total), 1134.36);
    assert.equal(Number(doc.total), 6536.06);
    await assert.rejects(
      () => db.query("select public.issue_sales_document($1)", [doc.id]),
      /datos fiscales/,
    );
    await db.query(
      "update company_settings set tax_id='B12345678', address='Direccion empresa' where id=1",
    );
    const issued = await one(
      "select public.issue_sales_document($1) as number",
      [doc.id],
    );
    assert.equal(issued.number, "A/2026/0001");
    assert.equal(
      (await one("select public.issue_sales_document($1) as number", [doc.id]))
        .number,
      issued.number,
    );
    const invoice = await one(
      "select public.create_sales_document($1,$2,$3) as id",
      ["invoice", null, doc.id],
    );
    assert.equal(
      (
        await one("select public.create_sales_document($1,$2,$3) as id", [
          "invoice",
          null,
          doc.id,
        ])
      ).id,
      invoice.id,
    );
    await assert.rejects(
      () => db.query("select public.issue_sales_document($1)", [invoice.id]),
      /NIF/,
    );
    const invoiceData = {
      client_name: "Cliente",
      client_tax_id: "B87654321",
      client_address: "Direccion cliente",
      client_email: "",
      issue_date: "2026-10-05",
      due_date: "2026-11-05",
      notes: "Prueba",
      lines: doc.lines,
    };
    await db.query("select public.save_sales_document($1,$2)", [
      invoice.id,
      JSON.stringify(invoiceData),
    ]);
    assert.equal(
      (
        await one("select public.issue_sales_document($1) as number", [
          invoice.id,
        ])
      ).number,
      "F/2026/0001",
    );
    await db.query(
      "update company_settings set legal_name='Nombre nuevo' where id=1",
    );
    doc = await one("select * from public.sales_documents where id=$1", [
      invoice.id,
    ]);
    assert.equal(doc.issuer.legal_name, "Decoralia Pintores");
    await assert.rejects(
      () =>
        db.query("select public.save_sales_document($1,$2)", [
          invoice.id,
          JSON.stringify(invoiceData),
        ]),
      /emitido/,
    );
    await assert.rejects(
      () => db.query("select public.delete_sales_draft($1)", [invoice.id]),
      /borrador/,
    );
    await assert.rejects(
      () =>
        db.query(
          "update sales_documents set client_name='Alterado' where id=$1",
          [invoice.id],
        ),
      /permission denied/,
    );
    const payment = await one(
      "select public.record_sales_payment($1,$2,$3,$4) as id",
      [invoice.id, 477, "2026-10-05", "Transferencia"],
    );
    assert.equal(
      Number(
        (
          await one(
            "select sum(amount) as paid from project_payments where sales_document_id=$1",
            [invoice.id],
          )
        ).paid,
      ),
      477,
    );
    await assert.rejects(
      () =>
        db.query("select public.record_sales_payment($1,$2,$3,$4)", [
          invoice.id,
          7000,
          "2026-10-05",
          "Transferencia",
        ]),
      /importe pendiente/,
    );
    await assert.rejects(
      () =>
        db.query("update project_payments set amount=7000 where id=$1", [
          payment.id,
        ]),
      /importe pendiente/,
    );
    await assert.rejects(
      () =>
        db.query(
          "update project_payments set sales_document_id=null where id=$1",
          [payment.id],
        ),
      /desvincular/,
    );
    const next = await one("select public.create_sales_document($1,$2) as id", [
      "invoice",
      project,
    ]);
    await db.query("select public.save_sales_document($1,$2)", [
      next.id,
      JSON.stringify(invoiceData),
    ]);
    assert.equal(
      (await one("select public.issue_sales_document($1) as number", [next.id]))
        .number,
      "F/2026/0002",
    );
    const partialIds = [];
    for (const [index, amount] of [300, 700].entries()) {
      const partial = await one(
        "select public.create_sales_document('invoice',$1) as id",
        [project],
      );
      partialIds.push(partial.id);
      await db.query("select public.save_sales_document($1,$2)", [
        partial.id,
        JSON.stringify({
          ...invoiceData,
          lines: [
            {
              concept: `Factura parcial ${index + 1}`,
              notes: "Trabajos de la obra",
              quantity: 1,
              unit: "",
              unit_price: amount,
              vat_rate: 21,
            },
          ],
        }),
      ]);
      await db.query("select public.issue_sales_document($1)", [partial.id]);
    }
    const partialDoc = await one("select * from sales_documents where id=$1", [
      partialIds[0],
    ]);
    assert.equal(Number(partialDoc.total), 363);
    assert.equal(
      (
        await db.query(
          "select * from project_payments where sales_document_id=any($1::uuid[])",
          [partialIds],
        )
      ).rows.length,
      0,
      "Issuing partial invoices does not create income",
    );
    await db.query(
      "select public.record_sales_payment($1,100,'2026-11-03','Tarjeta')",
      [partialIds[0]],
    );
    const partialPayment = await one(
      "select * from project_payments where sales_document_id=$1",
      [partialIds[0]],
    );
    assert.equal(partialPayment.project_id, project);
    assert.equal(Number(partialPayment.amount), 100);
    assert.equal(
      new Date(partialPayment.payment_date).toISOString().slice(0, 10),
      "2026-11-03",
    );
    assert.equal(
      Number(
        (
          await one(
            "select sum(total) as total from sales_documents where id=any($1::uuid[])",
            [partialIds],
          )
        ).total,
      ),
      1210,
    );
    assert.equal(
      Number(
        (
          await one(
            "select sum(quantity * unit_price) as total from budget_items where project_id=$1",
            [project],
          )
        ).total,
      ),
      5401.7,
      "The original budget is unchanged",
    );
    for (const [amount, vat] of [
      [500, 21],
      [1200, 21],
      [0.03, 21],
      [0.09, 21],
      [4, 21],
      [9999999, 21],
      [23.49, 10],
      [500, 0],
    ]) {
      const partial = await one(
        "select public.create_sales_document('invoice',$1) as id",
        [project],
      );
      await db.query("select public.save_sales_document($1,$2)", [
        partial.id,
        JSON.stringify({
          ...invoiceData,
          lines: partialInvoiceLines({
            amount,
            vat_rate: vat,
            concept: "Importe final con IVA",
            notes: "",
          }),
        }),
      ]);
      const stored = await one(
        "select total from sales_documents where id=$1",
        [partial.id],
      );
      assert.equal(
        Number(stored.total),
        amount,
        "Stored total must equal the user's VAT-inclusive amount",
      );
      await db.query("select public.issue_sales_document($1)", [partial.id]);
      await db.query(
        "select public.record_sales_payment($1,$2,'2026-11-03','Tarjeta')",
        [partial.id, amount],
      );
      assert.equal(
        Number(
          (
            await one(
              "select amount from project_payments where sales_document_id=$1",
              [partial.id],
            )
          ).amount,
        ),
        amount,
      );
    }
    await db.exec(
      "reset role; select set_config('request.jwt.claim.sub','',false); set role authenticated;",
    );
    assert.equal(
      (await db.query("select * from sales_documents")).rows.length,
      0,
    );
    await assert.rejects(
      () => db.query("select public.create_sales_document('invoice')"),
      /no autorizado/,
    );
    await db.exec("reset role; set role anon;");
    await assert.rejects(
      () => db.query("select public.create_sales_document('invoice')"),
      /permission denied/,
    );
    console.log(
      "PASS: migration repeatability, RLS, numbering, conversion, immutable snapshots, partial invoices, dated collections and unchanged budgets.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
