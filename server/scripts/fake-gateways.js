// Local stand-ins for Razorpay, Cashfree and PhonePe (only the endpoints MivoPlay uses), for testing.
// Control endpoints under /__/... let the test "pay" an order.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 5099;
const RZP = { id: 'rzp_test_mivo', secret: 'rzp_secret_123' };
const CF = { id: 'cf_app_mivo', secret: 'cf_secret_123', version: '2023-08-01' };
const PP = { id: 'pp_client_mivo', secret: 'pp_secret_123', version: '1' };

const rzpOrders = new Map(); // id -> order
const rzpPayments = new Map(); // orderId -> [payments]
const cfOrders = new Map();
const ppOrders = new Map();
const tokens = new Set();
const log = [];

const rid = (p) => p + crypto.randomBytes(7).toString('hex');
const send = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    // Browser stubs of the checkout widgets call the test controls directly.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    let raw = '';
    for await (const c of req) raw += c;
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const json = () => {
      try {
        return JSON.parse(raw || '{}');
      } catch {
        return {};
      }
    };
    log.push(`${req.method} ${p}`);

    // ---------- Razorpay ----------
    if (p.startsWith('/rzp/')) {
      const auth = req.headers.authorization || '';
      if (auth !== `Basic ${Buffer.from(`${RZP.id}:${RZP.secret}`).toString('base64')}`) return send(res, 401, { error: { description: 'Authentication failed' } });
      let m;
      if (req.method === 'POST' && p === '/rzp/v1/orders') {
        const b = json();
        if (!Number.isInteger(b.amount) || b.amount < 100) return send(res, 400, { error: { description: 'amount invalid' } });
        if (b.receipt && b.receipt.length > 40) return send(res, 400, { error: { description: 'receipt too long' } });
        const o = { id: rid('order_'), entity: 'order', amount: b.amount, currency: b.currency, receipt: b.receipt, notes: b.notes, status: 'created' };
        rzpOrders.set(o.id, o);
        return send(res, 200, o);
      }
      if (req.method === 'GET' && (m = p.match(/^\/rzp\/v1\/orders\/([^/]+)\/payments$/))) return send(res, 200, { entity: 'collection', items: rzpPayments.get(m[1]) || [] });
      if (req.method === 'GET' && (m = p.match(/^\/rzp\/v1\/orders\/([^/]+)$/))) return rzpOrders.has(m[1]) ? send(res, 200, rzpOrders.get(m[1])) : send(res, 404, { error: { description: 'not found' } });
      if (req.method === 'POST' && (m = p.match(/^\/rzp\/v1\/payments\/([^/]+)\/capture$/))) {
        for (const list of rzpPayments.values()) {
          const pay = list.find((x) => x.id === m[1]);
          if (pay) {
            pay.status = 'captured';
            return send(res, 200, pay);
          }
        }
        return send(res, 404, { error: { description: 'no payment' } });
      }
      return send(res, 404, { error: { description: 'no route' } });
    }

    // ---------- Cashfree ----------
    if (p.startsWith('/cf/')) {
      if (req.headers['x-client-id'] !== CF.id || req.headers['x-client-secret'] !== CF.secret) return send(res, 401, { message: 'authentication Failed' });
      if (req.headers['x-api-version'] !== CF.version) return send(res, 400, { message: 'x-api-version missing or wrong' });
      let m;
      if (req.method === 'POST' && p === '/cf/pg/orders') {
        const b = json();
        if (!/^[A-Za-z0-9_-]{3,45}$/.test(b.order_id || '')) return send(res, 400, { message: 'order_id invalid' });
        if (cfOrders.has(b.order_id)) return send(res, 409, { message: 'order_id already exists' });
        if (!/^\d{10}$/.test(b.customer_details?.customer_phone || '')) return send(res, 400, { message: 'customer_phone invalid' });
        if (!b.order_meta?.return_url) return send(res, 400, { message: 'return_url missing' });
        const o = { cf_order_id: rid(''), order_id: b.order_id, order_amount: b.order_amount, order_currency: b.order_currency, order_status: 'ACTIVE', payment_session_id: rid('session_'), payments: [] };
        cfOrders.set(o.order_id, o);
        return send(res, 200, o);
      }
      if (req.method === 'GET' && (m = p.match(/^\/cf\/pg\/orders\/([^/]+)\/payments$/))) return send(res, 200, cfOrders.get(m[1])?.payments || []);
      if (req.method === 'GET' && (m = p.match(/^\/cf\/pg\/orders\/([^/]+)$/))) {
        const o = cfOrders.get(m[1]);
        if (!o) return send(res, 404, { message: 'order not found' });
        const { payments, ...rest } = o;
        return send(res, 200, rest);
      }
      return send(res, 404, { message: 'no route' });
    }

    // ---------- PhonePe ----------
    if (p.startsWith('/pp/')) {
      if (req.method === 'POST' && p === '/pp/oauth') {
        const f = new URLSearchParams(raw);
        if (f.get('client_id') !== PP.id || f.get('client_secret') !== PP.secret || f.get('client_version') !== PP.version || f.get('grant_type') !== 'client_credentials')
          return send(res, 401, { message: 'bad client' });
        const t = rid('tok_');
        tokens.add(t);
        return send(res, 200, { access_token: t, token_type: 'O-Bearer', issued_at: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      const tok = (req.headers.authorization || '').replace(/^O-Bearer /, '');
      if (!tokens.has(tok)) return send(res, 401, { message: 'Unauthorized' });
      let m;
      if (req.method === 'POST' && p === '/pp/checkout/v2/pay') {
        const b = json();
        if (!/^[A-Za-z0-9_-]{1,63}$/.test(b.merchantOrderId || '')) return send(res, 400, { message: 'merchantOrderId invalid' });
        if (ppOrders.has(b.merchantOrderId)) return send(res, 400, { message: 'duplicate merchantOrderId' });
        if (b.paymentFlow?.type !== 'PG_CHECKOUT' || !b.paymentFlow?.merchantUrls?.redirectUrl) return send(res, 400, { message: 'paymentFlow invalid' });
        if (!Number.isInteger(b.amount) || b.amount < 100) return send(res, 400, { message: 'amount invalid' });
        const o = { orderId: rid('OMO'), merchantOrderId: b.merchantOrderId, amount: b.amount, state: 'PENDING', redirect: b.paymentFlow.merchantUrls.redirectUrl, paymentDetails: [] };
        ppOrders.set(o.merchantOrderId, o);
        return send(res, 200, { orderId: o.orderId, state: 'PENDING', expireAt: Date.now() + 1200_000, redirectUrl: `http://localhost:${PORT}/pp-page?o=${o.merchantOrderId}` });
      }
      if (req.method === 'GET' && (m = p.match(/^\/pp\/checkout\/v2\/order\/([^/]+)\/status$/))) {
        const o = ppOrders.get(m[1]);
        if (!o) return send(res, 404, { message: 'not found' });
        return send(res, 200, { orderId: o.orderId, state: o.state, amount: o.amount, paymentDetails: o.paymentDetails });
      }
      return send(res, 404, { message: 'no route' });
    }

    // PhonePe hosted page stand-in: pays, then sends the player back to the merchant.
    if (p === '/pp-page') {
      const o = ppOrders.get(url.searchParams.get('o'));
      if (!o) return send(res, 404, { message: 'no order' });
      o.state = 'COMPLETED';
      o.paymentDetails = [{ transactionId: rid('T'), paymentMode: 'UPI_INTENT', state: 'COMPLETED', amount: o.amount }];
      res.writeHead(302, { Location: o.redirect });
      return res.end();
    }

    // ---------- Test controls ----------
    if (req.method === 'POST' && p === '/__/pay') {
      const b = json(); // { gateway, order (gateway order id), status, amountPaise?, method? }
      if (b.gateway === 'razorpay') {
        const o = rzpOrders.get(b.order);
        if (!o) return send(res, 404, { message: 'no order' });
        const pay = { id: rid('pay_'), entity: 'payment', order_id: o.id, amount: b.amountPaise ?? o.amount, currency: 'INR', status: b.status || 'captured', method: b.method || 'upi' };
        rzpPayments.set(o.id, [...(rzpPayments.get(o.id) || []), pay]);
        if (pay.status === 'captured') o.status = 'paid';
        const signature = crypto.createHmac('sha256', RZP.secret).update(`${o.id}|${pay.id}`).digest('hex');
        return send(res, 200, { razorpay_order_id: o.id, razorpay_payment_id: pay.id, razorpay_signature: signature, payment: pay, order: o });
      }
      if (b.gateway === 'cashfree') {
        const o = b.session ? [...cfOrders.values()].find((x) => x.payment_session_id === b.session) : cfOrders.get(b.order);
        if (!o) return send(res, 404, { message: 'no order' });
        if ((b.status || 'PAID') === 'PAID') {
          if (b.amountPaise) o.order_amount = b.amountPaise / 100;
          o.order_status = 'PAID';
          o.payments.push({ cf_payment_id: Date.now(), payment_status: 'SUCCESS', payment_group: b.method || 'upi' });
        } else o.order_status = b.status;
        return send(res, 200, { order_id: o.order_id, order_status: o.order_status, order_amount: o.order_amount });
      }
      if (b.gateway === 'phonepe') {
        const o = ppOrders.get(b.order);
        if (!o) return send(res, 404, { message: 'no order' });
        o.state = b.status || 'COMPLETED';
        o.paymentDetails = [{ transactionId: rid('T'), paymentMode: 'UPI_QR', state: o.state, amount: o.amount }];
        return send(res, 200, { merchantOrderId: o.merchantOrderId, orderId: o.orderId, state: o.state, amount: o.amount });
      }
      return send(res, 400, { message: 'unknown gateway' });
    }
    if (p === '/__/log') return send(res, 200, { log });
    send(res, 404, { message: 'no route' });
  })
  .listen(PORT, () => console.log(`fake gateways on ${PORT}`));
