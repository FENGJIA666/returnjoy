import { AppError, money, parseCents } from './policy.js';

// This application always uses PayPal's sandbox. No environment variable changes this host.
const BASE = 'https://api-m.sandbox.paypal.com';
export class PayPalSandbox {
  constructor({ clientId = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET, transport = fetch } = {}) { this.clientId = clientId; this.secret = secret; this.transport = transport; this.token = null; this.expires = 0; }
  get configured() { return Boolean(this.clientId && this.secret); }
  async auth() {
    if (!this.configured) throw new AppError('Add your PayPal Sandbox app credentials on the server to connect this journey.', 503, 'SANDBOX_CONFIGURATION');
    if (this.token && Date.now() < this.expires) return this.token;
    const response = await this.transport(`${BASE}/v1/oauth2/token`, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    if (!response.ok) throw new AppError('Check your Sandbox app credentials and reconnect.', 502, 'PAYPAL_AUTH');
    const data = await response.json();
    this.token = data.access_token; this.expires = Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000;
    return this.token;
  }
  async request(route, { method = 'GET', body, requestId } = {}) {
    const token = await this.auth();
    let response;
    try { response = await this.transport(`${BASE}${route}`, { method, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(requestId ? { 'PayPal-Request-Id': requestId, Prefer: 'return=representation' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new AppError('PayPal Sandbox is processing this step. Use Refresh status to continue with the same request.', 502, 'PAYPAL_UNCERTAIN'); }
    let data = {}; try { data = await response.json(); } catch { /* status handled below */ }
    if (!response.ok) throw new AppError(response.status === 422 ? 'Complete buyer approval in PayPal Sandbox, then continue this checkout.' : 'Reconnect to PayPal Sandbox and refresh this step.', 502, 'PAYPAL_RESPONSE');
    return data;
  }
  async createOrder(item, origin) {
    return this.request('/v2/checkout/orders', {
      method: 'POST', requestId: `rj-order-${item.id}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: item.id, custom_id: item.id, description: `${item.product} — ReturnJoy demonstration`, amount: { currency_code: 'USD', value: money(item.amountCents) } }],
        payment_source: { paypal: { experience_context: { brand_name: 'Morrow Studio · ReturnJoy', user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING', return_url: `${origin}/?checkout=${encodeURIComponent(item.id)}`, cancel_url: `${origin}/?checkout=${encodeURIComponent(item.id)}&cancelled=1` } } }
      }
    });
  }
  async captureOrder(item) {
    const order = await this.request(`/v2/checkout/orders/${encodeURIComponent(item.paypalOrderId)}`, {});
    if (!['APPROVED','COMPLETED'].includes(order.status)) throw new AppError('Approve this purchase in PayPal Sandbox to continue.', 409, 'BUYER_APPROVAL');
    const data = order.status === 'COMPLETED' ? order : await this.request(`/v2/checkout/orders/${encodeURIComponent(item.paypalOrderId)}/capture`, { method: 'POST', requestId: `rj-cap-${item.id}`, body: {} });
    const unit = data.purchase_units?.find(u => u.reference_id === item.id);
    const capture = unit?.payments?.captures?.find(c => c.status === 'COMPLETED');
    if (!capture || capture.amount?.currency_code !== 'USD' || parseCents(capture.amount.value) !== item.amountCents) throw new AppError('Refresh this checkout to align the purchase details.', 502, 'CAPTURE_MISMATCH');
    return capture;
  }
  async getCapture(item) {
    const capture = await this.request(`/v2/payments/captures/${encodeURIComponent(item.captureId)}`);
    if (capture.id !== item.captureId || capture.amount?.currency_code !== 'USD' || parseCents(capture.amount.value) !== item.amountCents || !['COMPLETED','PARTIALLY_REFUNDED'].includes(capture.status)) throw new AppError('Refresh the original purchase before continuing.', 409, 'CAPTURE_MISMATCH');
    return capture;
  }
  async refund(item, operation) {
    const capture = await this.getCapture(item);
    if (capture.status === 'PARTIALLY_REFUNDED') throw new AppError('Match this purchase with its existing refund before continuing.', 409, 'EXISTING_REFUND');
    return this.request(`/v2/payments/captures/${encodeURIComponent(item.captureId)}/refund`, { method: 'POST', requestId: operation.requestId, body: { amount: { currency_code: 'USD', value: money(operation.amountCents) }, invoice_id: operation.requestId, note_to_payer: 'A little care, with joy. Your Morrow Studio care refund.' } });
  }
  async getRefund(id) { return this.request(`/v2/payments/refunds/${encodeURIComponent(id)}`); }
}

export class PracticePayments {
  async refund(item, operation) { return { id: `LOCAL-${operation.requestId}`, status: 'COMPLETED', amount: { currency_code: 'USD', value: money(operation.amountCents) } }; }
  async getRefund(id, operation) { return { id, status: 'COMPLETED', amount: { currency_code: 'USD', value: money(operation.amountCents) } }; }
}
