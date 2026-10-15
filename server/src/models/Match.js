import mongoose from 'mongoose';

// History of finished online and tournament matches (vs-computer games stay client-side).
const matchSchema = new mongoose.Schema(
  {
    gameId: { type: String, required: true },
    kind: { type: String, enum: ['friendly', 'tournament'], required: true },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    usernames: [String],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: 'played' }, // played / forfeit / walkover / draw
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
    bracketKey: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Match', matchSchema);
