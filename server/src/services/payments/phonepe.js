import crypto from 'node:crypto';
import { config } from '../../config.js';
import { request, safeEqual } from './http.js';

// PhonePe Payment Gateway, Standard Checkout (v2 APIs with OAuth).
// Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/integration-steps
const c = () => config.payments.phonepe;
const prod = () => c().env === 'production';
const base = () => c().apiBase || (prod() ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox');
const authUrl = () =>
  c().authUrl || (prod() ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token' : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');

let token = null; // { value, expiresAt (ms) }
async function getToken() {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  const d = await request(authUrl(), {
    method: 'POST',
    form: { client_id: c().clientId, client_version: c().clientVersion, client_secret: c().clientSecret, grant_type: 'client_credentials' },
  });
  const exp = Number(d.expires_at);
  token = { value: d.access_token, expiresAt: exp ? (exp < 1e12 ? exp * 1000 : exp) : Date.now() + 10 * 60_000 };
  return token.value;
}
const api = async (path, opts = {}) => request(`${base()}${path}`, { ...opts, headers: { Authorization: `O-Bearer ${await getToken()}`, ...(opts.headers || {}) } });

const METHOD = { UPI_INTENT: 'upi', UPI_COLLECT: 'upi', UPI_QR: 'upi', CARD: 'card', NET_BANKING: 'netbanking' };

export const phonepe = {
  id: 'phonepe',
  label: 'PhonePe',
  hint: 'UPI, cards, net banking',
  enabled: () => Boolean(c().clientId && c().clientSecret),

  // Our attempt id is PhonePe's merchantOrderId (letters, digits, _ and - only; max 63). Amount in paise.
  async create({ attemptId, amountPaise, tournament, returnUrl }) {
    const d = await api('/checkout/v2/pay', {
      method: 'POST',
      body: {
        merchantOrderId: attemptId,
        amount: amountPaise,
        expireAfter: 1200,
        metaInfo: { udf1: String(tournament.title).slice(0, 250) },
        paymentFlow: { type: 'PG_CHECKOUT', message: `Entry pass: ${tournament.title}`.slice(0, 100), merchantUrls: { redirectUrl: returnUrl } },
      },
    });
    return { gatewayOrderId: attemptId, client: { redirectUrl: d.redirectUrl } };
  },

  async status(gatewayOrderId) {
    const d = await api(`/checkout/v2/order/${encodeURIComponent(gatewayOrderId)}/status?details=false`);
    if (d.state === 'COMPLETED') {
      const p = (d.paymentDetails || []).find((x) => x.state === 'COMPLETED') || d.paymentDetails?.[0] || {};
      return { state: 'paid', amountPaise: Number(d.amount), method: METHOD[p.paymentMode] || 'phonepe', gatewayPaymentId: p.transactionId || d.orderId || '' };
    }
    if (d.state === 'FAILED') return { state: 'failed' };
    return { state: 'pending' };
  },

  // Webhook: Authorization header = SHA256("username:password") in hex, as set in the PhonePe dashboard.
  verifyWebhook(req) {
    if (!c().webhookUsername || !c().webhookPassword) return false;
    const expected = crypto.createHash('sha256').update(`${c().webhookUsername}:${c().webhookPassword}`).digest('hex');
    const got = String(req.get('authorization') || '').replace(/^sha256\s+/i, '').trim().toLowerCase();
    return safeEqual(expected, got);
  },
  async attemptFromWebhook(event) {
    return event?.payload?.merchantOrderId || event?.merchantOrderId || null;
  },
};
