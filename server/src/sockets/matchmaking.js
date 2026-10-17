import { gameIds } from '../games/index.js';
import { code } from '../services/ids.js';
import { config } from '../config.js';

// Friendly online play: a random-opponent queue per game, plus private invite codes.
export class Matchmaking {
  constructor(io, rooms) {
    this.io = io;
    this.rooms = rooms;
    this.queues = new Map(gameIds.map((id) => [id, []])); // gameId -> [{userId, username, socketId}]
    this.invites = new Map(); // code -> {gameId, host:{userId, username, socketId}, expires}
  }

  #busy(socket) {
    const room = this.rooms.activeRoomOf(socket.data.user.id);
    if (room) {
      socket.emit('match:error', { message: 'Finish your current match first', roomId: room.id });
      return true;
    }
    return false;
  }

  #start(gameId, a, b) {
    const room = this.rooms.create({
      gameId,
      kind: 'friendly',
      players: [
        { userId: a.userId, username: a.username },
        { userId: b.userId, username: b.username },
      ],
    });
    for (const p of [a, b]) {
      const s = this.io.sockets.sockets.get(p.socketId);
      if (s) {
        s.emit('match:found', { roomId: room.id, gameId });
        this.rooms.attach(room.id, p.userId, s);
      }
    }
  }

  joinQueue(socket, gameId) {
    if (!config.matchmakingEnabled) {
      return socket.emit('match:error', { message: 'Finding a random opponent is coming soon. Invite a friend instead.' });
    }
    if (!this.queues.has(gameId)) return socket.emit('match:error', { message: 'Unknown game' });
    if (this.#busy(socket)) return;
    this.removeEverywhere(socket);
    const me = { userId: socket.data.user.id, username: socket.data.user.username, socketId: socket.id };
    const q = this.queues.get(gameId);

    const idx = q.findIndex((p) => p.userId !== me.userId && this.io.sockets.sockets.has(p.socketId));
    if (idx >= 0) {
      const [opponent] = q.splice(idx, 1);
      return this.#start(gameId, opponent, me);
    }
    q.push(me);
    socket.emit('queue:waiting', { gameId, position: q.length });
  }

  createInvite(socket, gameId) {
    if (!this.queues.has(gameId)) return socket.emit('match:error', { message: 'Unknown game' });
    if (this.#busy(socket)) return;
    this.removeEverywhere(socket);
    let c;
    do c = code(5);
    while (this.invites.has(c));
    this.invites.set(c, {
      gameId,
      host: { userId: socket.data.user.id, username: socket.data.user.username, socketId: socket.id },
      expires: Date.now() + 15 * 60_000,
    });
    socket.emit('invite:created', { code: c, gameId });
  }

  joinInvite(socket, rawCode) {
    const c = String(rawCode || '').trim().toUpperCase();
    const invite = this.invites.get(c);
    if (!invite || invite.expires < Date.now() || !this.io.sockets.sockets.has(invite.host.socketId)) {
      this.invites.delete(c);
      return socket.emit('match:error', { message: 'Invite code is invalid or expired' });
    }
    if (invite.host.userId === socket.data.user.id) {
      return socket.emit('match:error', { message: "That's your own invite — share it with a friend" });
    }
    if (this.#busy(socket)) return;
    this.invites.delete(c);
    this.removeEverywhere(socket);
    this.#start(invite.gameId, invite.host, {
      userId: socket.data.user.id,
      username: socket.data.user.username,
      socketId: socket.id,
    });
  }

  removeEverywhere(socket) {
    for (const q of this.queues.values()) {
      const i = q.findIndex((p) => p.socketId === socket.id);
      if (i >= 0) q.splice(i, 1);
    }
    for (const [c, inv] of this.invites) if (inv.host.socketId === socket.id) this.invites.delete(c);
  }

  onlineCounts() {
    return Object.fromEntries([...this.queues].map(([id, q]) => [id, q.length]));
  }
}
