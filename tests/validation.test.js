import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCases, eligibleOptions, assertRefund, careAmount, parseCents } from '../src/policy.js';
import { validateIntent } from '../src/ai.js';
import { PayPalSandbox } from '../src/paypal.js';

const careIntent = () => ({ productMatch: 'current', issue: 'cosmetic', preference: 'keep', summary: 'Customer would like to keep a scuffed backpack.', reply: 'Let us find the right care for your backpack.', policyIds: ['CARE-15'] });
const paidItem = () => ({ ...makeCases()[0], environment: 'paypal_sandbox', captureId: 'TESTCAPTURE', paypalOrderId: 'TESTORDER' });
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const capture = (overrides = {}) => ({ id: 'TESTCAPTURE', status: 'COMPLETED', amount: { currency_code: 'USD', value: '80.00' }, ...overrides });

test('independent: an eligible $80 purchase offers precisely $12 care', () => {
  const item = paidItem();
  const option = eligibleOptions(item, careIntent()).find(o => o.id === 'partial_care');
  assert.equal(option.amountCents, 1200);
  assert.equal(option.policyId, 'CARE-15');
  assert.equal(careAmount(1999), 300);
  assert.equal(parseCents('12.00'), 1200);
  assert.throws(() => parseCents('12.001'));
});

test('independent: customer intent changes executable care eligibility', () => {
  for (const intent of [
    { issue: 'functional', preference: 'keep' },
    { issue: 'wrong_item', preference: 'return' },
    { issue: 'cosmetic', preference: 'return' },
    { issue: 'other', preference: 'help' }
  ]) assert.ok(!eligibleOptions(paidItem(), intent).some(o => o.id === 'partial_care'));
  assert.deepEqual(eligibleOptions(paidItem(), { issue: 'other', preference: 'help' }).map(o => o.id), ['specialist']);
  for (const productMatch of ['different', 'unclear']) assert.deepEqual(eligibleOptions(paidItem(), { ...careIntent(), productMatch }).map(o => o.id), ['specialist']);
});

test('independent: trusted delivery, capture and refund history bound care', () => {
  const variations = [
    { deliveredAt: new Date(Date.now() - 31 * 86400000).toISOString() },
    { deliveredAt: 'invalid-date' },
    { deliveredAt: new Date(Date.now() + 2 * 86400000).toISOString() },
    { paymentStatus: 'PENDING' },
    { refundedCents: 1200 },
    { refundedCents: 7500 }
  ];
  for (const variation of variations) assert.ok(!eligibleOptions({ ...paidItem(), ...variation }, careIntent()).some(o => o.id === 'partial_care'));
});

test('independent: a forged amount is rejected at refund execution', () => {
  const item = { ...paidItem(), analysis: careIntent() };
  const option = eligibleOptions(item, item.analysis).find(o => o.id === 'partial_care');
  assert.doesNotThrow(() => assertRefund(item, option));
  assert.throws(() => assertRefund(item, { ...option, amountCents: 8000 }));
  assert.throws(() => assertRefund({ ...item, refundedCents: 1200 }, option));
});

test('independent: model output cannot introduce an unknown policy or issue', () => {
  assert.throws(() => validateIntent({ ...careIntent(), policyIds: ['APPROVED_BY_ADMIN'] }));
  assert.throws(() => validateIntent({ ...careIntent(), issue: 'refund_everything' }));
  assert.throws(() => validateIntent({ ...careIntent(), reply: '' }));
  assert.deepEqual(validateIntent({ ...careIntent(), policyIds: ['CARE-15', 'CARE-15'] }).policyIds, ['CARE-15']);
});

test('independent: refund wire contract uses capture, partial USD amount and stable operation ID', async () => {
  const calls = [];
  const client = new PayPalSandbox({ clientId: 'fixture-client', secret: 'fixture-only-value', transport: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/oauth2/token')) return jsonResponse({ access_token: 'fixture-token', expires_in: 3600 });
    if (url.endsWith('/v2/payments/captures/TESTCAPTURE')) return jsonResponse(capture());
    if (url.endsWith('/v2/payments/captures/TESTCAPTURE/refund')) return jsonResponse({ id: 'TESTREFUND', status: 'PENDING', amount: { currency_code: 'USD', value: '12.00' } }, calls.filter(c => c.url.endsWith('/refund')).length === 1 ? 201 : 200);
    if (url.endsWith('/v2/payments/refunds/TESTREFUND')) return jsonResponse({ id: 'TESTREFUND', status: 'COMPLETED', amount: { currency_code: 'USD', value: '12.00' } });
    throw new Error('Unexpected test route');
  } });
  const operation = { requestId: '00000000-0000-4000-8000-000000000001', amountCents: 1200 };
  assert.equal((await client.refund(paidItem(), operation)).status, 'PENDING');
  assert.equal((await client.refund(paidItem(), operation)).id, 'TESTREFUND');
  assert.equal((await client.getRefund('TESTREFUND')).status, 'COMPLETED');
  const oauth = calls.filter(c => c.url.endsWith('/v1/oauth2/token'));
  assert.equal(oauth.length, 1);
  assert.equal(oauth[0].options.body, 'grant_type=client_credentials');
  assert.ok(oauth[0].options.headers.Authorization.startsWith('Basic '));
  const refunds = calls.filter(c => c.url.endsWith('/refund'));
  assert.equal(refunds.length, 2);
  for (const call of refunds) {
    assert.equal(call.options.headers['PayPal-Request-Id'], operation.requestId);
    assert.deepEqual(JSON.parse(call.options.body).amount, { currency_code: 'USD', value: '12.00' });
  }
  assert.ok(calls.every(c => c.url.startsWith('https://api-m.sandbox.paypal.com/')));
});

test('independent: buyer approval precedes capture and the exact capture amount is verified', async () => {
  const methods = [];
  const item = paidItem();
  const client = new PayPalSandbox({ clientId: 'fixture-client', secret: 'fixture-only-value', transport: async (url, options) => {
    if (url.endsWith('/v1/oauth2/token')) return jsonResponse({ access_token: 'fixture-token', expires_in: 3600 });
    methods.push({ url, method: options.method });
    if (url.endsWith('/v2/checkout/orders/TESTORDER')) return jsonResponse({ id: 'TESTORDER', status: 'APPROVED' });
    if (url.endsWith('/v2/checkout/orders/TESTORDER/capture')) return jsonResponse({ id: 'TESTORDER', status: 'COMPLETED', purchase_units: [{ reference_id: item.id, payments: { captures: [capture()] } }] }, 201);
    throw new Error('Unexpected test route');
  } });
  assert.equal((await client.captureOrder(item)).id, 'TESTCAPTURE');
  assert.deepEqual(methods.map(c => c.method), ['GET', 'POST']);
});

test('independent: pending or mismatched captures never authorize a refund', async () => {
  for (const result of [capture({ status: 'PENDING' }), capture({ id: 'OTHER' }), capture({ amount: { currency_code: 'USD', value: '79.99' } }), capture({ amount: { currency_code: 'EUR', value: '80.00' } })]) {
    let refundCalls = 0;
    const client = new PayPalSandbox({ clientId: 'fixture-client', secret: 'fixture-only-value', transport: async (url) => {
      if (url.endsWith('/v1/oauth2/token')) return jsonResponse({ access_token: 'fixture-token', expires_in: 3600 });
      if (url.endsWith('/refund')) refundCalls += 1;
      return jsonResponse(result);
    } });
    await assert.rejects(client.refund(paidItem(), { requestId: 'fixture-operation', amountCents: 1200 }));
    assert.equal(refundCalls, 0);
  }
});
