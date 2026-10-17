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
    // Logins issued before this moment are rejected (set when the password changes).
    passwordChangedAt: { type: Date, default: null },
    // Only a hash of the reset token is stored, so a database leak can't be used to reset passwords.
    resetTokenHash: { type: String, default: null, index: true },
    resetTokenExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), username: this.username, email: this.email, role: this.role, stats: this.stats };
};

// True if a login token issued at `iatSeconds` was issued before the last password change.
userSchema.methods.tokenIsStale = function tokenIsStale(iatSeconds) {
  return Boolean(this.passwordChangedAt) && iatSeconds * 1000 < this.passwordChangedAt.getTime();
};

export default mongoose.model('User', userSchema);
