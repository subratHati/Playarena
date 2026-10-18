import { Router } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Tournament from '../models/Tournament.js';
import Registration from '../models/Registration.js';
import Payment from '../models/Payment.js';
import TournamentImage from '../models/TournamentImage.js';
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
    const filter = { status: { $ne: 'deleted' } };
    if (req.query.status) {
      const wanted = String(req.query.status).split(',').filter((st) => st !== 'deleted');
      filter.status = { $in: wanted };
    }
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
    if (t.status === 'cancelled' || t.status === 'deleted') {
      return res.status(410).json({ error: `This tournament was called off. ${t.note}`.trim() });
    }

    // Short-lived pass the lobby socket checks.
    const token = jwt.sign(
      { typ: 'tournament', tid: t._id.toString(), rid: reg._id.toString(), uid: req.user._id.toString() },
      config.jwtSecret,
      { expiresIn: '12h' }
    );
    res.json({ tournamentId: t._id.toString(), token });
  })
);

// ---------- Admin: every tournament (including deleted), with money totals ----------

router.get(
  '/admin/all',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const list = await Tournament.find({}).sort({ startsAt: -1 }).limit(300);
    const ids = list.map((t) => t._id);
    const pays = await Payment.find({ tournament: { $in: ids }, status: { $in: ['paid', 'refund_pending', 'refunded'] } }).select('tournament amount status');
    const sums = {};
    for (const p of pays) {
      const k = p.tournament.toString();
      sums[k] ||= { collected: 0, refundPending: 0, refundPendingCount: 0, refunded: 0 };
      sums[k].collected += p.amount; // everything ever paid, including money now owed back
      if (p.status === 'refund_pending') {
        sums[k].refundPending += p.amount;
        sums[k].refundPendingCount += 1;
      }
      if (p.status === 'refunded') sums[k].refunded += p.amount;
    }
    res.json({
      tournaments: list.map((t) => ({
        ...serializeTournament(t),
        money: sums[t._id.toString()] || { collected: 0, refundPending: 0, refundPendingCount: 0, refunded: 0 },
      })),
    });
  })
);

// ---------- Cover image ----------

router.get(
  '/:id/image',
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).end();
    const img = await TournamentImage.findOne({ tournament: req.params.id });
    if (!img) return res.status(404).end();
    res.set({
      'Content-Type': img.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable', // URL changes when the image does (?v=)
      'Cross-Origin-Resource-Policy': 'cross-origin', // the site and API live on different domains
    });
    res.send(Buffer.from(img.data, 'base64'));
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
    let viewerIsAdmin = false;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        const { sub, role } = verifyToken(header.slice(7));
        viewerIsAdmin = role === 'admin';
        const reg = await Registration.findOne({ tournament: t._id, user: sub });
        if (reg) registration = serializeRegistration(reg);
      } catch {
        /* anonymous view */
      }
    }
    // Deleted tournaments are gone for players, but someone who paid can still see it (for the refund note).
    if (t.status === 'deleted' && !viewerIsAdmin && !registration) return res.status(404).json({ error: 'Tournament not found' });
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
    const image = parseImage(req.body.image);
    if (image.error) return res.status(400).json({ error: image.error });

    const t = await Tournament.create({
      title: String(title).trim(),
      gameId,
      description: String(description || '').trim(),
      reward: String(reward || '').trim() || undefined,
      entryFee: Math.round(entryFee),
      maxPlayers,
      startsAt,
      createdBy: req.user._id,
      imageVersion: 1,
      imageAspect: ['square', 'portrait', 'landscape'].includes(req.body.imageAspect) ? req.body.imageAspect : 'square',
    });
    await TournamentImage.create({ tournament: t._id, contentType: image.contentType, data: image.data.toString('base64'), size: image.data.length });
    res.status(201).json({ tournament: serializeTournament(t) });
  })
);

// Tournaments can't be edited. An admin can only delete an upcoming or live one.
// Deleted tournaments stay in the database (and the admin panel) so players can be refunded.
router.post(
  '/:id/delete',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const engine = req.app.locals.tournaments;
    const result = await engine.deleteTournament(req.params.id, req.user._id, String(req.body.reason || '').trim().slice(0, 200));
    if (result.error) return res.status(409).json({ error: result.error });
    res.json({ tournament: serializeTournament(result.tournament) });
  })
);

// ---------- Admin: who registered (name, email, pass, payment) ----------

router.get(
  '/:id/participants',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const t = await Tournament.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    const regs = await Registration.find({ tournament: t._id })
      .sort({ createdAt: 1 })
      .populate('user', 'username email')
      .populate('payment', 'orderId amount status method paidAt refundedAt');
    res.json({
      tournament: serializeTournament(t),
      participants: regs.map((r) => ({
        registrationId: r._id.toString(),
        username: r.user?.username || r.username,
        email: r.user?.email || '',
        entryId: r.entryId,
        registeredAt: r.createdAt,
        checkedIn: Boolean(r.checkedInAt),
        placement: r.placement,
        payment: r.payment
          ? {
              orderId: r.payment.orderId,
              amount: r.payment.amount,
              status: r.payment.status,
              method: r.payment.method,
              paidAt: r.payment.paidAt,
              refundedAt: r.payment.refundedAt,
            }
          : null,
      })),
    });
  })
);

// ---------- Admin: record that a refund was sent ----------

router.post(
  '/:id/refunds',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Tournament not found' });
    const filter = { tournament: req.params.id, status: 'refund_pending' };
    if (req.body.orderId) filter.orderId = String(req.body.orderId);
    const r = await Payment.updateMany(filter, { status: 'refunded', refundedAt: new Date(), refundedBy: req.user._id });
    res.json({ updated: r.modifiedCount });
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
    payment.status = 'refund_pending';
    payment.note = 'Seat unavailable at confirmation';
    await payment.save();
    return { status: 409, body: { error: 'Sorry, the tournament filled up or closed. Your payment will be refunded.' } };
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
    payment.status = 'refund_pending';
    payment.note = err.code === 11000 ? 'Duplicate registration' : 'Registration failed';
    await payment.save();
    return { status: 409, body: { error: 'You are already registered for this tournament. This payment will be refunded.' } };
  }

  payment.status = 'paid';
  payment.method = method;
  payment.paidAt = new Date();
  await payment.save();
  onBooked(user, t, reg).catch((err) => console.error('booking email failed', err));
  return { status: 201, body: { registration: serializeRegistration(reg, t) } };
}

// ---------- Image upload helper ----------
// The admin page sends the picture as a data URL (already resized in the browser).
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP',
};

export function parseImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'Add a cover image (JPG, PNG or WebP)' };
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES) return { error: 'Cover image is too large (max 1.5 MB)' };
  if (!SIGNATURES[m[1]](data)) return { error: 'That file is not a valid image' };
  return { contentType: m[1], data };
}
