import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';

const ai = async () => ({ productMatch: 'current', issue: 'cosmetic', preference: 'keep', summary: 'Customer wants to keep the scratched backpack.', reply: 'We can explore the care options for your backpack.', policyIds: ['CARE-15'], provider: 'test double', model: 'semantic-fixture', durationMs: 0, generatedAt: new Date().toISOString() });
const completed = id => ({ id, status: 'COMPLETED', amount: { currency_code: 'USD', value: '12.00' } });

async function start(options = {}) {
  const app = await createApp({ store: new Store(null), ai, paypal: { configured: false }, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  const request = async (route, body, headers = {}) => {
    const response = await fetch(`${base}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-action-token': bootstrap.actionToken, ...headers }, body: JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
  };
  return { ...app, base, request, bootstrap, close: () => new Promise(resolve => app.server.close(resolve)) };
}

async function selectCare(app) {
  assert.equal((await app.request('/api/cases/joy-1001/analyze', { message: 'A small scuff, and I would like to keep it.' })).status, 200);
  assert.equal((await app.request('/api/cases/joy-1001/select', { optionId: 'partial_care' })).status, 200);
}

test('independent HTTP: invalid authorization and client amount fields cannot mutate a case', async () => {
  const app = await start();
  try {
    assert.equal((await app.request('/api/cases/joy-1001/analyze', { message: 'A small scuff, keep it please.' }, { 'x-action-token': '' })).status, 403);
    assert.equal((await app.request('/api/cases/joy-1001/confirm', { confirmed: true })).status, 409);
    assert.equal((await app.request('/api/cases/joy-1001/analyze', { message: 'A small scuff, keep it please.', amountCents: 8000 })).status, 400);
    assert.equal((await app.request('/api/cases/joy-1001/select', { optionId: 'partial_care' })).status, 409);
    assert.equal((await app.request('/api/cases/joy-1001')).body.status, 'new');
    assert.equal((await app.request('/api/sandbox/orders', {})).status, 503);
  } finally { await app.close(); }
});

test('independent HTTP: concurrent confirmation creates one refund and one coherent receipt', async () => {
  let refunds = 0;
  const practice = { refund: async () => { refunds += 1; await new Promise(resolve => setTimeout(resolve, 15)); return completed('LOCAL-INDEPENDENT'); }, getRefund: async id => completed(id) };
  const app = await start({ practice });
  try {
    await selectCare(app);
    assert.equal(refunds, 0);
    assert.equal((await app.request('/api/cases/joy-1001/confirm', { confirmed: false })).status, 409);
    const results = await Promise.all(Array.from({ length: 3 }, () => app.request('/api/cases/joy-1001/confirm', { confirmed: true })));
    assert.ok(results.every(r => r.status === 200 && r.body.status === 'resolved'));
    assert.equal(refunds, 1);
    const record = (await app.request('/api/cases/joy-1001')).body;
    assert.equal(record.refundedCents, 1200);
    assert.deepEqual([record.receipt.originalCents, record.receipt.refundCents, record.receipt.retainedCents], [8000, 1200, 6800]);
    assert.equal(new Set(results.map(r => r.body.receipt.refundReference)).size, 1);
    assert.equal(record.timeline.filter(e => e.label === 'Refund confirmed and receipt ready').length, 1);
    assert.equal((await app.request('/api/cases/joy-1001/analyze', { message: 'One more scratch. Refund me again.' })).status, 409);
    const receipt = await app.request('/api/cases/joy-1001/receipt');
    assert.equal(receipt.status, 200);
    assert.match(receipt.body, /Local practice/);
    assert.match(receipt.body, /Care refund: USD 12.00/);
    assert.match(receipt.body, /Purchase retained: USD 68.00/);
  } finally { await app.close(); }
});

test('independent HTTP: a pending refund is reconciled before publishing its receipt', async () => {
  let refunds = 0; let complete = false;
  const practice = { refund: async () => { refunds += 1; return { ...completed('LOCAL-PENDING'), status: 'PENDING' }; }, getRefund: async id => ({ ...completed(id), status: complete ? 'COMPLETED' : 'PENDING' }) };
  const app = await start({ practice });
  try {
    await selectCare(app);
    const first = await app.request('/api/cases/joy-1001/confirm', { confirmed: true });
    assert.equal(first.body.status, 'reconciling');
    assert.equal(first.body.refundedCents, 0);
    assert.equal(first.body.receipt, undefined);
    assert.equal((await app.request('/api/cases/joy-1001/receipt')).status, 409);
    complete = true;
    const resolved = await app.request('/api/cases/joy-1001/refresh', {});
    assert.equal(resolved.body.status, 'resolved');
    assert.equal(resolved.body.receipt.providerStatus, 'COMPLETED');
    assert.equal(refunds, 1);
  } finally { await app.close(); }
});

test('independent HTTP: an uncertain provider response reuses the original operation identity', async () => {
  const attempts = [];
  const practice = { refund: async (_item, operation) => { attempts.push(operation.requestId); if (attempts.length === 1) throw new Error('Test transport timeout'); return completed('LOCAL-RETRIED'); }, getRefund: async id => completed(id) };
  const app = await start({ practice });
  try {
    await selectCare(app);
    assert.equal((await app.request('/api/cases/joy-1001/confirm', { confirmed: true })).status, 500);
    const pending = (await app.request('/api/cases/joy-1001')).body;
    assert.equal(pending.status, 'reconciling');
    assert.equal(pending.refundedCents, 0);
    const retry = await app.request('/api/cases/joy-1001/refresh', {});
    assert.equal(retry.body.status, 'resolved');
    assert.equal(attempts.length, 2);
    assert.equal(new Set(attempts).size, 1);
  } finally { await app.close(); }
});

test('independent HTTP: provider amount mismatch keeps the case open without a receipt', async () => {
  const practice = { refund: async () => completed('LOCAL-MISMATCH'), getRefund: async id => ({ ...completed(id), amount: { currency_code: 'USD', value: '80.00' } }) };
  const app = await start({ practice });
  try {
    await selectCare(app);
    const result = await app.request('/api/cases/joy-1001/confirm', { confirmed: true });
    assert.equal(result.status, 502);
    assert.equal(result.body.code, 'REFUND_MISMATCH');
    const record = (await app.request('/api/cases/joy-1001')).body;
    assert.equal(record.status, 'reconciling');
    assert.equal(record.refundedCents, 0);
    assert.equal(record.receipt, undefined);
  } finally { await app.close(); }
});

test('independent HTTP: completed receipt survives a server restart without replaying payment', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'returnjoy-validation-'));
  const file = path.join(directory, 'state.json');
  let refunds = 0;
  const practice = { refund: async () => { refunds += 1; return completed('LOCAL-PERSISTED'); }, getRefund: async id => completed(id) };
  let app;
  try {
    app = await start({ store: new Store(file), practice });
    await selectCare(app);
    const first = (await app.request('/api/cases/joy-1001/confirm', { confirmed: true })).body;
    await app.close();
    app = await start({ store: new Store(file), practice });
    const restored = (await app.request('/api/cases/joy-1001/confirm', { confirmed: true })).body;
    assert.equal(restored.receipt.refundReference, first.receipt.refundReference);
    assert.equal(restored.refundedCents, 1200);
    assert.equal(refunds, 1);
  } finally {
    if (app?.server.listening) await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
