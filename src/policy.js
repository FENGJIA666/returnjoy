export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message); this.status = status; this.code = code;
  }
}

export const POLICY = Object.freeze([
  { id: 'CARE-15', title: 'Keep it, enjoy 15% back', text: 'For a cosmetic concern within 30 days of delivery, a customer who wishes to keep the item may choose a 15% goodwill refund. The merchant reviews and approves the amount.' },
  { id: 'RETURN-30', title: 'A clear 30-day return path', text: 'Within 30 days of delivery, customers can request a return. The merchant provides return instructions. A full refund follows the completed return review.' },
  { id: 'CARE-TEAM', title: 'Personal care for every question', text: 'Functional issues, product questions and requests outside these options receive a personal merchant follow-up.' }
]);

export function parseCents(value) {
  if (typeof value !== 'string' || !/^\d{1,8}\.\d{2}$/.test(value)) throw new AppError('Use a currency amount with exactly two decimal places.');
  const [units, fraction] = value.split('.');
  const cents = Number(units) * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new AppError('The amount must be greater than zero.');
  return cents;
}
export function money(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new AppError('A whole-cent amount is required.');
  return (cents / 100).toFixed(2);
}
export function careAmount(total) {
  if (!Number.isSafeInteger(total) || total <= 0) throw new AppError('A valid purchase amount is required.');
  return Math.floor((total * 15 + 50) / 100);
}
export function eligibleOptions(item, intent) {
  const options = [];
  const elapsed = Date.now() - Date.parse(item.deliveredAt);
  const inWindow = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 30 * 86400000;
  if (intent.productMatch && intent.productMatch !== 'current') return [{ id: 'specialist', title: 'Connect the right purchase', shortTitle: 'Confirm your purchase', amountCents: 0, policyId: 'CARE-TEAM', action: 'support', description: 'Your care team will connect this request with the right order and help you move forward.', recommended: true }];
  const care = careAmount(item.amountCents);
  if (inWindow && item.paymentStatus === 'COMPLETED' && intent.issue === 'cosmetic' && intent.preference === 'keep' && item.refundedCents === 0 && care > 0 && care <= item.amountCents - item.refundedCents) {
    options.push({ id: 'partial_care', title: 'Keep your favorite. Get 15% back.', shortTitle: 'Keep it + care refund', amountCents: care, policyId: 'CARE-15', action: 'refund', description: 'Keep your item and receive a thoughtful care refund to the original payment.', recommended: true });
  }
  if (inWindow && intent.issue !== 'other') options.push({ id: 'return_request', title: 'Start a guided return', shortTitle: 'Arrange a return', amountCents: item.amountCents - item.refundedCents, policyId: 'RETURN-30', action: 'return', description: 'Receive return instructions. Your merchant reviews the return before a full refund.', recommended: options.length === 0 });
  options.push({ id: 'specialist', title: 'Talk with your care team', shortTitle: 'Personal follow-up', amountCents: 0, policyId: 'CARE-TEAM', action: 'support', description: 'Share what matters to you and continue with a personal merchant follow-up.', recommended: options.length === 0 });
  return options;
}
export function assertRefund(item, option) {
  if (!option || option.id !== 'partial_care' || option.action !== 'refund') throw new AppError('Choose the care refund to continue with this payment action.', 409);
  if (item.paymentStatus !== 'COMPLETED' || !item.captureId) throw new AppError('Complete the original payment first.', 409);
  if (option.amountCents !== careAmount(item.amountCents) || option.amountCents > item.amountCents - item.refundedCents || item.refundedCents !== 0) throw new AppError('This purchase already has a care resolution. Open its receipt.', 409);
  if (!eligibleOptions(item, item.analysis).some(o => o.id === 'partial_care')) throw new AppError('Review the current policy options before confirming.', 409);
}

export function makeCases() {
  const deliveredAt = new Date(Date.now() - 6 * 86400000).toISOString();
  return [
    { id: 'joy-1001', customer: 'Alex Morgan', initials: 'AM', product: 'Everyday Carry Backpack', color: 'Sage green', amountCents: 8000, orderLabel: 'RJ-1048', message: 'I love the backpack! There is a small scuff on the front pocket. It works perfectly, and I would really like to keep it. Is there something you can do?', category: 'A little care goes a long way', art: 'backpack' },
    { id: 'joy-1002', customer: 'Jamie Lee', initials: 'JL', product: 'Studio Table Lamp', color: 'Warm white', amountCents: 6400, orderLabel: 'RJ-1049', message: 'My lamp arrived in blue, but I ordered warm white. I would like to return it and get the right color.', category: 'Find the right fit', art: 'lamp' },
    { id: 'joy-1003', customer: 'Riley Chen', initials: 'RC', product: 'Trail Water Bottle', color: 'Terracotta', amountCents: 3200, orderLabel: 'RJ-1050', message: 'I am enjoying my new bottle. What is the best way to clean the lid and keep it looking great?', category: 'Make the most of every purchase', art: 'bottle' }
  ].map(item => ({ ...item, environment: 'local_practice', merchantId: 'morrow-studio', deliveredAt, createdAt: new Date().toISOString(), paymentStatus: 'COMPLETED', captureId: `PRACTICE-${item.id}`, refundedCents: 0, status: 'new', timeline: [] }));
}
