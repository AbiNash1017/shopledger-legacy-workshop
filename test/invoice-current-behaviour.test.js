'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');

function riceOrder(overrides) {
  return Object.assign({
    id: 1,
    date: '21/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    coupon: '',
    items: [{
      id: 1,
      sku: 'GRN-001',
      name: 'Rice',
      hsn: '1006',
      price: 640,
      qty: 1
    }]
  }, overrides || {});
}

test('CURRENT BEHAVIOUR: checkout applies the HSN rice slab and computes 5% GST', function () {
  const totals = pricing.computeTotals(riceOrder().items, '');

  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total
  }, {
    subtotal: 640,
    discount: 0,
    taxable: 640,
    tax: 32,
    cgst: 16,
    sgst: 16,
    total: 672
  });
});

test('invoice uses the stored HSN slab when gstRate is absent', function () {
  const figures = invoice.computeInvoiceFigures(riceOrder());

  assert.deepEqual({
    subtotal: figures.subtotal,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total,
    lineGstPercent: figures.rows[0].gstPercent
  }, {
    subtotal: 640,
    tax: 32,
    cgst: 16,
    sgst: 16,
    total: 672,
    lineGstPercent: 5
  });
});

test('invoice uses the same billed GST and total as checkout for an HSN-priced order', function () {
  const order = riceOrder();
  const billed = pricing.computeTotals(order.items, order.coupon);
  order.subtotal = billed.subtotal;
  order.discount = billed.discount;
  order.tax = billed.tax;
  order.total = billed.total;

  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, order.subtotal);
  assert.equal(figures.tax, order.tax);
  assert.equal(figures.cgst, billed.cgst);
  assert.equal(figures.sgst, billed.sgst);
  assert.equal(figures.total, order.total);
  assert.equal(figures.rows[0].gstPercent, billed.lines[0].gstPercent);
  assert.equal(figures.rows[0].lineTax, billed.lines[0].tax);
});

test('CURRENT BEHAVIOUR: checkout applies SAVE10 to subtotal before tax and caps it', function () {
  const items = [{ id: 1, name: 'Rice', hsn: '1006', price: 3000, qty: 1 }];
  const totals = pricing.computeTotals(items, 'SAVE10');

  assert.deepEqual({
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    cgst: totals.cgst,
    sgst: totals.sgst,
    total: totals.total
  }, {
    subtotal: 3000,
    discount: 150,
    tax: 142.5,
    cgst: 71.25,
    sgst: 71.25,
    total: 2992.5
  });
});

test('invoice applies SAVE10 to subtotal before GST and honors its maximum discount', function () {
  const figures = invoice.computeInvoiceFigures(riceOrder({
    coupon: 'SAVE10',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 3000, qty: 1 }]
  }));

  assert.deepEqual({
    subtotal: figures.subtotal,
    discount: figures.discount,
    tax: figures.tax,
    cgst: figures.cgst,
    sgst: figures.sgst,
    total: figures.total
  }, {
    subtotal: 3000,
    discount: 150,
    tax: 142.5,
    cgst: 71.25,
    sgst: 71.25,
    total: 2992.5
  });
});

test('invoice render shows the billed GST and total without a reconciliation warning', function () {
  const billed = pricing.computeTotals(riceOrder().items, '');
  const html = invoice.render(riceOrder({ total: billed.total }));

  assert.match(html, new RegExp('Invoice Total</td><td class="r">\\u20b9672\\.00'));
  assert.match(html, new RegExp('CGST \\+ SGST \\(Total GST\\)</td><td class="r">\\u20b932\\.00'));
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});
