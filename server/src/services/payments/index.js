import { config, isProduction } from '../../config.js';
import Payment from '../../models/Payment.js';
import User from '../../models/User.js';
import Tournament from '../../models/Tournament.js';
import { razorpay } from './razorpay.js';
import { cashfree } from './cashfree.js';
import { phonepe } from './phonepe.js';

// Mock checkout for local testing (and until a real gateway is configured). No real money.
export const mock = { id: 'mock', label: 'Test payment', hint: 'No real money', enabled: () => mockEnabled() };

const GATEWAYS = [razorpay, cashfree, phonepe];
export const realGateways = () => GATEWAYS.filter((g) => g.enabled());
export function mockEnabled() {
  const s = config.payments.mockSetting;
  if (s === '1') return true;
  if (s === '0') return false;
  return realGateways().length === 0;
}
export const getGateway = (id) => [...GATEWAYS, mock].find((g) => g.id === id && g.enabled()) || null;
export const gatewayById = (id) => GATEWAYS.find((g) => g.id === id) || null;

// What checkout can offer right now.
export function availableGateways() {
  const list = realGateways().map((g) => ({ id: g.id, label: g.label, hint: g.hint, needsPhone: Boolean(g.needsPhone) }));
  if (mockEnabled()) list.push({ id: 'mock', label: mock.label, hint: mock.hint, needsPhone: false });
  return list;
}

// Our order id from a gateway attempt id ("mv_abc123-2" → "mv_abc123").
export const orderIdFromAttempt = (attemptId) => String(attemptId || '').split('-')[0];

export function returnUrl(orderId) {
  return `${config.appUrl}/payments/return?order=${encodeURIComponent(orderId)}`;
}
export function notifyUrl(gatewayId) {
  const base = config.payments.apiPublicUrl;
  return base.startsWith('https://') ? `${base}/api/payments/webhooks/${gatewayId}` : '';
}

// Open checkout on a gateway: creates an order there and records the attempt.
export async function startGatewayPayment(payment, gateway, { user, phone }) {
  const tournament = await Tournament.findById(payment.tournament).select('title');
  const attemptId = `${payment.orderId}-${payment.attempts.length + 1}`;
  const { gatewayOrderId, client } = await gateway.create({
    attemptId,
    amountPaise: Math.round(payment.amount * 100),
    user,
    tournament,
    phone,
    returnUrl: returnUrl(payment.orderId),
    notifyUrl: notifyUrl(gateway.id),
  });
  payment.attempts.push({ provider: gateway.id, gatewayOrderId, attemptId, at: new Date() });
  payment.provider = gateway.id;
  await payment.save();
  return { gateway: gateway.id, orderId: payment.orderId, ...client };
}

let completePaymentFn = null;
export const setCompletePayment = (fn) => (completePaymentFn = fn); // avoids a circular import with routes

// Ask the gateway(s) whether this payment has been paid; if so, issue the pass.
// Safe to call any number of times, from the browser, a webhook or the background check.
export async function syncPayment(payment) {
  if (payment.status !== 'created') return { state: payment.status === 'paid' ? 'paid' : payment.status, payment };
  let sawPending = false;
  for (const a of [...payment.attempts].reverse()) {
    const g = gatewayById(a.provider);
    if (!g || !g.enabled()) continue;
    let s;
    try {
      s = await g.status(a.gatewayOrderId);
    } catch (err) {
      console.error(`[payments] ${a.provider} status check failed for ${a.attemptId}:`, err.message);
      sawPending = true;
      continue;
    }
    if (s.state === 'pending') sawPending = true;
    if (s.state !== 'paid') continue;
    if (s.amountPaise !== Math.round(payment.amount * 100)) {
      console.error(`[payments] amount mismatch on ${a.attemptId}: got ${s.amountPaise}, expected ${payment.amount * 100}`);
      // Money was taken but it isn't the entry fee: no pass, and flag it for the admin to refund.
      payment.status = 'refund_pending';
      payment.provider = a.provider;
      payment.gatewayPaymentId = s.gatewayPaymentId || '';
      payment.note = `Amount mismatch from ${a.provider}: received ₹${(s.amountPaise / 100).toFixed(2)}. No pass issued.`;
      await payment.save();
      return { state: 'mismatch', payment };
    }
    payment.provider = a.provider;
    payment.gatewayPaymentId = s.gatewayPaymentId || '';
    const user = await User.findById(payment.user);
    const result = await completePaymentFn(payment, user, s.method);
    return { state: result.status < 300 ? 'paid' : 'closed', result, payment };
  }
  return { state: sawPending || payment.attempts.length === 0 ? 'pending' : 'failed', payment };
}

// Background safety net: payments whose player closed the tab before returning, without a webhook.
export function startPaymentReconciler({ everyMs = config.payments.reconcileMs } = {}) {
  const tick = async () => {
    if (!realGateways().length) return;
    try {
      const since = new Date(Date.now() - 3 * 3600_000);
      const list = await Payment.find({ status: 'created', updatedAt: { $gt: since } }).sort({ updatedAt: -1 }).limit(25);
      for (const p of list) if (p.attempts?.length) await syncPayment(p);
    } catch (err) {
      console.error('[payments] reconcile failed:', err.message);
    }
  };
  const timer = setInterval(tick, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export { isProduction };
