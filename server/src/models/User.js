import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['player', 'admin'], default: 'player' },
    stats: {
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      tournamentsWon: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), username: this.username, email: this.email, role: this.role, stats: this.stats };
};

export default mongoose.model('User', userSchema);
