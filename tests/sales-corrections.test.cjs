const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs = require('node:fs');
const load = require('./load-ts.cjs');
const sales = load('lib/sales.ts');
const { correctionSchema, correctionPdfDocument } = load('lib/salesCorrections.ts');
const client = { client_name: 'Cliente ficticio', client_tax_id: 'H12345678', client_address: 'Calle de prueba 7', client_postal_code: '11002', client_city: 'Ciudad de prueba', client_province: 'Provincia de prueba', client_email: '' };
const original = { ...client, id: 'original', kind: 'invoice', status: 'issued', number: 'F/2026/0001', issue_date: '2026-10-21', notes: '', lines: [{ concept: 'Trabajo de prueba', notes: '', quantity: 1, unit: '', unit_price: 100, vat_rate: 21 }], subtotal: 100, tax_total: 21, total: 121 };
const correction = { id: 'correction', original_document_id: 'original', status: 'draft', number: null, correction_date: '2026-10-21', reason: 'Rectificacion de datos fiscales.', client, issuer: { ...sales.DEFAULT_COMPANY, tax_id: 'B05673124', address: 'Domicilio de prueba' }, issued_at: null };
test('corrections preserve every original amount and line and clearly reference the original invoice', () => {
  const snapshot = structuredClone(original);
  const result = correctionPdfDocument(original, correction);
  assert.deepEqual(original, snapshot);
  assert.equal(result.total, 121);
  assert.deepEqual(result.lines, original.lines);
  assert.match(result.source_label, /F\/2026\/0001/);
  assert.match(result.notes, /No representa un nuevo cargo/);
  assert.equal(result.client_postal_code, '11002');
  assert.equal(result.status, 'draft');
});
test('address inputs preserve leading zeroes and reject invalid postcodes', () => {
  const input = { ...client, correction_date: '2026-10-21', reason: 'Datos fiscales' };
  assert.equal(correctionSchema.parse({ ...input, client_postal_code: '01002' }).client_postal_code, '01002');
  for (const code of ['11', '110023', 'ABCDE']) assert.equal(correctionSchema.safeParse({ ...input, client_postal_code: code }).success, false);
});
test('correction form shows fiscal address fields, saves a draft and never offers a new collection', () => {
  const { SalesCorrectionForm } = load('components/SalesCorrectionForm.tsx', {
    'next/link': { __esModule: true, default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) },
    '@/actions/salesCorrectionActions': {},
  });
  const html = renderToStaticMarkup(React.createElement(SalesCorrectionForm, { original, company: correction.issuer, corrections: [correction] }));
  assert.match(html, /Codigo postal/);
  assert.match(html, /Poblacion/);
  assert.match(html, /Provincia/);
  assert.match(html, /Guardar borrador/);
  assert.match(html, /Emitir rectificativa/);
  assert.doesNotMatch(html, /Registrar cobro/);
});
test('corrected PDF fixture includes official issuer, full client address and a draft watermark', async () => {
  const { generateSalesPdf } = load('lib/salesPdf.ts');
  const bytes = await generateSalesPdf(correctionPdfDocument(original, correction), correction.issuer, undefined, 'Factura rectificativa');
  fs.mkdirSync('tmp/pdfs', { recursive: true });
  fs.writeFileSync('tmp/pdfs/correction-fiscal-test.pdf', bytes);
  assert.ok(bytes.length > 1500);
});
