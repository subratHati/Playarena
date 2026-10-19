import { Router } from 'express';
import Payment from '../models/Payment.js';
import Tournament from '../models/Tournament.js';
import { requireAuth, asyncH } from '../middleware/auth.js';
import { completePayment } from './tournaments.js';
import {
  availableGateways,
  getGateway,
  gatewayById,
  mockEnabled,
  orderIdFromAttempt,
  setCompletePayment,
  startGatewayPayment,
  syncPayment,
} from '../services/payments/index.js';
import { razorpay } from '../services/payments/razorpay.js';

setCompletePayment(completePayment);

const router = Router();
const MOCK_METHODS = ['upi', 'card', 'netbanking'];
const findMine = (req) => Payment.findOne({ orderId: req.params.orderId, user: req.user._id });

// Gateways offered at checkout (depends on which keys are set on the server).
router.get('/gateways', (req, res) => res.json({ gateways: availableGateways() }));

// Open a gateway's checkout for an order created by POST /api/tournaments/:id/checkout.
router.post(
  '/:orderId/start',
  requireAuth,
  asyncH(async (req, res) => {
    const payment = await findMine(req);
    if (!payment) return res.status(404).json({ error: 'Order not found' });
    if (payment.status !== 'created') return res.status(409).json({ error: `This order is already ${payment.status}` });
    // Don't take money for a seat that no longer exists.
    const t = await Tournament.findById(payment.tournament).select('status startsAt registeredCount maxPlayers');
    if (!t || t.status !== 'upcoming' || t.startsAt <= new Date()) return res.status(409).json({ error: 'Registration is closed for this tournament' });
    if (t.registeredCount >= t.maxPlayers) return res.status(409).json({ error: 'Tournament is full' });
    const gateway = getGateway(req.body.gateway);
    if (!gateway || gateway.id === 'mock') return res.status(400).json({ error: 'That payment option is not available' });
    const phone = String(req.body.phone || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (gateway.needsPhone && !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    try {
      res.json(await startGatewayPayment(payment, gateway, { user: req.user, phone }));
    } catch (err) {
      console.error(`[payments] ${gateway.id} create failed:`, err.message, err.body || '');
      res.status(502).json({ error: `${gateway.label} is not responding right now. Try again or pick another option.` });
    }
  })
);

// Called by the site after checkout closes or the player returns from the gateway.
// Real gateways: we ask the gateway for the result (never trust the browser). Mock: the outcome the tester picked.
router.post(
  '/:orderId/confirm',
  requireAuth,
  asyncH(async (req, res) => {
    const payment = await findMine(req);
    if (!payment) return res.status(404).json({ error: 'Order not found' });

    if (!payment.attempts.length) {
      if (!mockEnabled()) return res.status(400).json({ error: 'Choose a payment option first' });
      const method = MOCK_METHODS.includes(req.body.method) ? req.body.method : 'upi';
      if (req.body.simulate === 'failure') {
        if (payment.status === 'created') {
          payment.status = 'failed';
          payment.method = method;
          payment.provider = 'mock';
          payment.note = 'Simulated failure';
          await payment.save();
        }
        return res.status(402).json({ error: 'Payment failed. No money was taken — try again.' });
      }
      payment.provider = 'mock';
      const result = await completePayment(payment, req.user, method);
      return res.status(result.status).json(result.body);
    }

    // Razorpay's checkout hands back a signed result; reject forged ones early.
    const { razorpay_order_id: rzOrder, razorpay_payment_id: rzPay, razorpay_signature: rzSig } = req.body;
    if (rzSig) {
      const ours = payment.attempts.some((a) => a.provider === 'razorpay' && a.gatewayOrderId === rzOrder);
      if (!ours || !razorpay.enabled() || !razorpay.checkSignature({ gatewayOrderId: rzOrder, paymentId: rzPay, signature: rzSig })) {
        return res.status(400).json({ error: 'Payment could not be verified' });
      }
    }

    const sync = await syncPayment(payment);
    if (sync.state === 'paid' && sync.result) return res.status(sync.result.status).json(sync.result.body);
    if (sync.state === 'paid' || payment.status === 'paid') {
      const again = await completePayment(payment, req.user, payment.method); // returns the existing pass
      return res.status(200).json(again.body);
    }
    if (sync.state === 'closed') return res.status(sync.result.status).json(sync.result.body);
    if (sync.state === 'processing') return res.status(202).json({ pending: true });
    if (sync.state === 'mismatch') return res.status(409).json({ error: 'Payment amount did not match. Contact us with your order number.', orderId: payment.orderId });
    if (sync.state === 'failed') return res.status(402).json({ error: 'Payment did not go through. No money was taken. Try again.', retry: true });
    if (['refund_pending', 'refunded'].includes(payment.status)) return res.status(409).json({ error: 'This payment is marked for refund.' });
    res.status(202).json({ pending: true }); // still being processed by the gateway (common with UPI)
  })
);

// Gateway webhooks (configure these URLs in each gateway's dashboard). Raw body, verified signature.
router.post(
  '/webhooks/:gateway',
  asyncH(async (req, res) => {
    const gateway = gatewayById(req.params.gateway);
    if (!gateway || !gateway.enabled()) return res.status(404).json({ error: 'Unknown gateway' });
    if (!Buffer.isBuffer(req.body) || !gateway.verifyWebhook(req)) return res.status(401).json({ error: 'Bad signature' });
    let event;
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Bad JSON' });
    }
    try {
      const attemptId = await gateway.attemptFromWebhook(event);
      const payment = attemptId ? await Payment.findOne({ orderId: orderIdFromAttempt(attemptId) }) : null;
      if (payment) await syncPayment(payment); // re-checks with the gateway before issuing anything
    } catch (err) {
      console.error(`[payments] ${gateway.id} webhook handling failed:`, err.message);
      return res.status(500).json({ error: 'Try again' }); // gateway will retry
    }
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncH(async (req, res) => {
    const list = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('tournament', 'title');
    res.json({
      payments: list
        .filter((p) => p.status !== 'created' || p.attempts?.length) // hide checkouts that were never opened
        .map((p) => ({
          orderId: p.orderId,
          amount: p.amount,
          status: p.status,
          method: p.method,
          gateway: p.provider,
          tournament: p.tournament?.title || '—',
          createdAt: p.createdAt,
          note: p.note,
        })),
    });
  })
);

export default router;
