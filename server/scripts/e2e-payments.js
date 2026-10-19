// Payment gateway tests against local stand-in gateways (scripts/fake-gateways.js).
// 1) node scripts/fake-gateways.js
// 2) start the API with the env from scripts/fake-gateways.env (fake keys + base URLs) and MOCK_PAYMENTS=1
// 3) API=http://localhost:5000 node scripts/e2e-payments.js
import crypto from 'node:crypto';

const API = process.env.API || 'http://localhost:5000';
const FAKE = process.env.FAKE || 'http://localhost:5099';
const tag = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

async function api(path, { method = 'GET', body, token, headers = {}, raw } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const fake = async (body) => (await fetch(`${FAKE}/__/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
let n = 0;
const signup = async () => {
  const name = `pg${++n}_${tag}`;
  const r = await api('/api/auth/register', { method: 'POST', body: { username: name, email: `${name}@t.dev`, password: 'secret123' } });
  return r.data;
};

const admin = (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const mkTournament = async (maxPlayers = 32) =>
  (
    await api('/api/tournaments', {
      method: 'POST',
      token: admin.token,
      body: { title: `Pay Cup ${tag} ${++n}`, gameId: 'tic-tac-toe', entryFee: 49, maxPlayers, startsAt: new Date(Date.now() + 3600_000).toISOString(), image: PNG },
    })
  ).data.tournament;

const t = await mkTournament();
const registered = async (u, tid = t.id) => (await api(`/api/tournaments/${tid}`, { token: u.token })).data.registration;

console.log('\n— Checkout options —');
const g = await api('/api/payments/gateways');
const ids = g.data.gateways.map((x) => x.id);
check(['razorpay', 'cashfree', 'phonepe', 'mock'].every((x) => ids.includes(x)), `all configured gateways offered (${ids.join(', ')})`);
check(g.data.gateways.find((x) => x.id === 'cashfree').needsPhone === true, 'Cashfree asks for a mobile number');

console.log('\n— Each gateway, paid in the browser —');
for (const gw of ['razorpay', 'cashfree', 'phonepe']) {
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  check(co.status === 201 && co.data.gateways?.some((x) => x.id === gw), `${gw}: checkout lists it`);
  const st = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: gw, phone: '98765 43210' } });
  const okClient =
    (gw === 'razorpay' && st.data.keyId && st.data.gatewayOrderId?.startsWith('order_') && st.data.amountPaise === 4900) ||
    (gw === 'cashfree' && st.data.paymentSessionId && st.data.mode === 'sandbox') ||
    (gw === 'phonepe' && st.data.redirectUrl?.includes('/pp-page'));
  check(st.status === 200 && okClient, `${gw}: gateway order created`);
  const before = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: {} });
  check(before.status === 202 && before.data.pending, `${gw}: not paid yet → still pending, no pass`);
  const paid = await fake({ gateway: gw, order: gw === 'razorpay' ? st.data.gatewayOrderId : `${co.data.orderId}-1` });
  const body = gw === 'razorpay' ? { razorpay_order_id: paid.razorpay_order_id, razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: paid.razorpay_signature } : {};
  const conf = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body });
  check(conf.status === 201 && /^MV-TTT-/.test(conf.data.registration?.entryId), `${gw}: paid → pass issued (${conf.data.registration?.entryId})`);
  const again = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body });
  check(again.status === 200 && again.data.registration?.entryId === conf.data.registration?.entryId, `${gw}: confirming again returns the same pass`);
  const mine = (await api('/api/payments/me', { token: u.token })).data.payments.find((x) => x.orderId === co.data.orderId);
  check(mine?.status === 'paid' && mine.gateway === gw && mine.method === 'upi', `${gw}: payment saved as paid via ${mine?.gateway} (${mine?.method})`);
}

console.log('\n— Bad inputs —');
{
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  const noPhone = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'cashfree' } });
  check(noPhone.status === 400, 'Cashfree without a mobile number is refused');
  const bogus = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'paytm' } });
  check(bogus.status === 400, 'unknown gateway is refused');
  const other = await signup();
  check((await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: other.token, body: { gateway: 'razorpay' } })).status === 404, "can't start someone else's order");
  const st = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'razorpay' } });
  const paid = await fake({ gateway: 'razorpay', order: st.data.gatewayOrderId });
  const forged = await api(`/api/payments/${co.data.orderId}/confirm`, {
    method: 'POST',
    token: u.token,
    body: { razorpay_order_id: paid.razorpay_order_id, razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: 'f'.repeat(64) },
  });
  check(forged.status === 400 && !(await registered(u)), 'forged Razorpay signature is rejected');
  const realSigWrongOrder = await api(`/api/payments/${co.data.orderId}/confirm`, {
    method: 'POST',
    token: u.token,
    body: { razorpay_order_id: 'order_someoneelse', razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: paid.razorpay_signature },
  });
  check(realSigWrongOrder.status === 400, 'a Razorpay order that is not ours is rejected');
}

console.log('\n— Failed, underpaid and switched payments —');
{
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'phonepe' } });
  await fake({ gateway: 'phonepe', order: `${co.data.orderId}-1`, status: 'FAILED' });
  const failed = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: {} });
  check(failed.status === 402 && failed.data.retry, 'failed PhonePe payment → "did not go through", can retry');
  // Same order, different gateway (attempt 2) succeeds.
  await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'cashfree', phone: '9123456789' } });
  await fake({ gateway: 'cashfree', order: `${co.data.orderId}-2` });
  const ok = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: {} });
  check(ok.status === 201 && ok.data.registration, 'switching to another gateway on the same order works');

  const u2 = await signup();
  const co2 = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u2.token });
  const st2 = await api(`/api/payments/${co2.data.orderId}/start`, { method: 'POST', token: u2.token, body: { gateway: 'razorpay' } });
  await fake({ gateway: 'razorpay', order: st2.data.gatewayOrderId, amountPaise: 100 });
  const under = await api(`/api/payments/${co2.data.orderId}/confirm`, { method: 'POST', token: u2.token, body: {} });
  check(under.status === 409 && !(await registered(u2)), 'underpaid order (₹1 instead of ₹49) gets no pass');

  const u3 = await signup();
  const co3 = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u3.token });
  const st3 = await api(`/api/payments/${co3.data.orderId}/start`, { method: 'POST', token: u3.token, body: { gateway: 'razorpay' } });
  await fake({ gateway: 'razorpay', order: st3.data.gatewayOrderId, status: 'authorized' });
  const cap = await api(`/api/payments/${co3.data.orderId}/confirm`, { method: 'POST', token: u3.token, body: {} });
  check(cap.status === 201, 'authorized-only Razorpay payment is captured and accepted');
}

console.log('\n— Webhooks (player closed the tab) —');
const hmacHex = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
{
  // Razorpay
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  const st = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'razorpay' } });
  await fake({ gateway: 'razorpay', order: st.data.gatewayOrderId });
  const ev = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: st.data.gatewayOrderId, status: 'captured' } } } });
  const bad = await api('/api/payments/webhooks/razorpay', { method: 'POST', raw: ev, headers: { 'X-Razorpay-Signature': 'nope' } });
  check(bad.status === 401 && !(await registered(u)), 'Razorpay webhook with a bad signature is rejected');
  const good = await api('/api/payments/webhooks/razorpay', { method: 'POST', raw: ev, headers: { 'X-Razorpay-Signature': hmacHex(process.env.RZP_WEBHOOK_SECRET || 'rzp_wh_secret', ev) } });
  check(good.status === 200 && (await registered(u))?.entryId, 'Razorpay webhook issues the pass');
  await sleep(300);
  const emails = (await api('/api/dev/emails')).data.emails || [];
  check(emails.some((e) => e.to === `${u.user.email}` && e.subject.includes('Your pass')), 'pass email is sent after a webhook payment');
}
{
  // Cashfree
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'cashfree', phone: '9876543210' } });
  await fake({ gateway: 'cashfree', order: `${co.data.orderId}-1` });
  const ev = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: `${co.data.orderId}-1` }, payment: { payment_status: 'SUCCESS' } } });
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', 'cf_secret_123').update(ts + ev).digest('base64');
  const bad = await api('/api/payments/webhooks/cashfree', { method: 'POST', raw: ev, headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': 'AAAA' } });
  check(bad.status === 401, 'Cashfree webhook with a bad signature is rejected');
  const good = await api('/api/payments/webhooks/cashfree', { method: 'POST', raw: ev, headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': sig } });
  check(good.status === 200 && (await registered(u))?.entryId, 'Cashfree webhook issues the pass');
}
{
  // PhonePe
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'phonepe' } });
  await fake({ gateway: 'phonepe', order: `${co.data.orderId}-1` });
  const ev = JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: `${co.data.orderId}-1`, state: 'COMPLETED' } });
  const auth = crypto.createHash('sha256').update('pp_hook_user:pp_hook_pass').digest('hex');
  const bad = await api('/api/payments/webhooks/phonepe', { method: 'POST', raw: ev, headers: { Authorization: 'deadbeef' } });
  check(bad.status === 401, 'PhonePe webhook with a bad Authorization is rejected');
  const good = await api('/api/payments/webhooks/phonepe', { method: 'POST', raw: ev, headers: { Authorization: auth } });
  check(good.status === 200 && (await registered(u))?.entryId, 'PhonePe webhook issues the pass');
  // A forged "completed" webhook for an unpaid order changes nothing (we re-check with PhonePe).
  const u2 = await signup();
  const co2 = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u2.token });
  await api(`/api/payments/${co2.data.orderId}/start`, { method: 'POST', token: u2.token, body: { gateway: 'phonepe' } });
  const lie = JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: `${co2.data.orderId}-1`, state: 'COMPLETED' } });
  await api('/api/payments/webhooks/phonepe', { method: 'POST', raw: lie, headers: { Authorization: auth } });
  check(!(await registered(u2)), 'a "completed" webhook for an unpaid order issues nothing');
}

console.log('\n— Browser and webhook at the same moment —');
{
  const before = (await api(`/api/tournaments/${t.id}`)).data.tournament.registeredCount;
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  const st = await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'razorpay' } });
  const paid = await fake({ gateway: 'razorpay', order: st.data.gatewayOrderId });
  const ev = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: st.data.gatewayOrderId } } } });
  const sig = hmacHex(process.env.RZP_WEBHOOK_SECRET || 'rzp_wh_secret', ev);
  const body = { razorpay_order_id: paid.razorpay_order_id, razorpay_payment_id: paid.razorpay_payment_id, razorpay_signature: paid.razorpay_signature };
  await Promise.all([
    api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body }),
    api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body }),
    api('/api/payments/webhooks/razorpay', { method: 'POST', raw: ev, headers: { 'X-Razorpay-Signature': sig } }),
    api('/api/payments/webhooks/razorpay', { method: 'POST', raw: ev, headers: { 'X-Razorpay-Signature': sig } }),
  ]);
  await sleep(300);
  const after = (await api(`/api/tournaments/${t.id}`)).data.tournament.registeredCount;
  check(after === before + 1 && (await registered(u))?.entryId, `one seat and one pass only (count ${before} → ${after})`);
}

console.log('\n— Background check (no return, no webhook) —');
{
  const u = await signup();
  const co = await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token });
  await api(`/api/payments/${co.data.orderId}/start`, { method: 'POST', token: u.token, body: { gateway: 'phonepe' } });
  await fake({ gateway: 'phonepe', order: `${co.data.orderId}-1` });
  let reg = null;
  for (let i = 0; i < 12 && !reg; i++) {
    await sleep(1000);
    reg = await registered(u);
  }
  check(Boolean(reg?.entryId), 'unfinished payment is picked up by the background check');
}

console.log('\n— Full or closed tournaments —');
{
  const small = await mkTournament(2);
  const a = await signup();
  const b = await signup();
  const c = await signup();
  const coC = await api(`/api/tournaments/${small.id}/checkout`, { method: 'POST', token: c.token });
  for (const u of [a, b]) {
    const co = await api(`/api/tournaments/${small.id}/checkout`, { method: 'POST', token: u.token });
    await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: { method: 'upi' } }); // mock
  }
  const late = await api(`/api/payments/${coC.data.orderId}/start`, { method: 'POST', token: c.token, body: { gateway: 'razorpay' } });
  check(late.status === 409, 'no gateway checkout opens once the tournament is full');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll payment checks passed');
process.exit(failures ? 1 : 0);
