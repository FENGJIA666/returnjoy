import test from 'node:test';
import assert from 'node:assert/strict';
import { PayPalSandbox } from '../src/paypal.js';
import { eligibleOptions, makeCases } from '../src/policy.js';

const fixtureItem = { captureId: 'ANTI-TEST-CAPTURE', amountCents: 8000 };
const json = data => new Response(JSON.stringify(data), { status: 200 });
const capture = status => ({ id: fixtureItem.captureId, status, amount: { currency_code: 'USD', value: '80.00' } });

test('anti review: an existing partial refund remains blocked across repeated refresh attempts', async () => {
  let refundPosts = 0;
  const client = new PayPalSandbox({ clientId: 'fixture', secret: 'fixture', transport: async (url) => {
    if (url.endsWith('/token')) return json({ access_token: 'fixture', expires_in: 3600 });
    if (url.endsWith('/refund')) { refundPosts += 1; return json({ id: 'UNEXPECTED' }); }
    return json(capture('PARTIALLY_REFUNDED'));
  } });
  for (const attempts of [1, 2, 3, 20]) {
    await assert.rejects(client.refund(fixtureItem, { requestId: 'anti-fixed-operation', amountCents: 1200, attempts }), { code: 'EXISTING_REFUND' });
  }
  assert.equal(refundPosts, 0, 'An unrelated earlier refund must never become a new care refund on refresh.');
});

test('anti review: an uncertain refund followed by a partial capture requires reconciliation', async () => {
  let refundPosts = 0;
  const client = new PayPalSandbox({ clientId: 'fixture', secret: 'fixture', transport: async (url) => {
    if (url.endsWith('/token')) return json({ access_token: 'fixture', expires_in: 3600 });
    if (url.endsWith('/refund')) { refundPosts += 1; throw new Error('Simulated response loss after provider processing'); }
    return json(capture(refundPosts ? 'PARTIALLY_REFUNDED' : 'COMPLETED'));
  } });
  const operation = { requestId: 'anti-uncertain-operation', amountCents: 1200, attempts: 1 };
  await assert.rejects(client.refund(fixtureItem, operation), { code: 'PAYPAL_UNCERTAIN' });
  operation.attempts = 2;
  await assert.rejects(client.refund(fixtureItem, operation), { code: 'EXISTING_REFUND' });
  assert.equal(refundPosts, 1, 'A changed capture without a known refund ID requires matching provider activity.');
});

test('anti review: the configured 30-day window ends at its exact elapsed-time boundary', t => {
  const now = Date.parse('2026-10-24T00:00:00.000Z');
  t.mock.method(Date, 'now', () => now);
  const intent = { productMatch: 'current', issue: 'cosmetic', preference: 'keep' };
  const optionsAtAge = age => eligibleOptions({ ...makeCases()[0], deliveredAt: new Date(now - age).toISOString() }, intent).map(option => option.id);
  assert.ok(optionsAtAge(30 * 86400000).includes('partial_care'));
  assert.deepEqual(optionsAtAge(30 * 86400000 + 1), ['specialist']);
  assert.deepEqual(optionsAtAge(30 * 86400000 + 3600000), ['specialist']);
  assert.deepEqual(optionsAtAge(-1), ['specialist']);
});
