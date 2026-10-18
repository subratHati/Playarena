import mongoose from 'mongoose';

// Small site-wide settings changed from the admin panel (e.g. which hero slides to show).
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model('Setting', settingSchema);
