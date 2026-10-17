import Tournament from '../models/Tournament.js';
import Registration from '../models/Registration.js';
import { config } from '../config.js';
import { sendLater, bookingEmail, reminderEmail, cancelledEmail } from './mailer.js';

const reminderWindowMs = () => config.reminderMinutes * 60_000;

// After a successful booking: email the pass. If the start is already inside the
// reminder window, count this email as the reminder so the player doesn't get two.
export async function onBooked(user, t, reg) {
  sendLater(bookingEmail(user, t, reg));
  if (new Date(t.startsAt).getTime() - Date.now() <= reminderWindowMs()) {
    await Registration.updateOne({ _id: reg._id }, { reminderSentAt: new Date() });
  }
}

// Called by the scheduler: remind players whose tournament starts within REMINDER_MINUTES.
export async function sendDueReminders() {
  if (config.reminderMinutes <= 0) return;
  const now = Date.now();
  const soon = await Tournament.find({
    status: 'upcoming',
    startsAt: { $gt: new Date(now), $lte: new Date(now + reminderWindowMs()) },
  });
  for (const t of soon) {
    const minutes = Math.max(1, Math.round((new Date(t.startsAt).getTime() - now) / 60_000));
    const pending = await Registration.find({ tournament: t._id, reminderSentAt: null }).populate('user', 'username email');
    for (const reg of pending) {
      // Claim the reminder first so a slow send or a restart never emails twice.
      const claimed = await Registration.findOneAndUpdate(
        { _id: reg._id, reminderSentAt: null },
        { reminderSentAt: new Date() }
      );
      if (claimed && reg.user) sendLater(reminderEmail(reg.user, t, reg, minutes));
    }
  }
}

// Tell everyone registered that the tournament is off (admin cancel or not enough players).
export async function onCancelled(t) {
  const regs = await Registration.find({ tournament: t._id }).populate('user', 'username email');
  for (const reg of regs) {
    if (reg.user) sendLater(cancelledEmail(reg.user, t, t.entryFee > 0));
  }
}
