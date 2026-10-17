import { config } from '../config.js';

// Sends email through Brevo's HTTP API (works on hosts that block SMTP, like Render's free plan).
// Without BREVO_API_KEY, emails are printed to the server console instead, so local development
// works with no setup: the reset link appears in your terminal.

const recent = []; // last few emails, for the optional local test outbox

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const appUrl = (path = '') => `${config.appUrl}${path}`;

export async function sendEmail({ to, subject, text, html }) {
  const msg = { to, subject, text, html, at: new Date().toISOString() };
  recent.unshift(msg);
  recent.length = Math.min(recent.length, 50);

  if (!config.brevoApiKey) {
    console.log(`\n[email → ${to}] ${subject}\n${text}\n`);
    return { ok: true, dev: true };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: config.emailFrom, name: config.emailFromName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Brevo rejected "${subject}" to ${to}: ${res.status} ${await res.text()}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email] failed to send "${subject}" to ${to}:`, err.message);
    return { ok: false };
  }
}

// Fire-and-forget: an email problem must never break a booking or a tournament.
export function sendLater(message) {
  sendEmail(message).catch(() => {});
}

export const recentEmails = () => recent;

// ---------- Templates ----------

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#edf0f4;font-family:Arial,Helvetica,sans-serif;color:#172033">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #cfd6e0">
<tr><td style="padding:22px 24px 0;font-size:18px;font-weight:bold;color:#172033">Mivo<span style="color:#3346e8">Play</span></td></tr>
<tr><td style="padding:12px 24px 24px;font-size:15px;line-height:1.55">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
${bodyHtml}
</td></tr></table>
<p style="font-size:12px;color:#5b6578;margin:14px 0 0">You’re getting this because you have a MivoPlay account.</p>
</td></tr></table></body></html>`;
}

const button = (href, label) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#3346e8;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px;display:inline-block">${esc(label)}</a></p>`;

const passBox = (entryId, passkey) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0;border:2px dashed #cfd6e0;border-radius:12px"><tr>
<td style="padding:12px 16px"><div style="font-size:12px;color:#5b6578">Entry ID</div><div style="font-size:20px;font-weight:bold;letter-spacing:1px">${esc(entryId)}</div></td>
<td style="padding:12px 16px"><div style="font-size:12px;color:#5b6578">Passkey</div><div style="font-size:20px;font-weight:bold;letter-spacing:1px">${esc(passkey)}</div></td>
</tr></table>`;

export const when = (d) =>
  new Date(d).toLocaleString('en-IN', {
    timeZone: config.emailTimezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

export function resetPasswordEmail(user, link) {
  return {
    to: user.email,
    subject: 'Reset your MivoPlay password',
    text: `Hi ${user.username},\n\nUse this link to set a new password. It works once and expires in 1 hour:\n${link}\n\nIf you didn’t ask for this, ignore this email. Your password stays the same.`,
    html: layout(
      'Reset your password',
      `<p>Hi ${esc(user.username)},</p><p>Use the button below to set a new password. The link works once and expires in 1 hour.</p>${button(link, 'Set a new password')}<p style="color:#5b6578;font-size:13px">If you didn’t ask for this, ignore this email. Your password stays the same.</p>`
    ),
  };
}

export function passwordChangedEmail(user) {
  return {
    to: user.email,
    subject: 'Your MivoPlay password was changed',
    text: `Hi ${user.username},\n\nYour password was just changed and you were logged out on other devices.\nIf this wasn’t you, reset your password now: ${appUrl('/forgot-password')}`,
    html: layout(
      'Your password was changed',
      `<p>Hi ${esc(user.username)},</p><p>Your password was just changed, and you were logged out on your other devices.</p><p>If this wasn’t you, reset your password now.</p>${button(appUrl('/forgot-password'), 'Reset password')}`
    ),
  };
}

export function bookingEmail(user, t, reg) {
  const link = appUrl(`/tournaments/enter?entryId=${encodeURIComponent(reg.entryId)}`);
  const fee = t.entryFee === 0 ? 'Free entry' : `Paid ₹${t.entryFee}`;
  return {
    to: user.email,
    subject: `Your pass for ${t.title}`,
    text: `Hi ${user.username},\n\nYou're booked into ${t.title} (${fee}).\nStarts: ${when(t.startsAt)}\n\nEntry ID: ${reg.entryId}\nPasskey: ${reg.passkey}\n\nEnter the lobby shortly before the start time: ${link}\nIf you don't show up for your match, you lose it.`,
    html: layout(
      'You’re in',
      `<p>Hi ${esc(user.username)}, you’re booked into <b>${esc(t.title)}</b> (${esc(fee)}).</p><p><b>Starts:</b> ${esc(when(t.startsAt))}</p>${passBox(reg.entryId, reg.passkey)}<p>Enter the lobby with this pass shortly before the start time. If you don’t show up for your match, you lose it.</p>${button(link, 'Open the lobby')}`
    ),
  };
}

export function reminderEmail(user, t, reg, minutes) {
  const link = appUrl(`/tournaments/enter?entryId=${encodeURIComponent(reg.entryId)}`);
  return {
    to: user.email,
    subject: `${t.title} starts in ${minutes} minutes`,
    text: `Hi ${user.username},\n\n${t.title} starts at ${when(t.startsAt)}.\nEntry ID: ${reg.entryId}\nPasskey: ${reg.passkey}\n\nEnter the lobby now so you don't miss your first match: ${link}`,
    html: layout(
      `Starts in ${minutes} minutes`,
      `<p>Hi ${esc(user.username)}, <b>${esc(t.title)}</b> starts at ${esc(when(t.startsAt))}.</p>${passBox(reg.entryId, reg.passkey)}<p>Enter the lobby now so you don’t miss your first match.</p>${button(link, 'Enter the lobby')}`
    ),
  };
}

export function cancelledEmail(user, t, refunded) {
  return {
    to: user.email,
    subject: `${t.title} was cancelled`,
    text: `Hi ${user.username},\n\n${t.title} (${when(t.startsAt)}) was cancelled. ${t.note}${refunded ? `\nYour entry fee of ₹${t.entryFee} has been refunded.` : ''}\n\nOther tournaments: ${appUrl('/tournaments')}`,
    html: layout(
      'Tournament cancelled',
      `<p>Hi ${esc(user.username)}, <b>${esc(t.title)}</b> (${esc(when(t.startsAt))}) was cancelled.</p><p>${esc(t.note)}</p>${refunded ? `<p>Your entry fee of <b>₹${esc(t.entryFee)}</b> has been refunded.</p>` : ''}${button(appUrl('/tournaments'), 'See other tournaments')}`
    ),
  };
}
