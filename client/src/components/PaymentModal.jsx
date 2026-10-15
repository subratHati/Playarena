import { useEffect, useRef, useState } from 'react';
import { api, inr } from '../lib/api';

const METHODS = [
  ['upi', 'UPI'],
  ['card', 'Debit or credit card'],
  ['netbanking', 'Net banking'],
];

// Mock checkout. Swap this for your gateway's checkout widget when going live.
export default function PaymentModal({ order: firstOrder, createOrder, tournament, onPaid, onClose }) {
  const [order, setOrder] = useState(firstOrder);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const pay = async (simulate) => {
    setBusy(true);
    setError('');
    try {
      // A failed order is closed, so a retry starts a fresh one.
      let current = order;
      if (current.closed) {
        current = await createOrder();
        setOrder(current);
      }
      const d = await api(`/payments/${current.orderId}/confirm`, { method: 'POST', body: { method, simulate } });
      onPaid(d.registration);
    } catch (e) {
      setError(e.message);
      if (e.status === 402) setOrder((o) => ({ ...o, closed: true }));
      if (e.status === 409) setTimeout(onClose, 3000);
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
            <h2 className="text-2xl font-extrabold">Pay entry fee</h2>
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

        <fieldset>
          <legend className="label">Pay with</legend>
          <div className="space-y-2">
            {METHODS.map(([v, l]) => (
              <label
                key={v}
                className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 ${method === v ? 'border-court bg-court/5' : 'border-line'}`}
              >
                <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="accent-court" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="rounded-[10px] bg-gold/25 px-3 py-2 text-sm">
          Test checkout: no real money moves. Order <span className="break-all">{order.orderId}</span>.
        </p>

        {error && (
          <p className="text-sm font-bold text-lose" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => pay('success')}>
            {busy ? 'Processing…' : order.closed ? `Try again: pay ${inr(order.amount)}` : `Pay ${inr(order.amount)}`}
          </button>
          <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => pay('failure')}>
            Simulate a failed payment
          </button>
        </div>
      </div>
    </dialog>
  );
}
