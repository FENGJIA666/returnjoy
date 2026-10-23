import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Store } from './store.js';
import { AppError, POLICY, makeCases, eligibleOptions, assertRefund, parseCents, money } from './policy.js';
import { analyzeWithOllama } from './ai.js';
import { PayPalSandbox, PracticePayments } from './paypal.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const MERCHANT = 'morrow-studio';
const environmentLabel = value => value === 'paypal_sandbox' ? 'PayPal Sandbox' : 'Local practice';
const shortReference = value => `…${String(value).slice(-6)}`;
const event = (item, label) => item.timeline.push({ label, at: new Date().toISOString() });
function publicCase(item) {
  const { merchantId, captureId, paypalOrderId, approvalUrl, operation, ...safe } = item;
  return { ...safe, ...(item.receipt ? { receipt: { ...item.receipt, refundReference: shortReference(item.receipt.refundReference) } } : {}), environmentLabel: environmentLabel(item.environment), hasPayment: Boolean(captureId), ...(operation ? { operation: { status: operation.status, amountCents: operation.amountCents, confirmedAt: operation.confirmedAt } } : {}) };
}
function exact(body, fields) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !fields.includes(k))) throw new AppError('Use the fields shown in this care step.');
}
async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('Send this action as JSON.', 415);
  let body = '';
  for await (const part of request) { body += part; if (Buffer.byteLength(body) > 16384) throw new AppError('Keep your message within 2,000 characters.', 413); }
  try { return JSON.parse(body || '{}'); } catch { throw new AppError('Send a valid JSON care request.'); }
}
export async function createApp({ store = new Store(path.join(process.env.DATA_DIR || path.join(root, '.data'), 'state.json')), ai = analyzeWithOllama, paypal = new PayPalSandbox(), practice = new PracticePayments() } = {}) {
  await store.init();
  const actionToken = randomBytes(32).toString('hex');
  let aiQueue = Promise.resolve();
  async function queuedAI(item, message) {
    const task = aiQueue.then(() => ai(item, message));
    aiQueue = task.catch(() => {});
    return task;
  }
  function getCase(id) { const item = store.state.cases.find(c => c.id === id && c.merchantId === MERCHANT); if (!item) throw new AppError('Choose a case from your care inbox.', 404, 'CASE_NOT_FOUND'); return item; }
  async function settle(item) {
    const op = item.operation;
    const provider = item.environment === 'paypal_sandbox' ? paypal : practice;
    if (!op.refundId) {
      if (op.attemptedAt && Date.now() - Date.parse(op.attemptedAt) > 5 * 3600000) throw new AppError('Match this request with its PayPal Sandbox activity before continuing.', 409, 'RECONCILE_REQUIRED');
      op.attemptedAt ||= new Date().toISOString(); op.attempts = (op.attempts || 0) + 1;
      await store.save();
      const refund = await provider.refund(item, op);
      if (!refund.id || typeof refund.id !== 'string') throw new AppError('Refresh status to align this refund with the payment record.', 502, 'REFUND_PENDING');
      op.refundId = refund.id; await store.save();
    }
    const observed = await provider.getRefund(op.refundId, op);
    if (observed.id !== op.refundId || observed.amount?.currency_code !== 'USD' || parseCents(observed.amount.value) !== op.amountCents) throw new AppError('Refresh status to align the care amount with the payment record.', 502, 'REFUND_MISMATCH');
    op.status = observed.status;
    op.checkedAt = new Date().toISOString();
    if (observed.status === 'COMPLETED') {
      item.refundedCents = op.amountCents; item.status = 'resolved';
      if (!item.receipt) event(item, 'Refund confirmed and receipt ready');
      item.receipt = { id: `RJ-${item.id}-CARE`, environment: item.environment, environmentLabel: environmentLabel(item.environment), customer: item.customer, product: item.product, orderLabel: item.orderLabel, currency: 'USD', originalCents: item.amountCents, refundCents: op.amountCents, retainedCents: item.amountCents - op.amountCents, policyId: 'CARE-15', providerStatus: observed.status, verification: item.environment === 'paypal_sandbox' ? 'PayPal refund status retrieved and amount matched' : 'Local practice payment record matched', refundReference: op.refundId, confirmedAt: op.confirmedAt, verifiedAt: op.checkedAt, merchant: 'Morrow Studio' };
    } else { item.status = 'reconciling'; }
    await store.save(); return publicCase(item);
  }
  const server = http.createServer(async (request, response) => {
    const send = (status, body, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers }); response.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      const aliases = new Set([expectedHost, `localhost:${server.address().port}`]);
      if (!aliases.has(request.headers.host)) throw new AppError('Open ReturnJoy on its local address.', 403);
      const origin = `http://${request.headers.host}`;
      if (request.headers.origin && request.headers.origin !== origin) throw new AppError('Open this action in ReturnJoy.', 403, 'ORIGIN');
      const url = new URL(request.url, origin);
      if (request.method === 'POST') {
        const supplied = Buffer.from(String(request.headers['x-action-token'] || ''));
        const expected = Buffer.from(actionToken);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new AppError('Refresh ReturnJoy to continue your session.', 403, 'ACTION_TOKEN');
      }
      if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
        let aiReady = false;
        try { const res = await fetch(new URL('/api/tags', process.env.OLLAMA_URL || 'http://127.0.0.1:11434'), { signal: AbortSignal.timeout(1200) }); const tags = await res.json(); aiReady = tags.models?.some(m => m.name === (process.env.OLLAMA_MODEL || 'qwen3.5:4b')) || false; } catch {}
        return send(200, { actionToken, environment: 'local_practice', merchant: { name: 'Morrow Studio', initials: 'MS' }, cases: store.state.cases.map(publicCase), policies: POLICY, config: { paypalConfigured: paypal.configured, ai: { ready: aiReady, model: process.env.OLLAMA_MODEL || 'qwen3.5:4b', provider: 'Ollama' } } });
      }
      if (url.pathname === '/api/sandbox/orders' && request.method === 'POST') {
        const body = await readJson(request); exact(body, []);
        if (!paypal.configured) throw new AppError('Add your PayPal Sandbox app credentials on the server to connect this journey.', 503, 'SANDBOX_CONFIGURATION');
        return await store.lock('sandbox-create', async () => {
          let item = store.state.cases.find(c => c.environment === 'paypal_sandbox' && c.status === 'checkout');
          if (!item) { item = { ...makeCases()[0], id: `sb-${randomUUID().slice(0, 18)}`, environment: 'paypal_sandbox', orderLabel: 'Sandbox purchase', captureId: null, paymentStatus: 'AWAITING_APPROVAL', status: 'checkout' }; store.state.cases.push(item); await store.save(); }
          if (!item.paypalOrderId) {
            const order = await paypal.createOrder(item, origin);
            const approval = order.links?.find(link => ['payer-action','approve'].includes(link.rel));
            if (!order.id || !approval || new URL(approval.href).hostname !== 'www.sandbox.paypal.com') throw new AppError('Reconnect the Sandbox checkout to continue.', 502, 'CHECKOUT_RESPONSE');
            item.paypalOrderId = order.id; item.approvalUrl = approval.href; await store.save();
          }
          return send(200, { environment: 'paypal_sandbox', case: publicCase(item), approvalUrl: item.approvalUrl });
        });
      }
      const match = url.pathname.match(/^\/api\/cases\/([a-zA-Z0-9-]+)(?:\/(analyze|select|confirm|refresh|capture|receipt))?$/);
      if (match) {
        const [, id, action] = match;
        if (request.method === 'GET' && !action) return send(200, publicCase(getCase(id)));
        if (request.method === 'GET' && action === 'receipt') {
          const item = getCase(id); if (!item.receipt) throw new AppError('Complete the care journey to receive your receipt.', 409);
          const r = item.receipt;
          const text = `RETURNJOY · MORROW STUDIO\nA little care, with joy.\n\n${r.environmentLabel} · Fictional demonstration data\nReceipt: ${r.id}\nCustomer: ${r.customer}\nOrder: ${r.orderLabel}\nItem: ${r.product}\n\nOriginal payment: USD ${money(r.originalCents)}\nCare refund: USD ${money(r.refundCents)}\nPurchase retained: USD ${money(r.retainedCents)}\nPolicy: ${r.policyId}\nStatus: ${r.providerStatus}\nVerification: ${r.verification}\nReference: ${shortReference(r.refundReference)}\nMerchant confirmed: ${r.confirmedAt}\nVerified: ${r.verifiedAt}\n\nMake every resolution a reason to return.\n`;
          return send(200, text, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="ReturnJoy-${item.id}.txt"` });
        }
        if (request.method !== 'POST') throw new AppError('Choose an available care action.', 405);
        const body = await readJson(request);
        return await store.lock(id, async () => {
          const item = getCase(id);
          if (action === 'analyze') {
            exact(body, ['message']);
            if (typeof body.message !== 'string' || body.message.trim().length < 8 || body.message.length > 2000) throw new AppError('Share a customer message between 8 and 2,000 characters.');
            if (item.operation || item.status === 'checkout') throw new AppError('Continue the current payment step before creating new options.', 409);
            const analysis = await queuedAI(item, body.message.trim());
            item.message = body.message.trim(); item.analysis = analysis; item.options = eligibleOptions(item, analysis); item.analysis.policyIds = [...new Set(item.options.map(option => option.policyId))]; item.selectedOptionId = null; item.status = 'options'; event(item, 'AI understood the request and matched care policies'); await store.save();
          } else if (action === 'select') {
            exact(body, ['optionId']);
            if (!['options','selected'].includes(item.status) || !item.options?.some(o => o.id === body.optionId)) throw new AppError('Choose one of the current care options.', 409);
            item.selectedOptionId = body.optionId; item.status = 'selected'; event(item, 'Customer selected a care option'); await store.save();
          } else if (action === 'confirm') {
            exact(body, ['confirmed']);
            if (body.confirmed !== true) throw new AppError('Confirm the displayed care option as the merchant.', 409);
            if (item.status === 'resolved' || item.status === 'follow_up') return send(200, publicCase(item));
            if (item.operation) return send(200, await settle(item));
            if (item.status !== 'selected') throw new AppError('Let the customer choose a care option first.', 409);
            const option = item.options.find(o => o.id === item.selectedOptionId);
            if (option.action !== 'refund') { item.status = 'follow_up'; item.followUp = option.action === 'return' ? 'Your return request is with Morrow Studio. Your merchant will share return instructions and review the returned item for a refund.' : 'Your message is with the Morrow Studio care team. A personal follow-up is the next step.'; event(item, 'Merchant confirmed the care follow-up'); await store.save(); }
            else {
              assertRefund(item, option);
              item.operation = { requestId: `rj-${randomUUID()}`.slice(0, 38), amountCents: option.amountCents, status: 'PENDING', confirmedAt: new Date().toISOString() };
              item.status = 'reconciling'; event(item, 'Merchant approved the exact care refund'); await store.save();
              return send(200, await settle(item));
            }
          } else if (action === 'refresh') {
            exact(body, []); if (!item.operation) throw new AppError('Choose and confirm a care option first.', 409); return send(200, await settle(item));
          } else if (action === 'capture') {
            exact(body, []);
            if (item.environment !== 'paypal_sandbox' || !item.paypalOrderId) throw new AppError('Start a PayPal Sandbox checkout first.', 409);
            if (item.captureId) return send(200, publicCase(item));
            const capture = await paypal.captureOrder(item); item.captureId = capture.id; item.paymentStatus = 'COMPLETED'; item.status = 'new'; event(item, 'PayPal Sandbox purchase captured'); await store.save();
          } else throw new AppError('Choose an available care action.', 404);
          return send(200, publicCase(item));
        });
      }
      if (url.pathname.startsWith('/api/')) throw new AppError('Choose an available ReturnJoy action.', 404);
      if (request.method !== 'GET') throw new AppError('Open a ReturnJoy page to continue.', 405);
      const asset = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html','app.js','styles.css','favicon.svg'].includes(asset)) throw new AppError('This page is available from the care inbox.', 404);
      const data = await fs.readFile(path.join(root, 'public', asset));
      response.writeHead(200, { 'Content-Type': MIME[path.extname(asset)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }); response.end(data);
    } catch (error) { send(error.status || 500, { error: error instanceof AppError ? error.message : 'This step needs a fresh connection. Refresh and continue.', code: error.code || 'SERVER_ERROR' }); }
  });
  return { server, store };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await createApp();
  server.listen(Number(process.env.PORT || 8794), '127.0.0.1', () => console.log(`ReturnJoy is ready at http://127.0.0.1:${server.address().port}`));
}
