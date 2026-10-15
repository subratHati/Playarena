import { Router } from 'express';
import Payment from '../models/Payment.js';
import { requireAuth, asyncH } from '../middleware/auth.js';
import { completePayment } from './tournaments.js';

// MOCK PAYMENT GATEWAY
// The client's checkout screen calls /confirm with the outcome the user picks.
// To go live, replace /confirm with your gateway's flow: create the order on the
// gateway in /checkout, then verify its signature/webhook here and call completePayment().
const router = Router();
const METHODS = ['upi', 'card', 'netbanking'];

router.post(
  '/:orderId/confirm',
  requireAuth,
  asyncH(async (req, res) => {
    const payment = await Payment.findOne({ orderId: req.params.orderId, user: req.user._id });
    if (!payment) return res.status(404).json({ error: 'Order not found' });

    const method = METHODS.includes(req.body.method) ? req.body.method : 'upi';
    if (req.body.simulate === 'failure') {
      if (payment.status === 'created') {
        payment.status = 'failed';
        payment.method = method;
        payment.note = 'Simulated failure';
        await payment.save();
      }
      return res.status(402).json({ error: 'Payment failed. No money was taken — try again.' });
    }

    const result = await completePayment(payment, req.user, method);
    res.status(result.status).json(result.body);
  })
);

router.get(
  '/me',
  requireAuth,
  asyncH(async (req, res) => {
    const list = await Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('tournament', 'title');
    res.json({
      payments: list.map((p) => ({
        orderId: p.orderId,
        amount: p.amount,
        status: p.status,
        method: p.method,
        tournament: p.tournament?.title || '—',
        createdAt: p.createdAt,
        note: p.note,
      })),
    });
  })
);

export default router;
