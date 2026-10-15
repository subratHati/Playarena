import { Router } from 'express';
import User from '../models/User.js';
import Match from '../models/Match.js';
import { catalog } from '../games/index.js';
import { requireAuth, asyncH } from '../middleware/auth.js';

const router = Router();

router.get('/games', (req, res) => res.json({ games: catalog }));

router.get(
  '/leaderboard',
  asyncH(async (req, res) => {
    const users = await User.find({})
      .sort({ 'stats.tournamentsWon': -1, 'stats.wins': -1, 'stats.losses': 1 })
      .limit(20)
      .select('username stats');
    res.json({ players: users.map((u) => ({ username: u.username, ...u.stats.toObject() })) });
  })
);

router.get(
  '/matches/me',
  requireAuth,
  asyncH(async (req, res) => {
    const matches = await Match.find({ players: req.user._id }).sort({ createdAt: -1 }).limit(20);
    const me = req.user._id.toString();
    res.json({
      matches: matches.map((m) => ({
        id: m._id.toString(),
        gameId: m.gameId,
        kind: m.kind,
        opponent: m.usernames.find((u) => u !== req.user.username) || '—',
        outcome: !m.winner ? 'draw' : m.winner.toString() === me ? 'win' : 'loss',
        reason: m.reason,
        playedAt: m.createdAt,
      })),
    });
  })
);

export default router;
