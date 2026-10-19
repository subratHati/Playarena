import { api } from './api';

// Gateway browser SDKs are loaded only when a player chooses that gateway.
const SCRIPTS = {
  razorpay: 'https://checkout.razorpay.com/v1/checkout.js',
  cashfree: 'https://sdk.cashfree.com/js/v3/cashfree.js',
};
const loading = {};
export function loadScript(src) {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        delete loading[src];
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}

const PENDING_KEY = 'mv_pending_payment';
export const savePending = (info) => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...info, at: Date.now() }));
  } catch {
    /* storage blocked */
  }
};
export const readPending = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  } catch {
    return null;
  }
};
export const clearPending = () => {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
};

// Opens Razorpay's checkout. Resolves with the signed result, or { dismissed: true } if closed.
export async function openRazorpay(start, { theme = '#3346e8' } = {}) {
  await loadScript(SCRIPTS.razorpay);
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: start.keyId,
      order_id: start.gatewayOrderId,
      amount: start.amountPaise,
      currency: start.currency,
      name: start.name,
      description: start.description,
      prefill: start.prefill,
      theme: { color: theme },
      handler: (r) => resolve(r),
      modal: { ondismiss: () => resolve({ dismissed: true }), confirm_close: true },
    });
    rzp.on('payment.failed', () => {}); // Razorpay shows the error and lets the player retry inside the window
    rzp.open();
  });
}

// Opens Cashfree's checkout as a pop-up. Resolves with Cashfree's result object.
export async function openCashfree(start) {
  await loadScript(SCRIPTS.cashfree);
  const cashfree = window.Cashfree({ mode: start.mode === 'production' ? 'production' : 'sandbox' });
  return cashfree.checkout({ paymentSessionId: start.paymentSessionId, redirectTarget: '_modal' });
}

// Ask the server for the result, waiting while the gateway is still processing (UPI can take a little while).
// Resolves { registration } on success; throws an Error with .status on failure.
export async function confirmPayment(orderId, body = {}, { tries = 25, everyMs = 2000, onWaiting } = {}) {
  for (let i = 0; i < tries; i++) {
    const res = await api(`/payments/${orderId}/confirm`, { method: 'POST', body });
    if (!res.pending) return res;
    onWaiting?.(i);
    await new Promise((r) => setTimeout(r, everyMs));
  }
  const err = new Error('We haven’t received confirmation from the payment provider yet. If money was taken, your pass will appear in My entries within a few minutes.');
  err.status = 202;
  throw err;
}
