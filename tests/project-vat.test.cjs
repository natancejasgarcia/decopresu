const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {PDFPage} = require('pdf-lib');
const load = require('./load-ts.cjs');
const projectId = '00000000-0000-4000-8000-000000000010';
const item = {id:'item',concept:'Pintura',notes:'',quantity:1,unit:'ud',unit_price:100,total:100,created_at:'2026-10-29'};

test('project VAT is validated, persisted with RLS and invalidates document views', async () => {
  const writes = [], paths = [];
  let failure = false;
  const action = load('actions/projectVatActions.ts', {
    '@/lib/auth': {requireUserProfile:async()=>({supabase:{from(table){
      assert.equal(table,'projects');
      const q = {update(value){writes.push(value);return q;},eq(key,value){assert.equal(key,'id');assert.equal(value,projectId);return q;},select(){return q;},single:async()=>failure?{data:null,error:{message:'denied'}}:{data:{id:projectId,budget_vat_rate:10},error:null}};
      return q;
    }}})},
    'next/cache': {revalidatePath:(p)=>paths.push(p)},
  }).saveProjectVatAction;
  for (const bad of [null,undefined,0,15,NaN]) assert.equal((await action(projectId,bad)).ok,false);
  assert.equal((await action('invalid',10)).ok,false);
  assert.equal(writes.length,0);
  assert.deepEqual(await action(projectId,10),{ok:true,vatRate:10});
  assert.deepEqual(writes,[{budget_vat_rate:10}]);
  assert.ok(paths.includes('/sales') && paths.includes('/validations') && paths.includes(`/projects/${projectId}`));
  failure = true;
  assert.equal((await action(projectId,21)).ok,false);
});

test('budget radio and inclusive totals restore the saved project VAT', () => {
  const {BudgetBuilder} = load('components/BudgetBuilder.tsx', {
    '@/actions/budgetActions':{}, '@/actions/projectVatActions':{},
    'next/navigation':{useRouter:()=>({refresh(){}})},
  });
  const html = renderToStaticMarkup(React.createElement(BudgetBuilder,{projectId,initialVatRate:10,items:[item],rooms:[]}));
  assert.match(html,/checked=""[^>]*value="10"/);
  assert.match(html,/110,00/);
});

test('PDF generator uses the saved project VAT also for validation PDFs without a query', async () => {
  const {buildBudgetPdf} = load('lib/budgetPdf.ts');
  const original = PDFPage.prototype.drawText;
  const texts = [];
  PDFPage.prototype.drawText = function(text,options){texts.push(text);return original.call(this,text,options);};
  try {
    await buildBudgetPdf({project:{id:projectId,name:'Prueba',client_name:'Ficticio',address:'Prueba',created_at:'2026-10-29',budget_vat_rate:10},items:[item],rooms:[]});
    assert.ok(texts.includes('IVA (10%):'));
    assert.ok(!texts.includes('IVA (21%):'));
    assert.ok(texts.some(t=>t.includes('110,00')));
  } finally {PDFPage.prototype.drawText=original;}
});

test('new Sales lines and partial invoices keep a uniform rate, including zero; mixed rates use snapshot', () => {
  const {salesDefaultVat} = load('lib/sales.ts');
  assert.equal(salesDefaultVat([],10),10);
  assert.equal(salesDefaultVat([]),21);
  assert.equal(salesDefaultVat([{vat_rate:10},{vat_rate:10}],21),10);
  assert.equal(salesDefaultVat([{vat_rate:0}],10),0);
  assert.equal(salesDefaultVat([{vat_rate:10},{vat_rate:21}],10),10);
  const {SalesPartialInvoiceForm} = load('components/SalesPartialInvoiceForm.tsx');
  const html = renderToStaticMarkup(React.createElement(SalesPartialInvoiceForm,{sourceLabel:'Prueba',disabled:false,initialVatRate:10,onApply(){},onCancel(){}}));
  assert.match(html,/<option value="10" selected="">/);
});

test('PDF route and print view use project VAT by default, explicit old links still override', async () => {
  const project = {id:projectId,name:'Prueba',client_name:'Prueba',address:'Prueba',created_at:'2026-10-29',budget_vat_rate:10};
  const db = {auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){const q={select(){return q;},eq(){return q;},order(){return q;},single:async()=>({data:table==='profiles'?{id:'profile'}:project}),returns:async()=>({data:table==='budget_items'?[item]:[]})};return q;}};
  const received=[];
  const {GET} = load('app/projects/[id]/budget/pdf/route.ts',{
    '@/lib/supabaseServer':{createServerSupabaseClient:()=>db},
    '@/lib/budgetPdf':{buildBudgetPdf:async data=>{received.push(data);return {bytes:Buffer.from('test'),filename:'test.pdf'};}},
  });
  assert.equal((await GET({nextUrl:new URL('https://example.test/pdf')},{params:{id:projectId}})).status,200);
  assert.equal(received[0].vatRate,10);
  await GET({nextUrl:new URL('https://example.test/pdf?vat_rate=21')},{params:{id:projectId}});
  assert.equal(received[1].vatRate,21);
  const {default:PrintPage} = load('app/projects/[id]/budget/print/page.tsx',{
    '@/lib/auth':{requireUserProfile:async()=>({supabase:db})},
    'next/link':{__esModule:true,default:({children,...p})=>React.createElement('a',p,children)},
    'next/navigation':{notFound(){throw Error('not found');}},
  });
  const html=renderToStaticMarkup(await PrintPage({params:{id:projectId},searchParams:{}}));
  assert.match(html,/IVA \(10%\):/);
  assert.match(html,/110,00/);
});
