import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { config } from '../config.js';
import { signToken, requireAuth, asyncH } from '../middleware/auth.js';

const router = Router();

router.post(
  '/register',
  asyncH(async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

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
    const user = await User.findOne({ $or: [{ email: id }, { username: new RegExp(`^${id.replace(/[^a-z0-9_@.]/gi, '')}$`, 'i') }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Wrong email/username or password' });
    }
    res.json({ token: signToken(user), user: user.toPublic() });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

export default router;
