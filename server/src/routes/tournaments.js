import { Router } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Tournament from '../models/Tournament.js';
import Registration from '../models/Registration.js';
import Payment from '../models/Payment.js';
import { config } from '../config.js';
import { gameIds } from '../games/index.js';
import { requireAuth, requireAdmin, verifyToken, asyncH } from '../middleware/auth.js';
import { newEntryId, newPasskey, newOrderId } from '../services/ids.js';
import { serializeTournament, serializeRegistration } from '../services/serialize.js';
import { onBooked, onCancelled } from '../services/tournamentMail.js';

const router = Router();
const isId = (id) => mongoose.isValidObjectId(id);

// ---------- Public listing ----------

router.get(
  '/',
  asyncH(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.game && gameIds.includes(req.query.game)) filter.gameId = req.query.game;
    const list = await Tournament.find(filter).sort({ startsAt: 1 }).limit(100);
    res.json({ tournaments: list.map((t) => serializeTournament(t)) });
  })
);

// ---------- Player: my entries ----------

router.get(
  '/me/registrations',
  requireAuth,
  asyncH(async (req, res) => {
    const regs = await Registration.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('tournament');
    res.json({ registrations: regs.filter((r) => r.tournament).map((r) => serializeRegistration(r, r.tournament)) });
  })
);

// ---------- Player: enter a tournament with Entry ID + passkey ----------

router.post(
  '/enter',
  requireAuth,
  asyncH(async (req, res) => {
    const entryId = String(req.body.entryId || '').trim().toUpperCase();
    const passkey = String(req.body.passkey || '').trim().toUpperCase();
    const reg = await Registration.findOne({ entryId });
    if (!reg || reg.passkey !== passkey) return res.status(401).json({ error: 'Entry ID or passkey is incorrect' });
    if (reg.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'These credentials belong to a different account' });
    }
    const t = await Tournament.findById(reg.tournament);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (t.status === 'cancelled') return res.status(410).json({ error: `This tournament was cancelled. ${t.note}`.trim() });

    // Short-lived pass the lobby socket checks.
    const token = jwt.sign(
      { typ: 'tournament', tid: t._id.toString(), rid: reg._id.toString(), uid: req.user._id.toString() },
      config.jwtSecret,
      { expiresIn: '12h' }
    );
    res.json({ tournamentId: t._id.toString(), token });
  })
);

// ---------- Public detail (shows your registration if logged in) ----------

router.get(
  '/:id',
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });

    let registration = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        const { sub } = verifyToken(header.slice(7));
        const reg = await Registration.findOne({ tournament: t._id, user: sub });
        if (reg) registration = serializeRegistration(reg);
      } catch {
        /* anonymous view */
      }
    }
    res.json({ tournament: serializeTournament(t, { withBracket: true }), registration });
  })
);

// ---------- Player: checkout (mock payment order) ----------

router.post(
  '/:id/checkout',
  requireAuth,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    if (t.status !== 'upcoming' || t.startsAt <= new Date()) {
      return res.status(409).json({ error: 'Registration is closed for this tournament' });
    }
    if (t.registeredCount >= t.maxPlayers) return res.status(409).json({ error: 'Tournament is full' });
    const existing = await Registration.findOne({ tournament: t._id, user: req.user._id });
    if (existing) return res.status(409).json({ error: 'You are already registered', registration: serializeRegistration(existing) });

    const payment = await Payment.create({
      orderId: newOrderId(),
      user: req.user._id,
      tournament: t._id,
      amount: t.entryFee,
    });

    // Free tournaments skip the payment screen.
    if (t.entryFee === 0) {
      const result = await completePayment(payment, req.user, 'free');
      return res.status(result.status).json(result.body);
    }

    res.status(201).json({ orderId: payment.orderId, amount: payment.amount, currency: payment.currency, tournament: serializeTournament(t) });
  })
);

// ---------- Admin ----------

router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const { title, gameId, description, reward } = req.body;
    const entryFee = Number(req.body.entryFee);
    const maxPlayers = Number(req.body.maxPlayers);
    const startsAt = new Date(req.body.startsAt);

    if (!title || String(title).trim().length < 3) return res.status(400).json({ error: 'Title is required' });
    if (!gameIds.includes(gameId)) return res.status(400).json({ error: 'Pick a valid game' });
    if (!Number.isFinite(entryFee) || entryFee < 0) return res.status(400).json({ error: 'Entry fee must be 0 or more' });
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 256) {
      return res.status(400).json({ error: 'Max players must be between 2 and 256' });
    }
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      return res.status(400).json({ error: 'Start time must be in the future' });
    }

    const t = await Tournament.create({
      title: String(title).trim(),
      gameId,
      description: String(description || '').trim(),
      reward: String(reward || '').trim() || undefined,
      entryFee: Math.round(entryFee),
      maxPlayers,
      startsAt,
      createdBy: req.user._id,
    });
    res.status(201).json({ tournament: serializeTournament(t) });
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const t = await Tournament.findOneAndUpdate(
      { _id: req.params.id, status: 'upcoming' },
      { status: 'cancelled', note: 'Cancelled by the organiser. Entry fees refunded.' },
      { new: true }
    );
    if (!t) return res.status(409).json({ error: 'Only upcoming tournaments can be cancelled' });
    await Payment.updateMany({ tournament: t._id, status: 'paid' }, { status: 'refunded', note: 'Tournament cancelled' });
    onCancelled(t).catch((err) => console.error('cancel emails failed', err));
    res.json({ tournament: serializeTournament(t) });
  })
);

export default router;

// ---------- Shared: finish a payment and issue credentials ----------

export async function completePayment(payment, user, method) {
  if (payment.status === 'paid') {
    const reg = await Registration.findOne({ payment: payment._id });
    return { status: 200, body: { registration: reg ? serializeRegistration(reg) : null } };
  }
  if (payment.status !== 'created') return { status: 409, body: { error: `Payment is ${payment.status}` } };

  // Reserve a seat atomically so two last-second payments can't overfill.
  const info = await Tournament.findById(payment.tournament).select('maxPlayers');
  const t = await Tournament.findOneAndUpdate(
    {
      _id: payment.tournament,
      status: 'upcoming',
      startsAt: { $gt: new Date() },
      registeredCount: { $lt: info?.maxPlayers ?? 0 },
    },
    { $inc: { registeredCount: 1 } },
    { new: true }
  );
  if (!t) {
    payment.status = 'refunded';
    payment.note = 'Seat unavailable at confirmation';
    await payment.save();
    return { status: 409, body: { error: 'Sorry, the tournament filled up or closed. Your payment has been refunded.' } };
  }

  let reg;
  try {
    reg = await Registration.create({
      tournament: t._id,
      user: user._id,
      username: user.username,
      entryId: newEntryId(t.gameId),
      passkey: newPasskey(),
      payment: payment._id,
    });
  } catch (err) {
    await Tournament.updateOne({ _id: t._id }, { $inc: { registeredCount: -1 } });
    payment.status = 'refunded';
    payment.note = err.code === 11000 ? 'Duplicate registration' : 'Registration failed';
    await payment.save();
    return { status: 409, body: { error: 'You are already registered for this tournament. Payment refunded.' } };
  }

  payment.status = 'paid';
  payment.method = method;
  payment.paidAt = new Date();
  await payment.save();
  onBooked(user, t, reg).catch((err) => console.error('booking email failed', err));
  return { status: 201, body: { registration: serializeRegistration(reg, t) } };
}
