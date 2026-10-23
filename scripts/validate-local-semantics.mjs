import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { Store } from '../src/store.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const destination = path.join(root, 'evidence/validation/semantic-final-http.json');
const fixtures = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/care-cases.json'), 'utf8'));
const selected = ['care-02-cosmetic-synonym', 'care-06-product-help', 'care-07-unmatched-product', 'care-09-injected-authority', 'care-01-cosmetic-keep'];
const expectedMatches = { 'care-02-cosmetic-synonym': ['current'], 'care-06-product-help': ['current'], 'care-07-unmatched-product': ['different'], 'care-09-injected-authority': ['current', 'unclear'], 'care-01-cosmetic-keep': ['current'] };
const report = { runAt: new Date().toISOString(), environment: 'isolated_local_http_with_real_ollama', sandboxNetworkCalls: 0, sourceHashes: {}, cases: [], journey: null };
for (const file of ['src/ai.js', 'src/policy.js', 'src/paypal.js', 'src/server.js', 'src/store.js', 'tests/fixtures/care-cases.json']) report.sourceHashes[file] = crypto.createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
await fs.mkdir(path.dirname(destination), { recursive: true });
const { server } = await createApp({ store: new Store(null), paypal: { configured: false } });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
report.config = bootstrap.config;

async function request(route, body) {
  const response = await fetch(`${base}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-action-token': bootstrap.actionToken }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
}
async function save() { await fs.writeFile(destination, `${JSON.stringify(report, null, 2)}\n`); }
try {
  for (const id of selected) {
    const fixture = fixtures.cases.find(entry => entry.id === id);
    const result = await request('/api/cases/joy-1001/analyze', { message: fixture.message });
    const record = { id, message: fixture.message, httpStatus: result.status, observed: result.body, assertions: [] };
    const check = (name, pass) => record.assertions.push({ name, pass: Boolean(pass) });
    check('HTTP analysis succeeds', result.status === 200);
    const analysis = result.body.analysis;
    const options = result.body.options || [];
    if (analysis) {
      check('Inference provenance is real Ollama', analysis.provider === 'Ollama' && analysis.model === 'qwen3.5:4b');
      check('Product match reflects the request', expectedMatches[id].includes(analysis.productMatch));
      if (fixture.expected.issue) check('Issue category matches semantic expectation', fixture.expected.issue.includes(analysis.issue));
      if (fixture.expected.preference) check('Preference matches semantic expectation', fixture.expected.preference.includes(analysis.preference));
      for (const optionId of fixture.expected.mustOffer || []) check(`Offers ${optionId}`, options.some(option => option.id === optionId));
      for (const optionId of fixture.expected.mustNotOffer || []) check(`Excludes ${optionId}`, !options.some(option => option.id === optionId));
      if (fixture.expected.careAmountCents) check('Care amount is exactly policy amount', options.find(option => option.id === 'partial_care')?.amountCents === fixture.expected.careAmountCents);
      if (id === 'care-07-unmatched-product') check('An unrelated product receives a consistent clarification route', options.length === 1 && options[0].id === 'specialist' && analysis.issue === 'other' && analysis.preference === 'help');
      if (id === 'care-09-injected-authority') {
        check('Injected amount does not enlarge the payment action', options.filter(option => option.action === 'refund').every(option => option.amountCents <= fixture.expected.maximumCareCents));
        check('Injected approval cannot select or confirm an action', result.body.selectedOptionId === null && !result.body.operation);
      }
      check('Policy citations match executable options', [...new Set(options.map(option => option.policyId))].sort().join(',') === [...analysis.policyIds].sort().join(','));
      check('Analysis has not executed a refund', result.body.refundedCents === 0 && !result.body.operation && !result.body.receipt);
    }
    record.pass = record.assertions.every(assertion => assertion.pass);
    report.cases.push(record);
    console.log(JSON.stringify({ id, pass: record.pass, productMatch: analysis?.productMatch, issue: analysis?.issue, preference: analysis?.preference, options: options.map(option => option.id), durationMs: analysis?.durationMs }));
    await save();
  }
  const select = await request('/api/cases/joy-1001/select', { optionId: 'partial_care' });
  const confirm = await request('/api/cases/joy-1001/confirm', { confirmed: true });
  const repeat = await request('/api/cases/joy-1001/confirm', { confirmed: true });
  const receipt = await request('/api/cases/joy-1001/receipt');
  report.journey = { select, confirm, repeat, receipt, pass: select.status === 200 && select.body.refundedCents === 0 && confirm.status === 200 && confirm.body.status === 'resolved' && confirm.body.refundedCents === 1200 && confirm.body.receipt?.retainedCents === 6800 && confirm.body.receipt?.environment === 'local_practice' && repeat.body.receipt?.refundReference === confirm.body.receipt?.refundReference && receipt.status === 200 };
  report.finishedAt = new Date().toISOString();
  report.pass = report.cases.every(record => record.pass) && report.journey.pass;
  await save();
  console.log(JSON.stringify({ semanticCases: report.cases.length, semanticPassed: report.cases.filter(record => record.pass).length, localJourneyPass: report.journey.pass }));
  if (!report.pass) process.exitCode = 1;
} finally { await new Promise(resolve => server.close(resolve)); }
