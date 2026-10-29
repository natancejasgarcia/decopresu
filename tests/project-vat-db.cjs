const {PGlite} = require('../tmp/sales-verification/node_modules/@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = name=>fs.readFileSync(`supabase/${name}`,'utf8');
async function main(){
  const db = new PGlite();
  const user='00000000-0000-0000-0000-000000000001', project='00000000-0000-0000-0000-000000000010';
  const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      grant usage on schema auth,public to authenticated,anon;`);
    await db.exec(read('schema.sql').replace('create extension if not exists "pgcrypto";',''));
    await db.exec(read('migrations/20261005_sales_documents.sql'));
    await db.exec(read('migrations/20261021_sales_customer_address.sql'));
    await db.exec(`insert into auth.users values('${user}'); insert into profiles(user_id,name,role) values('${user}','Prueba','admin');
      insert into projects(id,name,client_name,client_phone,address,description) values('${project}','Obra ficticia','Cliente ficticio','600000000','Direccion de prueba','Prueba');
      insert into budget_items(project_id,concept,quantity,unit,unit_price) values('${project}','Pintura',1,'ud',100);
      update company_settings set tax_id='B00000000',address='Prueba';
      select set_config('request.jwt.claim.sub','${user}',false);`);
    const legacy=(await one("select create_sales_document('invoice',$1) id",[project])).id;
    await db.query('select save_sales_document($1,$2)',[legacy,{client_name:'Ficticio',client_tax_id:'H00000000',client_address:'Prueba',client_postal_code:'11002',client_city:'Cadiz',client_province:'Cadiz',issue_date:'2026-10-29',lines:[{concept:'Prueba',quantity:1,unit_price:100,vat_rate:21}]}]);
    await db.query('select issue_sales_document($1)',[legacy]);
    const before=await one('select lines,total,number,issuer from sales_documents where id=$1',[legacy]);
    await db.exec(read('migrations/20261029_project_vat.sql'));
    await db.exec(read('migrations/20261029_project_vat.sql'));
    assert.equal((await one('select budget_vat_rate rate from projects where id=$1',[project])).rate,21);
    await db.exec('grant select,update on public.projects to authenticated; set role authenticated');
    await db.query('update projects set budget_vat_rate=10 where id=$1',[project]);
    for(const kind of ['invoice','delivery_note']){
      const id=(await one('select create_sales_document($1,$2) id',[kind,project])).id;
      const doc=await one('select * from sales_documents where id=$1',[id]);
      assert.equal(doc.default_vat_rate,10);
      assert.equal(doc.lines[0].vat_rate,10);
      assert.equal(Number(doc.total),110);
      if(kind==='delivery_note'){
        await db.query('select issue_sales_document($1)',[id]);
        await db.query('update projects set budget_vat_rate=21 where id=$1',[project]);
        const invoice=(await one("select create_sales_document('invoice',null,$1) id",[id])).id;
        const converted=await one('select * from sales_documents where id=$1',[invoice]);
        assert.equal(converted.default_vat_rate,10);
        assert.deepEqual(converted.lines,doc.lines);
        assert.equal((await one("select create_sales_document('invoice',null,$1) id",[id])).id,invoice);
      }
    }
    const unlinked=(await one("select create_sales_document('invoice') id")).id;
    assert.equal((await one('select default_vat_rate rate from sales_documents where id=$1',[unlinked])).rate,21);
    await assert.rejects(()=>db.query('update projects set budget_vat_rate=15 where id=$1',[project]),/check constraint/);
    assert.deepEqual(await one('select lines,total,number,issuer from sales_documents where id=$1',[legacy]),before);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(()=>db.query("select create_sales_document('invoice',$1)",[project]),/Acceso no autorizado/);
    console.log('PASS: saved project VAT, new invoices/albaranes, source conversion, legacy protection, idempotent migration and auth');
  } finally {await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
