import mongoose from 'mongoose';
import { gameIds } from '../games/index.js';

// One bracket match. players/usernames hold null for an empty slot.
const bracketMatchSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // e.g. "r1m3"
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }],
    usernames: [{ type: String, default: null }],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['pending', 'live', 'done'], default: 'pending' },
    result: { type: String, default: '' }, // "won", "walkover", "bye", "forfeit", "double no-show"
  },
  { _id: false }
);

const tournamentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    gameId: { type: String, required: true, enum: gameIds },
    description: { type: String, default: '', maxlength: 600 },
    entryFee: { type: Number, required: true, min: 0 }, // INR
    maxPlayers: { type: Number, required: true, min: 2, max: 256 },
    startsAt: { type: Date, required: true, index: true },
    reward: { type: String, default: 'Champion badge + leaderboard spot', maxlength: 120 }, // non-cash
    // cancelled = called off automatically (not enough players); deleted = removed by an admin (kept for refunds)
    status: { type: String, enum: ['upcoming', 'live', 'completed', 'cancelled', 'deleted'], default: 'upcoming', index: true },
    registeredCount: { type: Number, default: 0 },
    rounds: { type: [new mongoose.Schema({ matches: [bracketMatchSchema] }, { _id: false })], default: [] },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winnerName: { type: String, default: null },
    note: { type: String, default: '' },
    imageVersion: { type: Number, default: 0 }, // 0 = no image; bumps the image URL so caches refresh
    imageAspect: { type: String, enum: ['square', 'portrait', 'landscape'], default: 'square' }, // posters are square; older ones may be other shapes
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Tournament', tournamentSchema);
