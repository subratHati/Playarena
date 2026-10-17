import 'dotenv/config';

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : d);

export const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: num(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/playarena',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  checkinOpensMinutes: num(process.env.CHECKIN_OPENS_MINUTES, 15),
  noShowSeconds: num(process.env.NO_SHOW_SECONDS, 60),
  reconnectSeconds: num(process.env.RECONNECT_SECONDS, 30),
  // Max signups per IP per hour, and max FAILED logins per IP per 15 minutes.
  signupLimit: num(process.env.SIGNUP_LIMIT_PER_HOUR, 20),
  loginFailLimit: num(process.env.LOGIN_FAIL_LIMIT, 10),
  resetLimit: num(process.env.RESET_LIMIT_PER_HOUR, 5),
  schedulerIntervalMs: 5000,

  // Email (Brevo). Without BREVO_API_KEY, emails are printed to the server console.
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'PlayArena',
  emailTimezone: process.env.EMAIL_TIMEZONE || 'Asia/Kolkata',
  reminderMinutes: num(process.env.REMINDER_MINUTES, 30),
  // Links in emails point here. Defaults to the first CLIENT_URL.
  appUrl: (process.env.APP_URL || (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  // Local testing only: exposes recent emails at GET /api/dev/emails. Never set in production.
  exposeDevOutbox: process.env.EXPOSE_DEV_OUTBOX === '1' && process.env.NODE_ENV !== 'production',
};

// Refuse to boot a production server with unsafe defaults.
export function assertProductionConfig() {
  if (!isProduction) return;
  const problems = [];
  if (!process.env.MONGO_URI) problems.push('MONGO_URI is not set');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change-me/.test(process.env.JWT_SECRET)) {
    problems.push('JWT_SECRET must be a random string of at least 32 characters');
  }
  if (!process.env.CLIENT_URL) problems.push('CLIENT_URL must be your frontend URL (e.g. https://playarena.vercel.app)');
  if (process.env.BREVO_API_KEY && !process.env.EMAIL_FROM) {
    problems.push('EMAIL_FROM must be set to a sender address you verified in Brevo');
  }
  if (!process.env.BREVO_API_KEY) {
    console.warn('Warning: BREVO_API_KEY is not set, so emails (password resets, passes, reminders) are only logged, not sent.');
  }
  if (problems.length) {
    console.error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}
