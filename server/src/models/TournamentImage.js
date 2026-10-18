import mongoose from 'mongoose';

// Tournament cover images live in their own collection so tournament lists stay small.
// Stored in MongoDB because Render's disk is wiped on every deploy.
const tournamentImageSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, unique: true },
    contentType: { type: String, required: true },
    data: { type: String, required: true }, // base64; simple and safe with any MongoDB driver/host
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('TournamentImage', tournamentImageSchema);
