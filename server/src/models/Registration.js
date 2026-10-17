import mongoose from 'mongoose';

const registrationSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    entryId: { type: String, required: true, unique: true },
    passkey: { type: String, required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    checkedInAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    placement: { type: String, default: '' }, // "Champion", "Runner-up", "Round 2", ...
  },
  { timestamps: true }
);

registrationSchema.index({ tournament: 1, user: 1 }, { unique: true });

export default mongoose.model('Registration', registrationSchema);
