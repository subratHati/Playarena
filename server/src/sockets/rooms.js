import crypto from 'node:crypto';
import { engines } from '../games/index.js';
import { config } from '../config.js';
import Match from '../models/Match.js';
import User from '../models/User.js';

// Per-game settings: Stone Paper Scissors timings come from config; in tournaments a player
// who doesn't press Ready in time loses the match.
function gameOptions(gameId, kind) {
  if (gameId !== 'rock-paper-scissors') return {};
  return {
    timing: {
      firstPickMs: config.spsFirstPickMs,
      pickMs: config.spsPickMs,
      revealMs: config.spsRevealMs,
      readyMs: kind === 'tournament' ? config.spsReadySeconds * 1000 : null,
    },
  };
}

// Manages live 2-player matches (friendly online + tournament).
// The server owns the game state; clients only send moves and render views.
export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> room
    this.userRoom = new Map(); // userId -> roomId of their unfinished match
  }

  activeRoomOf(userId) {
    const id = this.userRoom.get(userId);
    const room = id && this.rooms.get(id);
    return room && room.status !== 'over' ? room : null;
  }

  create({ gameId, players, kind, tournamentId = null, bracketKey = null, onFinish = null }) {
    const engine = engines[gameId];
    if (!engine) throw new Error(`Unknown game ${gameId}`);
    const room = {
      id: crypto.randomUUID(),
      gameId,
      engine,
      kind,
      tournamentId,
      bracketKey,
      // Tournament draws are replayed until someone wins; friendly draws stand.
      drawPolicy: kind === 'tournament' ? 'replay' : 'end',
      onFinish,
      players: players.map((p) => ({ userId: p.userId, username: p.username, socketId: null })),
      state: engine.createState({ starter: 0, ...gameOptions(gameId, kind) }),
      status: 'waiting',
      result: null,
      timers: { noShow: null, reconnect: [null, null], cleanup: null, tick: null },
      rematch: new Set(),
      notice: null,
    };
    this.rooms.set(room.id, room);
    room.players.forEach((p) => this.userRoom.set(p.userId, room.id));

    if (kind === 'tournament') {
      room.timers.noShow = setTimeout(() => this.#noShow(room), config.noShowSeconds * 1000);
      room.noShowAt = Date.now() + config.noShowSeconds * 1000;
    }
    return room;
  }

  // Bind a player's socket to their seat (initial join or reconnect).
  attach(roomId, userId, socket) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const idx = room.players.findIndex((p) => p.userId === userId);
    if (idx < 0) return null;
    const seat = room.players[idx];

    if (seat.socketId && seat.socketId !== socket.id) {
      const old = this.io.sockets.sockets.get(seat.socketId);
      old?.leave(`room:${room.id}`);
      old?.emit('match:superseded', { roomId: room.id });
    }
    seat.socketId = socket.id;
    socket.join(`room:${room.id}`);

    clearTimeout(room.timers.reconnect[idx]);
    room.timers.reconnect[idx] = null;

    if (room.status === 'waiting' && room.players.every((p) => p.socketId)) {
      room.status = 'playing';
      clearTimeout(room.timers.noShow);
      room.notice = null;
      this.#begin(room);
    }
    this.broadcast(room);
    return room;
  }

  move(socket, roomId, move) {
    const room = this.rooms.get(roomId);
    if (!room) return socket.emit('match:error', { message: 'Match not found' });
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx < 0) return socket.emit('match:error', { message: 'You are not in this match' });
    if (room.status !== 'playing') {
      return socket.emit('match:error', { message: room.status === 'waiting' ? 'Waiting for your opponent' : 'Match is over' });
    }

    const { state, error } = room.engine.applyMove(room.state, idx, move, { now: Date.now() });
    if (error) return socket.emit('match:error', { message: error });
    room.state = state;
    room.notice = null;
    this.#afterChange(room);
  }

  // Start the game's own clock (timed games only), once both players are in.
  #begin(room) {
    if (room.engine.onStart) room.state = room.engine.onStart(room.state, { now: Date.now() });
    this.#scheduleTick(room);
  }

  // After any state change: end the match, replay a tournament draw, or keep going.
  #afterChange(room) {
    const outcome = room.engine.result(room.state);
    if (outcome) {
      clearTimeout(room.timers.tick);
      if (outcome.winner === null && !outcome.reason && room.drawPolicy === 'replay') {
        // Show the drawn board briefly, then restart.
        this.broadcast(room);
        room.notice = 'Draw! Replaying — a tournament match needs a winner.';
        room.state = room.engine.replay(room.state);
        setTimeout(() => {
          if (room.status !== 'playing') return;
          this.#begin(room);
          this.broadcast(room);
        }, 1200);
        return;
      }
      this.finish(room, outcome.winner, outcome.reason || (outcome.winner === null ? 'draw' : 'played'));
      return;
    }
    this.#scheduleTick(room);
    this.broadcast(room);
  }

  // Timed games tell us when something happens next (a timer runs out); wake up then.
  #scheduleTick(room) {
    clearTimeout(room.timers.tick);
    const at = room.engine.nextEventAt?.(room.state);
    if (!at) return;
    room.timers.tick = setTimeout(() => {
      if (room.status !== 'playing') return;
      room.state = room.engine.tick(room.state, { now: Date.now() });
      this.#afterChange(room);
    }, Math.max(0, at - Date.now()) + 5);
  }

  // End a match without a result (used when an admin deletes a live tournament).
  abort(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room || room.status === 'over') return;
    room.status = 'over';
    clearTimeout(room.timers.tick);
    clearTimeout(room.timers.noShow);
    room.timers.reconnect.forEach(clearTimeout);
    room.players.forEach((p) => {
      if (this.userRoom.get(p.userId) === room.id) this.userRoom.delete(p.userId);
    });
    room.result = { winnerIndex: null, winner: null, reason: 'cancelled' };
    room.notice = message;
    room.onFinish = null;
    this.broadcast(room);
    room.timers.cleanup = setTimeout(() => this.rooms.delete(room.id), 60_000);
  }

  leave(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx < 0) return;
    socket.leave(`room:${room.id}`);
    if (room.status === 'playing') {
      this.finish(room, 1 - idx, 'forfeit');
    } else if (room.status === 'over') {
      room.players[idx].socketId = null;
      room.rematch.clear();
      this.broadcast(room);
    }
  }

  disconnect(socket) {
    for (const room of this.rooms.values()) {
      const idx = room.players.findIndex((p) => p.socketId === socket.id);
      if (idx < 0) continue;
      room.players[idx].socketId = null;

      if (room.status === 'playing') {
        room.notice = `${room.players[idx].username} disconnected — they have ${config.reconnectSeconds}s to come back.`;
        room.timers.reconnect[idx] = setTimeout(() => {
          if (room.status === 'playing' && !room.players[idx].socketId) this.finish(room, 1 - idx, 'forfeit');
        }, config.reconnectSeconds * 1000);
      } else if (room.status === 'over') {
        room.rematch.clear();
      }
      this.broadcast(room);
    }
  }

  // Friendly matches only: both players ask for a rematch.
  requestRematch(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.kind !== 'friendly' || room.status !== 'over') return;
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx < 0) return;
    room.rematch.add(idx);
    if (room.rematch.size === 2 && room.players.every((p) => p.socketId)) {
      if (room.players.some((p) => this.activeRoomOf(p.userId))) return; // one of them started another match
      const starter = 1 - (room.state.starter ?? 0);
      room.state = { ...room.engine.createState({ starter, ...gameOptions(room.gameId, room.kind) }), starter };
      room.status = 'playing';
      room.result = null;
      room.notice = null;
      room.rematch.clear();
      clearTimeout(room.timers.cleanup);
      room.players.forEach((p) => this.userRoom.set(p.userId, room.id));
      this.#begin(room);
    }
    this.broadcast(room);
  }

  async finish(room, winnerIdx, reason) {
    if (room.status === 'over') return;
    room.status = 'over';
    clearTimeout(room.timers.noShow);
    clearTimeout(room.timers.tick);
    room.timers.reconnect.forEach(clearTimeout);
    room.timers.reconnect = [null, null];
    room.players.forEach((p) => {
      if (this.userRoom.get(p.userId) === room.id) this.userRoom.delete(p.userId);
    });

    const winner = winnerIdx === null || winnerIdx === undefined ? null : room.players[winnerIdx];
    room.result = { winnerIndex: winner ? winnerIdx : null, winner: winner?.username || null, reason };
    room.notice = null;
    this.broadcast(room);

    // Friendly rooms stay around a few minutes for rematches.
    room.timers.cleanup = setTimeout(() => this.rooms.delete(room.id), 5 * 60_000);

    try {
      if (reason !== 'double no-show' && reason !== 'cancelled') {
        await Match.create({
          gameId: room.gameId,
          kind: room.kind,
          players: room.players.map((p) => p.userId),
          usernames: room.players.map((p) => p.username),
          winner: winner?.userId || null,
          reason,
          tournament: room.tournamentId,
          bracketKey: room.bracketKey,
        });
        await Promise.all(
          room.players.map((p, i) =>
            User.updateOne(
              { _id: p.userId },
              { $inc: winner ? { [i === winnerIdx ? 'stats.wins' : 'stats.losses']: 1 } : { 'stats.draws': 1 } }
            )
          )
        );
      }
    } catch (err) {
      console.error('Failed to record match', err.message);
    }

    if (room.onFinish) {
      try {
        await room.onFinish({ room, winnerUserId: winner?.userId || null, reason });
      } catch (err) {
        console.error('onFinish failed', err);
      }
    }
  }

  #noShow(room) {
    if (room.status !== 'waiting') return;
    const present = room.players.map((p) => Boolean(p.socketId));
    if (present[0] && !present[1]) this.finish(room, 0, 'walkover');
    else if (present[1] && !present[0]) this.finish(room, 1, 'walkover');
    else this.finish(room, null, 'double no-show');
  }

  payload(room, idx) {
    return {
      roomId: room.id,
      gameId: room.gameId,
      kind: room.kind,
      status: room.status,
      you: idx,
      players: room.players.map((p) => ({ username: p.username, connected: Boolean(p.socketId) })),
      view: room.engine.view(room.state, idx, { now: Date.now() }),
      result: room.result,
      notice: room.notice,
      noShowAt: room.status === 'waiting' ? room.noShowAt || null : null,
      rematchRequested: [...room.rematch],
    };
  }

  broadcast(room) {
    room.players.forEach((p, i) => {
      if (p.socketId) this.io.to(p.socketId).emit('match:state', this.payload(room, i));
    });
  }
}
