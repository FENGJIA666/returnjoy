import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parseCents, careAmount, eligibleOptions, makeCases } from '../src/policy.js';
import { validateIntent } from '../src/ai.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';

test('money parser rejects ambiguous precision and care rounding stays in integer cents', () => {
  for (const value of ['12', '12.0', '12.001', '-12.00', '1e3', 'NaN', 12, '0.00']) assert.throws(() => parseCents(value));
  assert.equal(parseCents('80.00'), 8000);
  assert.equal(careAmount(999), 150);
  assert.equal(careAmount(1), 0);
});

test('a model-detected product mismatch deterministically becomes personal clarification', () => {
  const result = validateIntent({ productMatch: 'different', issue: 'cosmetic', preference: 'keep', summary: 'Customer mentions a different product.', reply: 'I can help.', policyIds: ['CARE-15'] });
  assert.equal(result.issue, 'other'); assert.equal(result.preference, 'help');
  assert.deepEqual(result.policyIds, ['CARE-TEAM']);
  assert.deepEqual(eligibleOptions(makeCases()[0], result).map(o => o.id), ['specialist']);
});

test('cross-origin mutation and unknown purchase identifiers cannot enter inference', async () => {
  let inferred = 0;
  const { server } = await createApp({ store: new Store(null), paypal: { configured: false }, ai: async () => { inferred += 1; throw new Error('Should not be reached'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const bootstrap = await (await fetch(`${origin}/api/bootstrap`)).json();
    const headers = { 'Content-Type': 'application/json', 'X-Action-Token': bootstrap.actionToken };
    const body = JSON.stringify({ message: 'A small scuff, and I want to keep the backpack.' });
    assert.equal((await fetch(`${origin}/api/cases/joy-1001/analyze`, { method: 'POST', headers: { ...headers, Origin: 'https://another.example' }, body })).status, 403);
    assert.equal((await fetch(`${origin}/api/cases/unknown/analyze`, { method: 'POST', headers, body })).status, 404);
    assert.equal(inferred, 0);
    assert.ok(!JSON.stringify(bootstrap).includes('captureId'));
    assert.ok(!JSON.stringify(bootstrap).includes('clientId'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('a terminal provider status remains visible and cannot publish a receipt or repeat the refund', async () => {
  let posted = 0;
  const ai = async () => ({ productMatch: 'current', issue: 'cosmetic', preference: 'keep', summary: 'Keep the scuffed backpack.', reply: 'We can explore a thoughtful choice.', policyIds: ['CARE-15'] });
  const practice = { refund: async () => { posted += 1; return { id: 'LOCAL-TERMINAL' }; }, getRefund: async id => ({ id, status: 'FAILED', amount: { value: '12.00', currency_code: 'USD' } }) };
  const { server } = await createApp({ store: new Store(null), paypal: { configured: false }, ai, practice });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const bootstrap = await (await fetch(`${origin}/api/bootstrap`)).json();
    const post = async (action, body) => (await fetch(`${origin}/api/cases/joy-1001/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Action-Token': bootstrap.actionToken }, body: JSON.stringify(body) })).json();
    await post('analyze', { message: 'The backpack has a small scuff and I want to keep it.' });
    await post('select', { optionId: 'partial_care' });
    const failed = await post('confirm', { confirmed: true });
    assert.equal(failed.operation.status, 'FAILED'); assert.equal(failed.status, 'reconciling');
    assert.equal(failed.receipt, undefined); assert.equal(failed.refundedCents, 0);
    const refreshed = await post('refresh', {});
    assert.equal(refreshed.operation.status, 'FAILED'); assert.equal(refreshed.receipt, undefined); assert.equal(posted, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
