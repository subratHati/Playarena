import crypto from 'node:crypto';
import { config } from '../../config.js';
import { request, safeEqual } from './http.js';

// Razorpay Standard Checkout.
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
const c = () => config.payments.razorpay;
const auth = () => ({ Authorization: `Basic ${Buffer.from(`${c().keyId}:${c().keySecret}`).toString('base64')}` });
const api = (path, opts = {}) => request(`${c().apiBase}${path}`, { ...opts, headers: { ...auth(), ...(opts.headers || {}) } });

const METHOD = { upi: 'upi', card: 'card', netbanking: 'netbanking', wallet: 'wallet', emi: 'emi', paylater: 'paylater' };

export const razorpay = {
  id: 'razorpay',
  label: 'Razorpay',
  hint: 'UPI, cards, net banking, wallets',
  enabled: () => Boolean(c().keyId && c().keySecret),

  // amountPaise must match the order exactly; receipt carries our attempt id so webhooks can find the payment.
  async create({ attemptId, amountPaise, user, tournament, phone }) {
    const order = await api('/v1/orders', {
      method: 'POST',
      body: { amount: amountPaise, currency: 'INR', receipt: attemptId, notes: { mivo_order: attemptId, tournament: String(tournament.title).slice(0, 200) } },
    });
    return {
      gatewayOrderId: order.id,
      client: {
        keyId: c().keyId,
        gatewayOrderId: order.id,
        amountPaise,
        currency: 'INR',
        name: 'MivoPlay',
        description: `Entry pass: ${tournament.title}`.slice(0, 250),
        prefill: { name: user.username, email: user.email, ...(phone ? { contact: `+91${phone}` } : {}) },
      },
    };
  },

  // Signature from the checkout handler: HMAC_SHA256(order_id + "|" + payment_id, key_secret).
  checkSignature({ gatewayOrderId, paymentId, signature }) {
    const expected = crypto.createHmac('sha256', c().keySecret).update(`${gatewayOrderId}|${paymentId}`).digest('hex');
    return safeEqual(expected, signature);
  },

  // Ask Razorpay what happened to this order. Authorized-but-not-captured payments are captured here.
  async status(gatewayOrderId) {
    const list = await api(`/v1/orders/${encodeURIComponent(gatewayOrderId)}/payments`);
    const items = list.items || [];
    let p = items.find((x) => x.status === 'captured');
    if (!p) {
      const authorized = items.find((x) => x.status === 'authorized');
      if (authorized) {
        p = await api(`/v1/payments/${encodeURIComponent(authorized.id)}/capture`, {
          method: 'POST',
          body: { amount: authorized.amount, currency: authorized.currency || 'INR' },
        }).catch(() => null);
        if (p?.status !== 'captured') return { state: 'pending' };
      }
    }
    if (p) return { state: 'paid', amountPaise: p.amount, method: METHOD[p.method] || p.method || 'razorpay', gatewayPaymentId: p.id };
    if (items.length && items.every((x) => x.status === 'failed')) return { state: 'failed' };
    return { state: 'pending' };
  },

  // Webhook: X-Razorpay-Signature = HMAC_SHA256(raw body, webhook secret) in hex.
  verifyWebhook(req) {
    if (!c().webhookSecret) return false;
    const expected = crypto.createHmac('sha256', c().webhookSecret).update(req.body).digest('hex');
    return safeEqual(expected, req.get('x-razorpay-signature'));
  },
  // Returns our attempt id for a webhook event (looks up the order's receipt).
  async attemptFromWebhook(event) {
    const orderEntity = event?.payload?.order?.entity;
    if (orderEntity?.receipt) return orderEntity.receipt;
    const gatewayOrderId = event?.payload?.payment?.entity?.order_id;
    if (!gatewayOrderId) return null;
    const order = await api(`/v1/orders/${encodeURIComponent(gatewayOrderId)}`);
    return order.receipt || null;
  },
};
