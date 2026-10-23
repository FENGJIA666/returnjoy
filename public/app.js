const $ = selector => document.querySelector(selector);
const state = { cases: [], activeId: 'joy-1001', view: 'inbox', busy: '', error: '', review: true, editing: false, config: {}, policies: [], approvals: {} };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const cash = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const time = date => new Date(date).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
const current = () => state.cases.find(c => c.id === state.activeId) || state.cases[0];
const shapes = {
  inbox:'<path d="M4 4h16v16H4z"/><path d="M4 13h5l2 3h2l2-3h5"/>',
  book:'<path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1z"/><path d="M12 5v15"/>',
  activity:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  sparkle:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6z"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-5"/>',
  box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 5 9-5M12 12v9M7 5l9 5"/>',
  return:'<path d="M9 10H3V4m0 6 4-4a8 8 0 1 1-1 12"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  chat:'<path d="M21 11a9 9 0 0 1-9 9c-2 0-3-.3-5-1l-5 2 2-5a9 9 0 1 1 17-5z"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon = name => `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${shapes[name] || shapes.sparkle}</svg></span>`;
function art(type) {
  const drawings = {
    backpack:'<path d="M65 48v-8c0-18 30-18 30 0v8" fill="none" stroke="#496346" stroke-width="7"/><path d="M50 57c-13 8-12 52-8 72M110 57c13 8 12 52 8 72" fill="none" stroke="#748567" stroke-width="9"/><path d="M45 65c0-22 70-22 70 0v68c0 15-70 15-70 0z" fill="#8c9c70"/><path d="M45 65c0-22 70-22 70 0v19c-20 11-50 11-70 0z" fill="#a8b28d"/><path d="M58 103q22-10 44 0v27q-22 8-44 0z" fill="#73875c"/><path d="M61 104h38" stroke="#51663e" stroke-width="2"/><path d="M84 104v8" stroke="#d8d2a5" stroke-width="3" stroke-linecap="round"/><rect x="72" y="70" width="17" height="12" rx="2" fill="#d9bd8f"/><path d="M75 76h11" stroke="#977944" stroke-width="1.5"/><path d="M95 115l4 1" stroke="#c9ccae" stroke-width="2" stroke-linecap="round"/>',
    lamp:'<ellipse cx="80" cy="140" rx="35" ry="8" fill="#a3a79d"/><path d="M80 66v67" stroke="#637567" stroke-width="8"/><path d="M50 43c0-19 60-19 60 0l15 39H35z" fill="#cdc9b4"/><ellipse cx="80" cy="82" rx="45" ry="7" fill="#e6dcc0"/><path d="M50 43h60" stroke="#b4b19e" stroke-width="2"/>',
    bottle:'<rect x="65" y="24" width="30" height="17" rx="4" fill="#755544"/><path d="M64 42c-2 15-15 15-15 29v65c0 17 62 17 62 0V71c0-14-13-14-15-29z" fill="#b87956"/><path d="M60 67v60" stroke="#ca9875" stroke-width="5" stroke-linecap="round"/><path d="M64 42h32" stroke="#976445" stroke-width="3"/><path d="M79 85c-13 15-12 23 1 23 13 0 12-8-1-23z" fill="#edcfad"/>'
  };
  return `<svg role="img" aria-label="Illustration of ${esc(type)}" viewBox="0 0 160 160">${drawings[type] || drawings.backpack}</svg>`;
}
async function api(route, body) {
  const response = await fetch(route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Action-Token': state.actionToken }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Refresh this care step to continue.');
  return result;
}
function updateCase(item) { const index = state.cases.findIndex(c => c.id === item.id); if (index < 0) state.cases.push(item); else state.cases[index] = item; }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000); }
function stepIndex(item) { if (state.busy === 'analyze') return 0; if (item.status === 'resolved' || item.status === 'follow_up') return 3; if (item.status === 'reconciling' || (item.status === 'selected' && state.review)) return 2; if (item.analysis && !state.editing) return 1; return 0; }
function progress(item) { const labels = ['Understand','Choose','Confirm','Celebrate']; const at = stepIndex(item); return `<div class="progress" aria-label="Care journey progress">${labels.map((label,i) => `${i ? '<div class="step-line"></div>' : ''}<div class="step ${i === at ? 'active' : i < at ? 'done' : ''}" ${i === at ? 'aria-current="step"' : ''}><span>${i < at ? '✓' : i+1}</span>${label}</div>`).join('')}</div>`; }
function sidebar() {
  const c = current();
  const cases = state.cases.filter(item => item.environment === c.environment);
  return `<aside class="sidebar"><nav class="nav" aria-label="Workspace"><button data-view="inbox" class="${state.view === 'inbox' ? 'active' : ''}">${icon('inbox')}Care inbox <span class="count">${cases.filter(x => !['resolved','follow_up'].includes(x.status)).length}</span></button><button data-view="playbook" class="${state.view === 'playbook' ? 'active' : ''}">${icon('book')}Care playbook</button><button data-view="activity" class="${state.view === 'activity' ? 'active' : ''}">${icon('activity')}Activity</button></nav><div><div class="row between inbox-label"><p class="eyebrow">Your conversations</p><span class="small muted">${cases.length}</span></div><div class="case-list">${cases.map(item => `<button class="case ${item.id === state.activeId ? 'active' : ''}" data-case="${esc(item.id)}" ${item.id === state.activeId ? 'aria-current="true"' : ''}><span class="row"><span class="avatar">${esc(item.initials)}</span><span><span class="case-name">${esc(item.customer)}</span><span class="case-product" style="display:block">${esc(item.product)}</span></span></span><span class="case-status">${item.status === 'resolved' ? '✓ Care completed' : item.status === 'follow_up' ? '✓ Follow-up confirmed' : item.analysis ? '● Care in progress' : '● Ready for a little care'}</span></button>`).join('')}</div></div><div class="sidebar-note"><span class="sun" aria-hidden="true">✳</span><strong>A little care. A lasting connection.</strong>Thoughtful resolutions start with understanding.</div></aside>`;
}
function context(item) {
  const days = Math.floor((Date.now() - Date.parse(item.deliveredAt)) / 86400000);
  return `<aside class="context" aria-label="Purchase context"><div class="stack"><section class="panel"><div class="product-art">${art(item.art)}</div><div class="product-body"><p class="eyebrow">The purchase</p><h3>${esc(item.product)}</h3><div class="product-details"><span>${esc(item.color)}</span><span class="purchase-price">${cash(item.amountCents)}</span></div><div class="product-line"><span>${esc(item.orderLabel)}</span><span>${item.hasPayment ? '✓ Paid' : 'Buyer approval'}</span></div><div class="product-line"><span>Delivered ${days} days ago</span><span>${icon('box')}</span></div></div></section><section class="panel"><div class="context-note"><div class="row">${icon('shield')}<strong>Care with clarity</strong></div><p>Every option connects to your store policy. Every payment starts with your approval.</p>${item.analysis ? `<div class="source-chips" style="margin-top:12px">${item.analysis.policyIds.map(p => `<span class="source-chip">${esc(p)}</span>`).join('')}</div>` : ''}</div><button class="policy-link" data-action="policies">Explore care policies ${icon('chevron')}</button></section>${item.timeline.length ? `<section class="panel"><div class="context-note"><p class="eyebrow">The care journey</p><div class="timeline">${item.timeline.slice(-4).map(e => `<div><span>${esc(e.label)}<time>${time(e.at)}</time></span></div>`).join('')}</div></div></section>` : ''}</div></aside>`;
}
function messagePanel(item, compact = false) {
  return `<section class="panel"><div class="panel-head"><h2>A conversation worth caring for</h2><span class="label">Customer view</span></div><div class="panel-body"><div class="row between"><div class="row"><span class="avatar">${esc(item.initials)}</span><div><div class="customer-title">${esc(item.customer)}</div><div class="customer-meta">${esc(item.category)}</div></div></div>${compact ? '<button class="text-button" data-action="edit">Edit message</button>' : ''}</div><div class="message-wrap">${compact ? `<p class="message-text">${esc(item.message)}</p>` : `<label class="eyebrow" for="customer-message">Customer message</label><textarea id="customer-message" maxlength="2000" aria-label="Customer message">${esc(item.message)}</textarea>`}</div>${compact ? '' : `<div class="message-foot"><div class="row muted small">${icon('sparkle')}AI understands. Your policy guides.</div><button class="button" data-action="analyze" ${state.busy ? 'disabled' : ''}>${icon('sparkle')}Generate care options ${icon('arrow')}</button></div>`}</div></section>`;
}
function loading() { return `<section class="panel loading-panel" aria-live="polite" aria-busy="true"><div class="row" style="margin-bottom:18px">${icon('sparkle')}<span class="label">AI at work</span></div><h2>Finding the thoughtful next step.</h2><p>Understanding your customer’s goal and connecting it with your care policies.</p><div class="shimmer"></div><div class="shimmer short"></div><p class="busy-line"><span class="dot pulse"></span>Local AI is composing this response · ${esc(state.config.ai?.model)}</p></section>`; }
function optionCard(option) {
  return `<article class="option ${option.recommended ? 'recommended' : ''}"><div class="row between" style="width:100%"><span class="option-icon">${icon(option.action === 'refund' ? 'heart' : option.action === 'return' ? 'return' : 'chat')}</span></div>${option.recommended ? '<span class="label">A thoughtful match</span>' : '<span class="plain-label">Another way forward</span>'}<h3>${esc(option.title)}</h3>${option.amountCents ? `<div class="amount">${cash(option.amountCents)}<small>${option.action === 'refund' ? 'care refund · keep your item' : 'refund after return review'}</small></div>` : ''}<p style="margin-top:12px">${esc(option.description)}</p><button class="button ${option.recommended ? '' : 'secondary'}" data-select="${esc(option.id)}" ${state.busy ? 'disabled' : ''}>${option.action === 'refund' ? 'Choose my care refund' : option.action === 'return' ? 'Choose a return' : 'Choose personal care'} ${icon('arrow')}</button></article>`;
}
function optionsPanel(item) {
  const main = item.options.filter(o => o.action !== 'support'); const support = item.options.find(o => o.action === 'support');
  return `${messagePanel(item, true)}<div class="ai-insight" style="margin-top:18px"><div class="row between"><div class="row">${icon('sparkle')}<strong>Understood, with care.</strong></div><span class="inline-meta">${(item.analysis.durationMs / 1000).toFixed(1)}s · local AI</span></div><p>${esc(item.analysis.summary)}</p><div class="source-chips">${item.analysis.policyIds.map(id => `<span class="source-chip">${esc(id)} · matched policy</span>`).join('')}</div></div><div class="section-title"><h2>Your choice, your next chapter.</h2><span class="small muted">${item.options.length} care paths</span></div><div class="option-grid ${main.length < 2 ? 'option-single' : ''}">${main.length ? main.map(optionCard).join('') : optionCard(support)}</div>${main.length && support ? `<div class="specialist"><span class="row">${icon('chat')}Prefer a personal conversation?</span><button class="text-button" data-select="specialist">Connect with care</button></div>` : ''}<div class="reply"><strong>YOUR AI CARE REPLY</strong>${esc(item.analysis.reply)}</div>`;
}
function reviewPanel(item) {
  const option = item.options.find(o => o.id === item.selectedOptionId);
  const pending = item.status === 'reconciling';
  const terminal = ['FAILED', 'CANCELLED', 'DENIED'].includes(item.operation?.status);
  return `<section class="panel"><div class="review-top"><span class="label">Merchant view · Morrow Studio</span><h2>${terminal ? 'Review your care payment.' : pending ? 'Your care is on its way.' : 'A thoughtful choice. Ready for your yes.'}</h2><p>${esc(item.customer)} chose ${esc(option.shortTitle.toLowerCase())}.</p></div><div class="panel-body">${!pending ? '<button class="back-button" data-action="back">← Explore the care options</button>' : ''}<div class="reply" style="margin:0 0 20px"><strong>CUSTOMER REQUEST</strong>${esc(item.message)}</div>${option.action === 'refund' ? `<div class="review-amount"><div><p class="eyebrow">Care refund</p><p class="small muted">15% · original payment method</p></div><strong>${cash(option.amountCents)}</strong></div><div class="ledger"><div><span class="muted">Original purchase</span><span>${cash(item.amountCents)}</span></div><div><span class="muted">Customer receives</span><span>${cash(option.amountCents)}</span></div><div class="total"><span>Purchase retained</span><span>${cash(item.amountCents - option.amountCents)}</span></div></div>` : `<div class="hero-note">${icon(option.action === 'return' ? 'return' : 'chat')}<div><strong>${esc(option.title)}</strong><p>${esc(option.description)}</p></div></div>`}<div class="reply"><strong>POLICY BEHIND THIS CHOICE · ${esc(option.policyId)}</strong>${esc(state.policies.find(p => p.id === option.policyId)?.text)}</div>${pending ? `<div class="hero-note"><div><strong>Payment status · ${esc(item.operation?.status || 'PENDING')}</strong><p>${terminal ? 'Your care choice is saved. Review this payment with your merchant before taking the next step.' : `Your approved request is saved. Refresh to retrieve the latest ${esc(item.environmentLabel)} payment status.`}</p></div></div><button class="button full" data-action="refresh" ${state.busy ? 'disabled' : ''}>${icon('return')}Refresh status</button>` : `<label class="check-label"><input type="checkbox" id="merchant-confirm"><span>${option.action === 'refund' ? `I approve the ${cash(option.amountCents)} care refund for ${esc(item.orderLabel)} in ${esc(item.environmentLabel)}.` : `I confirm this care follow-up for ${esc(item.customer)}.`}</span></label><button id="confirm-button" class="button full" data-action="confirm" disabled>${icon('check')}${option.action === 'refund' ? `Confirm ${cash(option.amountCents)} care refund` : 'Confirm care follow-up'}</button>`}<p class="small muted" style="text-align:center;margin-top:12px">${esc(item.environmentLabel)} · ${option.action === 'refund' ? 'Amount set by your care policy' : 'Your team guides the next step'}</p></div></section>`;
}
function receiptPanel(item) {
  const r = item.receipt;
  return `<section class="panel receipt"><div class="receipt-celebrate"><div class="success-icon">✓</div><h2>A little care. A joyful resolution.</h2><p>${esc(item.customer.split(' ')[0])} keeps the ${esc(item.product.toLowerCase())}. You keep the connection.</p></div><div class="receipt-amount"><strong>${cash(r.refundCents)}</strong><p>Care refund completed · ${esc(r.environmentLabel)}</p></div><div class="receipt-body"><div class="ledger"><div><span class="muted">Original purchase</span><span>${cash(r.originalCents)}</span></div><div><span class="muted">Care returned to customer</span><span>${cash(r.refundCents)}</span></div><div class="total"><span>Purchase retained</span><span>${cash(r.retainedCents)}</span></div></div><div class="receipt-verification">${icon('shield')}<span>${esc(r.verification)} · ${esc(r.providerStatus)}</span></div><div class="receipt-footer"><div><p class="eyebrow">YOUR CARE RECEIPT</p><p class="small muted" style="margin-top:4px">${esc(item.orderLabel)} · ${time(r.verifiedAt)}</p></div><a class="button secondary" href="/api/cases/${encodeURIComponent(item.id)}/receipt" download>${icon('download')}Download receipt</a></div><p class="receipt-tagline">Make every resolution a reason to return.</p></div></section><div class="hero-note">${icon('heart')}<div><strong>Understood. Chosen. Confirmed. Celebrated.</strong><p>One thoughtful journey, from the first message to the final receipt.</p></div></div>`;
}
function checkoutPanel(item) {
  const approval = state.approvals[item.id];
  return `<section class="panel sandbox-checkout"><span class="label">PayPal Sandbox</span><h2 style="margin-top:16px">Start with a real Sandbox purchase.</h2><p>Approve the ${cash(item.amountCents)} sample purchase with your PayPal Sandbox personal account. Then bring the completed purchase into your care workspace.</p>${approval ? `<a class="button" href="${esc(approval)}" target="_blank" rel="noopener noreferrer">Approve in PayPal Sandbox ${icon('external')}</a>` : '<button class="button secondary" data-action="sandbox">Open buyer approval</button>'}<button class="button full" style="margin-top:16px" data-action="capture" ${state.busy ? 'disabled' : ''}>Complete approved checkout ${icon('arrow')}</button><p class="small">Fictional sample purchase · PayPal Sandbox funds</p></section>`;
}
function mainPanel(item) {
  if (state.busy === 'analyze') return loading();
  if (item.status === 'checkout') return checkoutPanel(item);
  if (item.receipt) return receiptPanel(item);
  if (item.status === 'follow_up') return `<section class="panel followup"><div class="success-icon">✓</div><span class="label">Care follow-up confirmed</span><h2 style="margin-top:16px">A clear next step, together.</h2><p>${esc(item.followUp)}</p><div class="return-badge">${icon('heart')}Thoughtful care keeps moving.</div></section>`;
  if (item.status === 'reconciling' || (item.status === 'selected' && state.review)) return reviewPanel(item);
  if (item.analysis && !state.editing) return optionsPanel(item);
  return `${messagePanel(item)}<div class="hero-note">${icon('heart')}<div><strong>Turn a purchase concern into a reason to return.</strong><p>Listen to the story. Offer a thoughtful choice. Bring the resolution home.</p></div></div>`;
}
function playbook() { return `<section class="panel info-panel"><span class="label">Morrow Studio</span><h2 style="margin-top:12px">Thoughtful care, clearly defined.</h2><div class="policy-list">${state.policies.map(p => `<article><p class="eyebrow">${esc(p.id)}</p><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('')}</div></section>`; }
function activity() {
  const cases = state.cases.filter(c => c.timeline.length);
  return `<section class="panel info-panel"><h2>Every thoughtful step, in one place.</h2>${cases.length ? cases.map(c => `<article class="activity-item"><div class="row between"><h3>${esc(c.customer)} · ${esc(c.orderLabel)}</h3><span class="label">${esc(c.environmentLabel)}</span></div>${c.timeline.map(e => `<p>${time(e.at)} · ${esc(e.label)}</p>`).join('')}<button class="text-button" data-case="${esc(c.id)}" style="margin-top:12px">Open care journey →</button></article>`).join('') : '<div class="empty"><p>Your care activity begins with the first customer conversation.</p><button class="button" data-view="inbox">Open care inbox</button></div>'}</section>`;
}
function render() {
  const item = current(); if (!item) return;
  try { sessionStorage.setItem('returnjoy-case', item.id); } catch { /* The current view works when browser storage is disabled. */ }
  $('#app').innerHTML = `<header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true">↗</span>ReturnJoy<span aria-hidden="true">✳</span></div><div class="top-right"><button class="env-btn" data-action="environment"><span class="dot"></span>${esc(item.environmentLabel)}<span aria-hidden="true">⌄</span></button><div class="merchant"><span class="avatar merchant-avatar">MS</span><div><strong>Morrow Studio</strong><p class="small muted">Care workspace</p></div></div></div></header><div class="layout">${sidebar()}<main id="workspace" class="workspace"><div class="page-heading"><div><p class="eyebrow">${state.view === 'inbox' ? 'A LITTLE CARE, WITH JOY' : state.view === 'playbook' ? 'YOUR CARE PLAYBOOK' : 'YOUR CARE ACTIVITY'}</p><h1>${state.view === 'inbox' ? 'Good care. Great returns.' : state.view === 'playbook' ? 'Confidence in every choice.' : 'Care creates a story.'}</h1><p>${state.view === 'inbox' ? 'Make every resolution a reason to return.' : state.view === 'playbook' ? 'The policies that turn understanding into thoughtful action.' : 'Follow each conversation from understanding to resolution.'}</p></div><span class="sample-chip">${icon('box')}Fictional sample data</span></div>${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ''}${state.view === 'inbox' ? `${progress(item)}<div class="work-grid"><div class="main-content">${mainPanel(item)}</div>${context(item)}</div>` : state.view === 'playbook' ? playbook() : activity()}<footer class="footer"><span>${esc(item.environmentLabel)} · ${state.config.ai?.ready ? 'Local AI connected' : 'Local AI setup available'}</span><span class="powered">Thoughtful care, powered by AI <span>Payment integration with <b>PayPal</b> Sandbox</span></span></footer></main></div>`;
}
function showPolicies() { const dialog = $('#policy-dialog'); dialog.innerHTML = `<div class="dialog-head"><h2 id="policy-title">Care with clarity.</h2><button class="close" data-close="policy-dialog" aria-label="Close care policies">×</button></div><p class="small muted">Morrow Studio · Sample store policies</p><div class="policy-list">${state.policies.map(p => `<article><p class="eyebrow">${esc(p.id)}</p><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></article>`).join('')}</div>`; dialog.showModal(); }
function showEnvironment() { const dialog = $('#environment-dialog'); dialog.innerHTML = `<div class="dialog-head"><h2 id="environment-title">Choose your care environment.</h2><button class="close" data-close="environment-dialog" aria-label="Close environments">×</button></div><div class="mode-card ${current().environment === 'local_practice' ? 'active' : ''}"><div class="row between"><h3>Local practice</h3><span class="label">Ready to explore</span></div><p>Real local AI, fictional purchases and a local payment record. Explore the complete care journey on your computer.</p><button class="button secondary" data-action="practice">Open local practice ${icon('arrow')}</button></div><div class="mode-card ${current().environment === 'paypal_sandbox' ? 'active' : ''}"><div class="row between"><h3>PayPal Sandbox</h3><span class="label">${state.config.paypalConfigured ? 'Connected' : 'Connect your app'}</span></div><p>Run checkout, capture, a care refund and status verification with PayPal Sandbox funds.</p>${state.config.paypalConfigured ? `<button class="button" data-action="sandbox">Start Sandbox purchase ${icon('arrow')}</button>` : '<p>Add your Sandbox REST app’s <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> to the server’s <code>.env</code>, then restart ReturnJoy. Keep credentials on the server.</p>'}</div><p class="small muted">Local AI · ${esc(state.config.ai?.model)} · ${state.config.ai?.ready ? 'connected' : 'start Ollama to connect'}</p>`; dialog.showModal(); }
async function mutate(action, body) {
  state.busy = action; state.error = ''; render();
  try { const item = await api(`/api/cases/${state.activeId}/${action}`, body); updateCase(item); state.editing = false; state.review = true; if (item.status === 'resolved') toast('Care completed. Your receipt is ready.'); }
  catch (error) { state.error = error.message; try { updateCase(await api(`/api/cases/${state.activeId}`)); } catch {} }
  finally { state.busy = ''; render(); }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.close) { $(`#${button.dataset.close}`).close(); return; }
  if (button.dataset.view) { state.view = button.dataset.view; state.error = ''; render(); return; }
  if (button.dataset.case) { if (state.busy) return; state.activeId = button.dataset.case; state.view = 'inbox'; state.editing = false; state.review = true; state.error = ''; render(); return; }
  if (button.dataset.select) { await mutate('select', { optionId: button.dataset.select }); return; }
  const action = button.dataset.action;
  if (action === 'environment') return showEnvironment();
  if (action === 'policies') return showPolicies();
  if (action === 'edit') { state.editing = true; state.review = false; render(); $('#customer-message')?.focus(); return; }
  if (action === 'back') { state.review = false; render(); return; }
  if (action === 'analyze') { const message = $('#customer-message').value; current().message = message; await mutate('analyze', { message }); return; }
  if (action === 'confirm') { await mutate('confirm', { confirmed: true }); return; }
  if (action === 'refresh' || action === 'capture') { await mutate(action, {}); return; }
  if (action === 'practice') { $('#environment-dialog').close(); state.activeId = 'joy-1001'; state.view = 'inbox'; state.error = ''; render(); return; }
  if (action === 'sandbox') {
    $('#environment-dialog').close(); state.error = ''; button.disabled = true;
    try { const data = await api('/api/sandbox/orders', {}); updateCase(data.case); state.approvals[data.case.id] = data.approvalUrl; state.activeId = data.case.id; state.view = 'inbox'; }
    catch (error) { state.error = error.message; }
    render();
  }
});
document.addEventListener('change', event => { if (event.target.id === 'merchant-confirm') $('#confirm-button').disabled = !event.target.checked || Boolean(state.busy); });
async function boot() {
  try {
    const query = new URL(location.href).searchParams;
    let requestedCase = query.get('checkout');
    if (!requestedCase) { try { requestedCase = sessionStorage.getItem('returnjoy-case'); } catch {} }
    // Preserve only our selected case; remove PayPal callback identifiers from the address bar.
    if (location.search) history.replaceState(null, '', location.pathname);
    const data = await api('/api/bootstrap'); Object.assign(state, data);
    if (requestedCase && state.cases.some(c => c.id === requestedCase)) state.activeId = requestedCase;
    render();
  } catch (error) { $('#app').innerHTML = `<main class="boot"><div class="brand">↗ ReturnJoy<span>✳</span></div><p>${esc(error.message)}</p><a class="button" href="/">Open workspace again</a></main>`; }
}
boot();
