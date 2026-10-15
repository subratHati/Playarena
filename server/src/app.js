import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import tournamentRoutes from './routes/tournaments.js';
import paymentRoutes from './routes/payments.js';
import miscRoutes from './routes/misc.js';

export function createApp() {
  const app = express();
  // Render/Railway sit behind one proxy; needed so rate limits see the real client IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientUrls, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.signupLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many accounts created from this network. Try again in an hour.' },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginFailLimit,
    skipSuccessfulRequests: true, // only failed attempts count
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many failed logins. Wait 15 minutes and try again.' },
  });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api', apiLimiter);
  app.use('/api/auth/register', signupLimiter);
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api', miscRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
