// Creates an admin account and a few sample tournaments.
// Usage: npm run seed
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config, isProduction } from './config.js';
import User from './models/User.js';
import Tournament from './models/Tournament.js';

// Usage:
//   npm run seed                     admin + sample tournaments (local)
//   ADMIN_PASSWORD=... npm run seed  required in production; sample tournaments are skipped there
const at = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 3600_000);

const password = process.env.ADMIN_PASSWORD || (isProduction ? null : 'admin123');
if (!password || password.length < 8 && isProduction) {
  console.error('Set ADMIN_PASSWORD (at least 8 characters) to create the admin in production.');
  process.exit(1);
}

await mongoose.connect(config.mongoUri);

const email = config.adminEmails[0] || 'admin@playarena.dev';
let admin = await User.findOne({ email });
if (!admin) {
  admin = await User.create({ username: 'admin', email, passwordHash: await bcrypt.hash(password, 10), role: 'admin' });
  console.log(`Admin created: ${email}${process.env.ADMIN_PASSWORD ? '' : ' / admin123  (local only)'}`);
} else {
  console.log(`Admin already exists: ${email}`);
}

if (isProduction) {
  await mongoose.disconnect();
  process.exit(0);
}

const samples = [
  { title: 'Friday Night Tic Tac Toe', gameId: 'tic-tac-toe', entryFee: 49, maxPlayers: 16, startsAt: at(48), description: 'Knockout bracket. Draws are replayed with the other player starting.' },
  { title: 'Stone Paper Scissors Showdown', gameId: 'rock-paper-scissors', entryFee: 29, maxPlayers: 32, startsAt: at(72), description: 'Best-of-3 every round. Fast and furious.' },
  { title: 'Connect Four Masters', gameId: 'connect-four', entryFee: 99, maxPlayers: 8, startsAt: at(96), description: 'For the strategists. Eight seats only.' },
  { title: 'Free Practice Cup', gameId: 'tic-tac-toe', entryFee: 0, maxPlayers: 64, startsAt: at(24), description: 'Free to join — learn how tournaments work.' },
];

for (const s of samples) {
  if (!(await Tournament.findOne({ title: s.title, status: 'upcoming' }))) {
    await Tournament.create({ ...s, createdBy: admin._id });
    console.log(`Tournament created: ${s.title}`);
  }
}

await mongoose.disconnect();
