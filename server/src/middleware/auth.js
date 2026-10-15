import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import User from '../models/User.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: '7d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

// Wrap async route handlers so thrown errors reach the error middleware.
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
