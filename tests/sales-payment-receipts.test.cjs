const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const load = require('./load-ts.cjs');
const invoice='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const payment='00000000-0000-4000-8000-000000000003';
const fileId='00000000-0000-4000-8000-000000000004';
const receipt={path:`sales-payments/${invoice}/${user}/${payment}/${fileId}.png`,name:'comprobante.png',type:'image/png',size:6*1024*1024};
const authMock = supabase => ({requireUserProfile:async()=>({supabase,user:{id:user}})});
function values(attached=receipt) {
  const form=new FormData();
  for(const [key,value] of Object.entries({amount:'40,50',date:'2026-10-26',method:'Transferencia',payment_id:payment})) form.set(key,value);
  if(attached) form.set('uploaded_receipt',JSON.stringify(attached));
  return form;
}
function actionHarness({infoError=false,size=receipt.size,type=receipt.type}={}) {
  const calls=[],invalidations=[];
  const bucket={
    info:async path=>{calls.push(['info',path]);return{data:{size,contentType:type},error:infoError?{message:'Missing file'}:null};},
    createSignedUrl:async()=>({data:{signedUrl:'https://example.test/private-receipt'},error:null}),
  };
  const supabase={storage:{from:()=>bucket},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return{data:payment,error:null};}};
  const actions=load('actions/salesActions.ts',{'@/lib/auth':authMock(supabase),'next/cache':{revalidatePath:path=>invalidations.push(path)}});
  return {...actions,calls,invalidations};
}

test('invoice cobro commits validated metadata once through its invoice RPC and refreshes Finance',async()=>{
  const h=actionHarness(); const result=await h.recordSalesPaymentAction(invoice,values());
  assert.equal(result.ok,true); assert.equal(result.id,payment);
  assert.equal(result.receipt.receipt_signed_url,'https://example.test/private-receipt');
  assert.deepEqual(h.calls[1],['rpc','record_sales_payment_with_receipt',{p_id:invoice,p_payment_id:payment,p_amount:40.5,p_date:'2026-10-26',p_method:'Transferencia',p_receipt:receipt}]);
  assert.ok(h.invalidations.includes('/finance')); assert.ok(h.invalidations.includes(`/sales/${invoice}`));
});
test('forged, oversized, malformed or missing attachments never record a payment',async()=>{
  for(const attached of [{...receipt,path:receipt.path.replace(user,fileId)},{...receipt,size:11*1024*1024},{...receipt,type:'text/html'}]) {
    const h=actionHarness(); assert.equal((await h.recordSalesPaymentAction(invoice,values(attached))).ok,false);
    assert.ok(h.calls.every(c=>c[0]!=='rpc'));
  }
  for(const options of [{infoError:true},{size:1},{type:'application/pdf'}]) {
    const h=actionHarness(options); assert.equal((await h.recordSalesPaymentAction(invoice,values())).ok,false);
    assert.ok(h.calls.every(c=>c[0]!=='rpc'));
  }
  const h=actionHarness(), form=values(); form.set('uploaded_receipt','not-json');
  assert.equal((await h.recordSalesPaymentAction(invoice,form)).ok,false); assert.equal(h.calls.length,0);
});
test('payments without an attachment stay supported and raw photo bodies are rejected',async()=>{
  const h=actionHarness(); assert.equal((await h.recordSalesPaymentAction(invoice,values(null))).ok,true);
  assert.equal(h.calls[0][2].p_receipt,null);
  const photo=values(null); photo.set('receipt',new File(['bytes'],'photo.png',{type:'image/png'}));
  const rejected=actionHarness(); assert.equal((await rejected.recordSalesPaymentAction(invoice,photo)).ok,false);
  assert.equal(rejected.calls.length,0);
});
test('a 6 MB image uploads directly to private Storage, never through the payment Server Action; retry reuses upload',async()=>{
  let uploads=0,prepares=0;
  const client=load('lib/uploadSalesPaymentReceipt.ts',{
    '@/actions/salesPaymentReceiptActions':{prepareSalesPaymentReceiptAction:async()=>{prepares++;return{ok:true,token:'test-only',receipt};}},
    '@/lib/supabaseClient':{createBrowserSupabaseClient:()=>({storage:{from:()=>({uploadToSignedUrl:async()=>{uploads++;return{error:null};}})}})},
  });
  const file=new File([new Uint8Array(receipt.size)],receipt.name,{type:receipt.type});
  const form=values(null);form.set('receipt',file);
  const prepared=await client.prepareSalesPaymentSubmission(form,invoice,payment,null);
  assert.equal(prepared.formData.has('receipt'),false);assert.equal(prepared.formData.get('payment_id'),payment);
  const retry=values(null);retry.set('receipt',file);
  await client.prepareSalesPaymentSubmission(retry,invoice,payment,prepared.cached);
  assert.equal(uploads,1);assert.equal(prepares,1);
});
test('upload failure does not invoke payment persistence and keeps a useful retry error',async()=>{
  const client=load('lib/uploadSalesPaymentReceipt.ts',{
    '@/actions/salesPaymentReceiptActions':{prepareSalesPaymentReceiptAction:async()=>({ok:true,token:'test',receipt})},
    '@/lib/supabaseClient':{createBrowserSupabaseClient:()=>({storage:{from:()=>({uploadToSignedUrl:async()=>({error:{message:'offline'}})})}})},
  });
  const form=values(null);form.set('receipt',new File(['bytes'],'photo.png',{type:'image/png'}));
  await assert.rejects(()=>client.prepareSalesPaymentSubmission(form,invoice,payment,null),/cobro no se ha registrado/);
});
test('signed uploads only target an issued invoice, with user/payment-scoped non-overwriting paths',async()=>{
  let signedPath;
  const supabase={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{kind:'invoice',status:'issued'},error:null})}),storage:{from:()=>({createSignedUploadUrl:async(path,options)=>{signedPath=path;assert.equal(options.upsert,false);return{data:{token:'test'},error:null};}})}};
  const {prepareSalesPaymentReceiptAction:prepare}=load('actions/salesPaymentReceiptActions.ts',{'@/lib/auth':authMock(supabase)});
  const result=await prepare({name:receipt.name,type:receipt.type,size:receipt.size,invoice_id:invoice,payment_id:payment});
  assert.equal(result.ok,true);assert.ok(signedPath.startsWith(`sales-payments/${invoice}/${user}/${payment}/`));
  supabase.from=()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{kind:'invoice',status:'draft'},error:null})});
  assert.equal((await prepare({name:receipt.name,type:receipt.type,size:receipt.size,invoice_id:invoice,payment_id:payment})).ok,false);
});
test('Sales form offers PDF/photos in both collection flows and invoice history exposes the private receipt',()=>{
  const {SalesPaymentForm}=load('components/SalesPaymentForm.tsx');
  const html=renderToStaticMarkup(React.createElement(SalesPaymentForm,{outstanding:110,issueDate:'2026-10-26',pending:false,onSave(){},onCancel(){}}));
  assert.match(html,/Justificante del cobro/); assert.match(html,/name="receipt"/);assert.match(html,/application\/pdf/);
  const {SalesDocumentEditor}=load('components/SalesDocumentEditor.tsx',{
    'next/link':{__esModule:true,default:({children,prefetch,...props})=>React.createElement('a',props,children)},
    'next/navigation':{useRouter:()=>({replace(){},refresh(){}})},'@/actions/salesActions':{},
  });
  const document={id:invoice,kind:'invoice',status:'issued',number:'F/2026/0001',issue_date:'2026-10-26',lines:[{concept:'Prueba',notes:'',quantity:1,unit:'',unit_price:100,vat_rate:10}],client_name:'Cliente',client_tax_id:'B00000000',client_address:'Prueba',notes:''};
  const editor=renderToStaticMarkup(React.createElement(SalesDocumentEditor,{document,payments:[{id:payment,sales_document_id:invoice,amount:40,payment_date:'2026-10-26',method:'Transferencia',receipt_file_name:receipt.name,receipt_signed_url:'https://example.test/private-receipt'}]}));
  assert.match(editor,/Ver justificante/);assert.match(editor,/comprobante.png/);assert.match(editor,/https:\/\/example.test\/private-receipt/);
});
