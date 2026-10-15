import Tournament from '../models/Tournament.js';
import Registration from '../models/Registration.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { config } from '../config.js';
import { shuffle } from './ids.js';
import { serializeTournament, checkinOpensAt } from './serialize.js';

// Runs scheduled single-elimination tournaments.
// - Lobby check-in opens CHECKIN_OPENS_MINUTES before start (players enter with Entry ID + passkey).
// - At start time the bracket is drawn from checked-in players; odd counts give a bye.
// - Each round's matches are played live; no-shows lose by walkover.
// Single-process design: for multiple server instances, move presence + locks to Redis.
export class TournamentEngine {
  constructor(io, rooms) {
    this.io = io;
    this.rooms = rooms;
    this.presence = new Map(); // tournamentId -> Map(userId -> Set(socketId))
    this.matchRooms = new Map(); // `${tid}:${key}` -> roomId
    this.locks = new Map(); // tournamentId -> Promise chain
    this.timer = null;
  }

  // Serialize all writes to one tournament so concurrent match results can't clobber each other.
  #withLock(tid, fn) {
    const prev = this.locks.get(tid) || Promise.resolve();
    const next = prev.then(fn, fn).catch((err) => console.error(`[tournament ${tid}]`, err));
    this.locks.set(tid, next);
    return next;
  }

  async startScheduler() {
    await this.#resumeLive();
    const tick = async () => {
      try {
        await this.tick();
      } catch (err) {
        console.error('Scheduler tick failed', err);
      }
      this.timer = setTimeout(tick, config.schedulerIntervalMs);
    };
    tick();
  }

  stop() {
    clearTimeout(this.timer);
  }

  async tick() {
    const now = new Date();
    // Auto check-in anyone waiting in a lobby once the window opens.
    const opening = await Tournament.find({
      status: 'upcoming',
      startsAt: { $gt: now, $lte: new Date(now.getTime() + config.checkinOpensMinutes * 60_000) },
    });
    for (const t of opening) await this.#checkInPresent(t);

    const due = await Tournament.find({ status: 'upcoming', startsAt: { $lte: now } });
    for (const t of due) await this.#withLock(t._id.toString(), () => this.#start(t._id));
  }

  async #checkInPresent(t) {
    const tid = t._id.toString();
    const present = [...(this.presence.get(tid)?.keys() || [])];
    if (!present.length) return;
    const res = await Registration.updateMany(
      { tournament: t._id, user: { $in: present }, checkedInAt: null },
      { checkedInAt: new Date() }
    );
    if (res.modifiedCount) await this.broadcast(tid);
  }

  async #start(tournamentId) {
    const t = await Tournament.findOne({ _id: tournamentId, status: 'upcoming' });
    if (!t) return;
    const tid = t._id.toString();
    await this.#checkInPresent(t);

    const regs = await Registration.find({ tournament: t._id, checkedInAt: { $ne: null } });
    if (regs.length < 2) {
      t.status = 'cancelled';
      t.note =
        regs.length === 0
          ? 'No players checked in. Entry fees refunded.'
          : 'Only one player checked in, so the tournament could not run. Entry fees refunded.';
      await t.save();
      await Payment.updateMany({ tournament: t._id, status: 'paid' }, { status: 'refunded', note: 'Tournament did not run' });
      await this.broadcast(tid);
      return;
    }

    // Registered players who never checked in.
    await Registration.updateMany({ tournament: t._id, checkedInAt: null }, { placement: 'Did not check in' });

    const seeded = shuffle(regs.map((r) => ({ id: r.user, name: r.username })));
    t.status = 'live';
    t.rounds = [{ matches: this.#pair(seeded, 1) }];
    await t.save();
    console.log(`[tournament] "${t.title}" started with ${regs.length} players`);
    await this.#launchRound(t);
  }

  #pair(players, roundNo) {
    const matches = [];
    for (let i = 0; i < players.length; i += 2) {
      const a = players[i];
      const b = players[i + 1];
      const key = `r${roundNo}m${matches.length + 1}`;
      if (!b) {
        matches.push({ key, players: [a.id, null], usernames: [a.name, null], winner: a.id, status: 'done', result: 'bye' });
      } else {
        matches.push({ key, players: [a.id, b.id], usernames: [a.name, b.name], winner: null, status: 'pending', result: '' });
      }
    }
    return matches;
  }

  // Create live rooms for every unfinished match in the current round.
  async #launchRound(t) {
    const tid = t._id.toString();
    const roundIdx = t.rounds.length - 1;
    const round = t.rounds[roundIdx];
    for (const m of round.matches) {
      if (m.status === 'done') continue;
      m.status = 'live';
      const room = this.rooms.create({
        gameId: t.gameId,
        kind: 'tournament',
        tournamentId: t._id,
        bracketKey: m.key,
        players: m.players.map((p, i) => ({ userId: p.toString(), username: m.usernames[i] })),
        onFinish: ({ winnerUserId, reason }) =>
          this.#withLock(tid, () => this.#matchFinished(tid, m.key, winnerUserId, reason)),
      });
      this.matchRooms.set(`${tid}:${m.key}`, room.id);

      // Seat anyone already waiting in the lobby.
      for (const p of room.players) {
        const sid = this.#firstSocket(tid, p.userId);
        const s = sid && this.io.sockets.sockets.get(sid);
        if (s) {
          s.emit('tournament:match', { roomId: room.id });
          this.rooms.attach(room.id, p.userId, s);
        }
      }
    }
    t.markModified('rounds');
    await t.save();
    await this.broadcast(tid);
    // A round made only of byes/no-shows finishes immediately.
    await this.#maybeAdvance(t);
  }

  async #matchFinished(tid, key, winnerUserId, reason) {
    this.matchRooms.delete(`${tid}:${key}`);
    const t = await Tournament.findById(tid);
    if (!t || t.status !== 'live') return;
    const round = t.rounds[t.rounds.length - 1];
    const m = round.matches.find((x) => x.key === key);
    if (!m || m.status === 'done') return;

    m.status = 'done';
    m.winner = winnerUserId || null;
    m.result = reason === 'played' ? 'won' : reason;
    t.markModified('rounds');
    await t.save();

    // Record where the loser(s) finished.
    const roundNo = t.rounds.length;
    const losers = m.players.filter((p) => p && p.toString() !== String(winnerUserId));
    if (losers.length) {
      await Registration.updateMany({ tournament: t._id, user: { $in: losers } }, { placement: `Out in round ${roundNo}` });
    }
    await this.broadcast(tid);
    await this.#maybeAdvance(t);
  }

  async #maybeAdvance(t) {
    const tid = t._id.toString();
    const round = t.rounds[t.rounds.length - 1];
    if (!round.matches.every((m) => m.status === 'done')) return;

    const advancing = round.matches
      .filter((m) => m.winner)
      .map((m) => {
        const i = m.players.findIndex((p) => p && p.toString() === m.winner.toString());
        return { id: m.winner, name: m.usernames[i] };
      });

    if (advancing.length >= 2) {
      t.rounds.push({ matches: this.#pair(advancing, t.rounds.length + 1) });
      t.markModified('rounds');
      await t.save();
      // Short breather so players can see the bracket update.
      setTimeout(() => this.#withLock(tid, () => this.#launchNextRound(tid)), 4000);
      await this.broadcast(tid);
      return;
    }

    t.status = 'completed';
    if (advancing.length === 1) {
      const champ = advancing[0];
      t.winner = champ.id;
      t.winnerName = champ.name;
      await Registration.updateOne({ tournament: t._id, user: champ.id }, { placement: 'Champion' });
      await User.updateOne({ _id: champ.id }, { $inc: { 'stats.tournamentsWon': 1 } });
      // The final's loser is runner-up.
      const final = round.matches.find((m) => m.winner && m.winner.toString() === champ.id.toString());
      const runner = final?.players.find((p) => p && p.toString() !== champ.id.toString());
      if (runner) await Registration.updateOne({ tournament: t._id, user: runner }, { placement: 'Runner-up' });
    } else {
      t.note = 'No players remained in the final round.';
    }
    await t.save();
    console.log(`[tournament] "${t.title}" completed. Champion: ${t.winnerName || 'none'}`);
    await this.broadcast(tid);
  }

  async #launchNextRound(tid) {
    const t = await Tournament.findById(tid);
    if (t && t.status === 'live') await this.#launchRound(t);
  }

  // After a restart, replay any unfinished matches of live tournaments.
  async #resumeLive() {
    const live = await Tournament.find({ status: 'live' });
    for (const t of live) {
      const round = t.rounds[t.rounds.length - 1];
      if (!round) continue;
      round.matches.forEach((m) => {
        if (m.status === 'live') m.status = 'pending';
      });
      console.log(`[tournament] resuming "${t.title}" round ${t.rounds.length}`);
      await this.#withLock(t._id.toString(), () => this.#launchRound(t));
    }
  }

  // ---------- Lobby sockets ----------

  #firstSocket(tid, userId) {
    const set = this.presence.get(tid)?.get(userId);
    return set && [...set][0];
  }

  async join(socket, tid, userId) {
    const t = await Tournament.findById(tid);
    if (!t) return socket.emit('tournament:error', { message: 'Tournament not found' });

    if (!this.presence.has(tid)) this.presence.set(tid, new Map());
    const users = this.presence.get(tid);
    if (!users.has(userId)) users.set(userId, new Set());
    users.get(userId).add(socket.id);
    socket.join(`t:${tid}`);
    socket.data.tournaments = [...new Set([...(socket.data.tournaments || []), tid])];

    if (t.status === 'upcoming' && new Date() >= checkinOpensAt(t)) {
      await Registration.updateOne({ tournament: t._id, user: userId, checkedInAt: null }, { checkedInAt: new Date() });
    }

    // Reconnect to a live match if they have one.
    const roomId = this.#roomFor(t, userId);
    if (roomId) {
      socket.emit('tournament:match', { roomId });
      this.rooms.attach(roomId, userId, socket);
    }
    await this.broadcast(tid);
  }

  #roomFor(t, userId) {
    if (t.status !== 'live') return null;
    const round = t.rounds[t.rounds.length - 1];
    const m = round?.matches.find((x) => x.status === 'live' && x.players.some((p) => p && p.toString() === userId));
    return m ? this.matchRooms.get(`${t._id}:${m.key}`) || null : null;
  }

  leave(socket) {
    for (const tid of socket.data.tournaments || []) {
      const users = this.presence.get(tid);
      const set = users?.get(socket.data.user.id);
      set?.delete(socket.id);
      if (set && !set.size) users.delete(socket.data.user.id);
      this.broadcast(tid).catch(() => {});
    }
  }

  async broadcast(tid) {
    const t = await Tournament.findById(tid);
    const users = this.presence.get(tid);
    if (!t || !users) return;
    const base = serializeTournament(t, { withBracket: true });
    const regs = await Registration.find({ tournament: t._id }).select('user checkedInAt placement');
    const checkedIn = regs.filter((r) => r.checkedInAt).length;

    for (const [userId, sockets] of users) {
      const reg = regs.find((r) => r.user.toString() === userId);
      const me = {
        checkedIn: Boolean(reg?.checkedInAt),
        placement: reg?.placement || '',
        activeRoomId: this.#roomFor(t, userId),
      };
      for (const sid of sockets) {
        this.io.to(sid).emit('tournament:state', { ...base, checkedInCount: checkedIn, inLobby: users.size, me, serverTime: Date.now() });
      }
    }
  }
}
