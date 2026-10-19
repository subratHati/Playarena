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
  // "Find an opponent" (random matchmaking). Off until there's enough traffic; invites and tournaments always work.
  matchmakingEnabled: process.env.ENABLE_MATCHMAKING === '1',
  schedulerIntervalMs: 5000,

  // Stone Paper Scissors timing (ms). Tournament players must press Ready within spsReadySeconds.
  spsFirstPickMs: num(process.env.SPS_FIRST_PICK_MS, 10_000),
  spsPickMs: num(process.env.SPS_PICK_MS, 3_000),
  spsRevealMs: num(process.env.SPS_REVEAL_MS, 1_000),
  spsReadySeconds: num(process.env.SPS_READY_SECONDS, 60),

  // Email (Brevo). Without BREVO_API_KEY, emails are printed to the server console.
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  emailFromName: process.env.EMAIL_FROM_NAME || 'MivoPlay',
  emailTimezone: process.env.EMAIL_TIMEZONE || 'Asia/Kolkata',
  reminderMinutes: num(process.env.REMINDER_MINUTES, 30),
  // Links in emails point here. Defaults to the first CLIENT_URL.
  appUrl: (process.env.APP_URL || (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  // Payment gateways. A gateway is offered at checkout only when its keys are set.
  payments: {
    // Mock checkout (no real money): MOCK_PAYMENTS=1 forces it on, 0 forces it off.
    // Unset: on only while no real gateway is configured.
    mockSetting: process.env.MOCK_PAYMENTS,
    // How often unfinished payments are re-checked with the gateway (ms).
    reconcileMs: num(process.env.PAYMENT_RECONCILE_MS, 60_000),
    // Public https address of this API, used for gateway notification links (e.g. https://api.mivoplay.fun).
    apiPublicUrl: (process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, ''),
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
      apiBase: process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com',
    },
    cashfree: {
      appId: process.env.CASHFREE_APP_ID || '',
      secretKey: process.env.CASHFREE_SECRET_KEY || '',
      env: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
      apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
      apiBase: process.env.CASHFREE_API_BASE || '',
    },
    phonepe: {
      clientId: process.env.PHONEPE_CLIENT_ID || '',
      clientSecret: process.env.PHONEPE_CLIENT_SECRET || '',
      clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
      env: process.env.PHONEPE_ENV === 'production' ? 'production' : 'sandbox',
      webhookUsername: process.env.PHONEPE_WEBHOOK_USERNAME || '',
      webhookPassword: process.env.PHONEPE_WEBHOOK_PASSWORD || '',
      apiBase: process.env.PHONEPE_API_BASE || '',
      authUrl: process.env.PHONEPE_AUTH_URL || '',
    },
  },

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
  if (!process.env.CLIENT_URL) problems.push('CLIENT_URL must be your frontend URL (e.g. https://mivoplay.fun)');
  if (process.env.BREVO_API_KEY && !process.env.EMAIL_FROM) {
    problems.push('EMAIL_FROM must be set to a sender address you verified in Brevo');
  }
  const p = config.payments;
  if (p.razorpay.keyId && !p.razorpay.keySecret) problems.push('RAZORPAY_KEY_SECRET is missing');
  if (p.cashfree.appId && !p.cashfree.secretKey) problems.push('CASHFREE_SECRET_KEY is missing');
  if (p.phonepe.clientId && !p.phonepe.clientSecret) problems.push('PHONEPE_CLIENT_SECRET is missing');
  if (p.mockSetting === '1') console.warn('Warning: MOCK_PAYMENTS=1, so players can "pay" without real money.');
  if (!process.env.BREVO_API_KEY) {
    console.warn('Warning: BREVO_API_KEY is not set, so emails (password resets, passes, reminders) are only logged, not sent.');
  }
  if (problems.length) {
    console.error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}
