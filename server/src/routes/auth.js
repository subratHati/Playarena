import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { config } from '../config.js';
import { signToken, requireAuth, asyncH } from '../middleware/auth.js';
import { sendLater, resetPasswordEmail, passwordChangedEmail, appUrl } from '../services/mailer.js';

const router = Router();
const RESET_TTL_MS = 60 * 60 * 1000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function checkNewPassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password is too long';
  return null;
}

// Mark the password as changed now: every login issued before this stops working.
async function setPassword(user, password) {
  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordChangedAt = new Date(Date.now() - 1000);
  user.resetTokenHash = null;
  user.resetTokenExpires = null;
  await user.save();
}

router.post(
  '/register',
  asyncH(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    const bad = checkNewPassword(password);
    if (bad) return res.status(400).json({ error: bad });

    const clash = await User.findOne({ $or: [{ email }, { username: new RegExp(`^${username}$`, 'i') }] });
    if (clash) {
      return res.status(409).json({ error: clash.email === email ? 'Email already registered' : 'Username taken' });
    }

    const user = await User.create({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: config.adminEmails.includes(email) ? 'admin' : 'player',
    });
    res.status(201).json({ token: signToken(user), user: user.toPublic() });
  })
);

router.post(
  '/login',
  asyncH(async (req, res) => {
    const id = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!id || !password) return res.status(400).json({ error: 'Enter your email or username and password' });
    const user = await User.findOne({ $or: [{ email: id }, { username: new RegExp(`^${escapeRegex(id)}$`, 'i') }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Wrong email/username or password' });
    }
    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// Always answers the same way, so it can't be used to find out which emails have accounts.
router.post(
  '/forgot-password',
  asyncH(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const reply = { message: 'If an account uses that email, we’ve sent a link to reset the password. Check your inbox and spam folder.' };
    if (!email) return res.status(400).json({ error: 'Enter your email' });

    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = sha256(token);
      user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
      await user.save();
      sendLater(resetPasswordEmail(user, appUrl(`/reset-password?token=${token}`)));
    }
    res.json(reply);
  })
);

router.post(
  '/reset-password',
  asyncH(async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    const bad = checkNewPassword(password);
    if (bad) return res.status(400).json({ error: bad });
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'This reset link is invalid. Ask for a new one.' });

    const user = await User.findOne({ resetTokenHash: sha256(token) });
    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.' });
    }
    await setPassword(user, password);
    sendLater(passwordChangedEmail(user));
    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncH(async (req, res) => {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    if (!(await bcrypt.compare(current, req.user.passwordHash))) {
      return res.status(400).json({ error: 'Your current password is wrong' });
    }
    const bad = checkNewPassword(next);
    if (bad) return res.status(400).json({ error: bad });
    if (current === next) return res.status(400).json({ error: 'Choose a password different from your current one' });

    await setPassword(req.user, next);
    sendLater(passwordChangedEmail(req.user));
    // A fresh token keeps this device logged in; other devices are logged out.
    res.json({ token: signToken(req.user), user: req.user.toPublic() });
  })
);

export default router;
