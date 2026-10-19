import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import tournamentRoutes from './routes/tournaments.js';
import paymentRoutes from './routes/payments.js';
import miscRoutes from './routes/misc.js';
import heroRoutes from './routes/hero.js';
import { recentEmails } from './services/mailer.js';

export function createApp() {
  const app = express();
  // Render/Railway sit behind one proxy; needed so rate limits see the real client IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.clientUrls, credentials: true }));
  // Small JSON bodies everywhere, except the two uploads that carry an image.
  const smallJson = express.json({ limit: '100kb' });
  const imageJson = express.json({ limit: '4.5mb' }); // up to two pictures (hero banner: computer + phone)
  const carriesImage = (p) => p === '/api/tournaments' || p === '/api/hero/slides' || /^\/api\/hero\/slides\/[a-f0-9]{24}\/update$/.test(p);
  // Gateway webhooks need the exact raw bytes to check their signatures.
  const rawBody = express.raw({ type: () => true, limit: '1mb' });
  app.use((req, res, next) => {
    if (req.method === 'POST' && req.path.startsWith('/api/payments/webhooks/')) return rawBody(req, res, next);
    return (req.method === 'POST' && carriesImage(req.path) ? imageJson : smallJson)(req, res, next);
  });

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
  app.use('/api/auth/forgot-password', rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: config.resetLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many reset requests. Try again in an hour.' },
  }));
  app.use('/api/auth/change-password', loginLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/hero', heroRoutes);
  app.use('/api', miscRoutes);

  if (config.exposeDevOutbox) {
    // Local testing only (EXPOSE_DEV_OUTBOX=1, never in production).
    app.get('/api/dev/emails', (req, res) => res.json({ emails: recentEmails() }));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
