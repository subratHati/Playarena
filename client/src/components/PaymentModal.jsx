import { useEffect, useRef, useState } from 'react';
import { api, inr } from '../lib/api';
import { confirmPayment, openCashfree, openRazorpay, savePending } from '../lib/payments';

const MOCK_METHODS = [
  ['upi', 'UPI'],
  ['card', 'Debit or credit card'],
  ['netbanking', 'Net banking'],
];
const PHONE_KEY = 'mv_phone';
const rememberedPhone = () => {
  try {
    return localStorage.getItem(PHONE_KEY) || '';
  } catch {
    return '';
  }
};

// Checkout: the player picks one of the gateways the server offers (Razorpay, Cashfree, PhonePe),
// or the test checkout while no real gateway is set up.
export default function PaymentModal({ order: firstOrder, createOrder, tournament, onPaid, onClose }) {
  const [order, setOrder] = useState(firstOrder);
  const gateways = order.gateways?.length ? order.gateways : [{ id: 'mock', label: 'Test payment', hint: 'No real money' }];
  const [gateway, setGateway] = useState(gateways[0].id);
  const [mockMethod, setMockMethod] = useState('upi');
  const [phone, setPhone] = useState(rememberedPhone);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const chosen = gateways.find((g) => g.id === gateway) || gateways[0];

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // A mock order that failed is closed, so a retry starts a fresh one.
  const freshOrder = async () => {
    if (!order.closed) return order;
    const next = await createOrder();
    setOrder(next);
    return next;
  };

  const finish = async (orderId, body) => {
    setStatus('Confirming your payment…');
    const d = await confirmPayment(orderId, body, { onWaiting: () => setStatus('Waiting for the payment provider to confirm…') });
    onPaid(d.registration);
  };

  const pay = async (simulate) => {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const current = await freshOrder();
      if (chosen.id === 'mock') {
        const d = await api(`/payments/${current.orderId}/confirm`, { method: 'POST', body: { method: mockMethod, simulate } });
        return onPaid(d.registration);
      }

      const digits = phone.replace(/\D/g, '').slice(-10);
      if (chosen.needsPhone && !/^[6-9]\d{9}$/.test(digits)) throw Object.assign(new Error('Enter your 10-digit mobile number'), { field: 'phone' });
      if (digits) {
        try {
          localStorage.setItem(PHONE_KEY, digits);
        } catch {
          /* storage blocked */
        }
      }

      setStatus(`Opening ${chosen.label}…`);
      const start = await api(`/payments/${current.orderId}/start`, { method: 'POST', body: { gateway: chosen.id, phone: digits } });

      if (start.gateway === 'phonepe') {
        // PhonePe opens its own page and sends the player back to /payments/return.
        savePending({ orderId: current.orderId, tournamentId: tournament.id, gateway: 'phonepe' });
        setStatus('Taking you to PhonePe…');
        window.location.assign(start.redirectUrl);
        return;
      }

      if (start.gateway === 'razorpay') {
        const r = await openRazorpay(start);
        if (r.dismissed) {
          // Closed the window. A UPI payment may still complete, so check once quietly.
          const d = await api(`/payments/${current.orderId}/confirm`, { method: 'POST', body: {} });
          if (d.registration) return onPaid(d.registration);
          setStatus('');
          return;
        }
        return await finish(current.orderId, r);
      }

      if (start.gateway === 'cashfree') {
        savePending({ orderId: current.orderId, tournamentId: tournament.id, gateway: 'cashfree' });
        const r = await openCashfree(start);
        if (r?.redirect) return; // Cashfree is taking the player to its page; they come back to /payments/return
        if (r?.error && !r?.paymentDetails) {
          const d = await api(`/payments/${current.orderId}/confirm`, { method: 'POST', body: {} });
          if (d.registration) return onPaid(d.registration);
          setStatus('');
          return;
        }
        return await finish(current.orderId, {});
      }
    } catch (e) {
      setStatus('');
      setError(e.message);
      if (e.status === 402 && chosen.id === 'mock') setOrder((o) => ({ ...o, closed: true }));
      if (e.status === 409) setTimeout(onClose, 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl bg-card p-0 text-ink backdrop:bg-ink/50"
    >
      <div className="border-b border-line p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold">Entry pass</h2>
            <p className="text-sm text-muted">{tournament.title}</p>
          </div>
          <button type="button" aria-label="Close" className="rounded-md px-2 text-2xl leading-none text-muted hover:text-ink" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">Amount</span>
          <span className="font-display text-3xl font-extrabold">{inr(order.amount)}</span>
        </div>

        {gateways.length > 1 && (
          <fieldset>
            <legend className="label">Pay with</legend>
            <div className="space-y-2">
              {gateways.map((g) => (
                <label
                  key={g.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 ${gateway === g.id ? 'border-court bg-court/5' : 'border-line'}`}
                >
                  <input type="radio" name="gateway" value={g.id} checked={gateway === g.id} onChange={() => setGateway(g.id)} className="accent-court" disabled={busy} />
                  <span>
                    <b>{g.label}</b>
                    <span className="block text-xs text-muted">{g.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {chosen.id === 'mock' && (
          <>
            <fieldset>
              <legend className="label">Method (test)</legend>
              <div className="space-y-2">
                {MOCK_METHODS.map(([v, l]) => (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 ${mockMethod === v ? 'border-court bg-court/5' : 'border-line'}`}
                  >
                    <input type="radio" name="method" value={v} checked={mockMethod === v} onChange={() => setMockMethod(v)} className="accent-court" />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="rounded-[10px] bg-gold/25 px-3 py-2 text-sm">
              Test checkout: no real money moves. Order <span className="break-all">{order.orderId}</span>.
            </p>
          </>
        )}

        {chosen.needsPhone && (
          <div>
            <label htmlFor="pay-phone" className="label">
              Mobile number <span className="font-normal text-muted">(required by {chosen.label})</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="rounded-[10px] border border-line px-3 py-2.5 text-muted">+91</span>
              <input
                id="pay-phone"
                className="field"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
              />
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          This fee is for entry to the event. Rewards are badges and titles with no cash value. Fees are refunded only if a tournament is called off.
        </p>

        {status && (
          <p className="text-sm font-bold text-court" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="text-sm font-bold text-lose" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => pay('success')}>
            {busy ? 'Please wait…' : order.closed ? `Try again: pay ${inr(order.amount)}` : `Pay ${inr(order.amount)}${chosen.id === 'mock' ? '' : ` with ${chosen.label}`}`}
          </button>
          {chosen.id === 'mock' && (
            <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => pay('failure')}>
              Simulate a failed payment
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
