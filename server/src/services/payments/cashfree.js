import crypto from 'node:crypto';
import { config } from '../../config.js';
import { request, safeEqual } from './http.js';

// Cashfree Payment Gateway (Orders API + JS SDK v3 checkout).
// Docs: https://www.cashfree.com/docs/payments/online/web/redirect
const c = () => config.payments.cashfree;
const base = () => c().apiBase || (c().env === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com');
const api = (path, opts = {}) =>
  request(`${base()}${path}`, {
    ...opts,
    headers: { 'x-client-id': c().appId, 'x-client-secret': c().secretKey, 'x-api-version': c().apiVersion, ...(opts.headers || {}) },
  });

const METHOD = { upi: 'upi', credit_card: 'card', debit_card: 'card', card: 'card', net_banking: 'netbanking', wallet: 'wallet', app: 'wallet' };

export const cashfree = {
  id: 'cashfree',
  label: 'Cashfree',
  hint: 'UPI, cards, net banking, wallets',
  needsPhone: true, // Cashfree requires the customer's mobile number
  enabled: () => Boolean(c().appId && c().secretKey),

  // Our attempt id is Cashfree's order_id (letters, digits, _ and - only; max 45).
  async create({ attemptId, amountPaise, user, phone, returnUrl, notifyUrl }) {
    const order = await api('/pg/orders', {
      method: 'POST',
      headers: { 'x-idempotency-key': crypto.randomUUID() },
      body: {
        order_id: attemptId,
        order_amount: amountPaise / 100,
        order_currency: 'INR',
        customer_details: { customer_id: String(user._id), customer_name: user.username, customer_email: user.email, customer_phone: phone },
        order_meta: { return_url: returnUrl, ...(notifyUrl ? { notify_url: notifyUrl } : {}) },
      },
    });
    return { gatewayOrderId: attemptId, client: { paymentSessionId: order.payment_session_id, mode: c().env } };
  },

  async status(gatewayOrderId) {
    const order = await api(`/pg/orders/${encodeURIComponent(gatewayOrderId)}`);
    if (order.order_status === 'PAID') {
      let method = 'cashfree';
      let gatewayPaymentId = '';
      try {
        const pays = await api(`/pg/orders/${encodeURIComponent(gatewayOrderId)}/payments`);
        const ok = (Array.isArray(pays) ? pays : []).find((x) => x.payment_status === 'SUCCESS');
        if (ok) {
          method = METHOD[ok.payment_group] || ok.payment_group || method;
          gatewayPaymentId = String(ok.cf_payment_id || '');
        }
      } catch {
        /* method is only informational */
      }
      return { state: 'paid', amountPaise: Math.round(Number(order.order_amount) * 100), method, gatewayPaymentId };
    }
    if (['EXPIRED', 'TERMINATED'].includes(order.order_status)) return { state: 'failed' };
    return { state: 'pending' };
  },

  // Webhook: x-webhook-signature = base64(HMAC_SHA256(x-webhook-timestamp + raw body, secret key)).
  verifyWebhook(req) {
    const ts = req.get('x-webhook-timestamp');
    const sig = req.get('x-webhook-signature');
    if (!ts || !sig) return false;
    const expected = crypto.createHmac('sha256', c().secretKey).update(ts + req.body.toString('utf8')).digest('base64');
    return safeEqual(expected, sig);
  },
  async attemptFromWebhook(event) {
    return event?.data?.order?.order_id || null;
  },
};
