const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PDFDocument, PDFPage } = require('pdf-lib');
const load = require('./load-ts.cjs');
const { generateSalesPdf } = load('lib/salesPdf.ts');
const { DEFAULT_COMPANY } = load('lib/sales.ts');
const company = { ...DEFAULT_COMPANY, legal_name: 'Sociedad de prueba', tax_id: 'B00000000', address: 'Domicilio de prueba' };
const lines = [
  { concept: 'Trabajo de lunes y martes (2 operarios)', notes: 'Retirada de elementos y preparacion del soporte.\nLunes: 20 horas. Martes: 23 horas.', quantity: 43, unit: 'HORAS', unit_price: 32.5, vat_rate: 21 },
  { concept: 'Colocacion de revestimiento mural', notes: 'Instalacion del revestimiento suministrado por el cliente y remates.', quantity: 170, unit: 'm', unit_price: 14.5, vat_rate: 21 },
  { concept: 'Desplazamiento', notes: 'Desplazamiento del equipo.', quantity: 5, unit: 'DIAS', unit_price: 90, vat_rate: 21 },
];
const invoice = { id: 'fixture', kind: 'invoice', status: 'issued', number: 'F/2026/0001', issue_date: '2026-10-23', client_name: 'Cliente de prueba', client_tax_id: 'H00000000', client_address: 'Calle de prueba', client_postal_code: '11002', client_city: 'Cadiz', client_province: 'Cadiz', lines, notes: '' };

async function render(document) {
  const drawn = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function(value, options) {
    drawn.push({ value, ...options, page: this, right: options.x + options.font.widthOfTextAtSize(value, options.size) });
    return original.call(this, value, options);
  };
  try { return { bytes: await generateSalesPdf(document, company), drawn }; }
  finally { PDFPage.prototype.drawText = original; }
}

test('invoice prints units in a separate column and VAT only in the totals, preserving its data', async () => {
  const before = structuredClone(invoice);
  const { bytes, drawn } = await render(invoice);
  assert.deepEqual(invoice, before);
  const texts = drawn.map(item => item.value);
  assert.ok(texts.includes('UNIDAD'));
  assert.ok(texts.includes('CANT.'));
  for (const unit of ['HORAS', 'm', 'DIAS']) {
    const item = drawn.find(item => item.value === unit);
    assert.equal(item.x, 350);
    assert.ok(item.right <= 404);
  }
  assert.ok(texts.every(text => !text.startsWith('Unidad:')));
  assert.equal(texts.filter(text => text.startsWith('IVA ')).length, 1);
  assert.ok(texts.includes('IVA 21%'));
  for (const amount of ['4312,50', '905,63', '5218,13']) assert.ok(texts.some(text => text.includes(amount)));
  fs.mkdirSync('tmp/pdfs', { recursive: true });
  fs.writeFileSync('tmp/pdfs/invoice-unit-column.pdf', bytes);
});

test('empty and long units reserve their own rows; large numbers stay inside their columns', async () => {
  const { drawn, bytes } = await render({ ...invoice, lines: [
    { ...lines[0], concept: 'Partida breve', unit: 'METROS CUADRADOS', notes: 'DETALLE_DESPUES_UNIDAD', quantity: 9999999, unit_price: 9999999, vat_rate: 10 },
    { ...lines[2], unit: '', vat_rate: 21 },
  ] });
  assert.ok(drawn.some(item => item.value === '-' && item.x === 350));
  const unitRows = drawn.filter(item => item.x === 350 && item.value !== 'UNIDAD' && item.value !== '-');
  assert.ok(unitRows.length >= 2);
  assert.ok(unitRows.every(item => item.right <= 404));
  const detail = drawn.find(item => item.value === 'DETALLE_DESPUES_UNIDAD');
  assert.ok(detail.y < Math.min(...unitRows.map(item => item.y)));
  const quantity = drawn.find(item => item.value === '9.999.999,00');
  assert.ok(quantity.x >= 284 && quantity.right <= 338.01);
  const base = drawn.find(item => item.value === '99.999.980.000.001,00');
  assert.ok(base.x >= 479 && base.right <= 547.29);
  assert.equal(drawn.filter(item => item.value.startsWith('IVA ')).length, 2);
  fs.writeFileSync('tmp/pdfs/invoice-unit-column-edge.pdf', bytes);
});

test('multipage invoices repeat the column heading and never restore per-concept VAT', async () => {
  const { bytes, drawn } = await render({ ...invoice, lines: Array.from({ length: 16 }, (_, index) => ({ ...lines[0], concept: `Partida ${index + 1}`, notes: 'Preparacion del soporte y acabado con remates. '.repeat(30) })) });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 2);
  assert.ok(drawn.filter(item => item.value === 'UNIDAD').length > 2);
  assert.equal(drawn.filter(item => item.value.startsWith('IVA ')).length, 1);
  assert.ok(drawn.every(item => !item.value.startsWith('Unidad:')));
});

test('delivery notes retain their existing unit and VAT presentation', async () => {
  const { drawn } = await render({ ...invoice, kind: 'delivery_note' });
  assert.ok(!drawn.some(item => item.value === 'UNIDAD'));
  assert.ok(drawn.some(item => item.value === 'Unidad: HORAS · IVA 21%'));
});
