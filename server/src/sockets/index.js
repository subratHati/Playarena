import { Server } from 'socket.io';
import { config } from '../config.js';
import { verifyToken } from '../middleware/auth.js';
import { RoomManager } from './rooms.js';
import { Matchmaking } from './matchmaking.js';
import { TournamentEngine } from '../services/tournamentEngine.js';

export function setupSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.clientUrls, credentials: true } });
  const rooms = new RoomManager(io);
  const matchmaking = new Matchmaking(io, rooms);
  const tournaments = new TournamentEngine(io, rooms);

  // Every socket must carry the user's login token.
  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token);
      socket.data.user = { id: payload.sub, username: payload.username };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;

    // Tell a returning player about an unfinished friendly/tournament match.
    const active = rooms.activeRoomOf(userId);
    if (active) socket.emit('match:resume-available', { roomId: active.id, gameId: active.gameId, kind: active.kind });

    socket.on('queue:join', ({ gameId } = {}) => matchmaking.joinQueue(socket, gameId));
    socket.on('queue:leave', () => {
      matchmaking.removeEverywhere(socket);
      socket.emit('queue:left');
    });
    socket.on('invite:create', ({ gameId } = {}) => matchmaking.createInvite(socket, gameId));
    socket.on('invite:join', ({ code } = {}) => matchmaking.joinInvite(socket, code));

    socket.on('match:attach', ({ roomId } = {}) => {
      if (!rooms.attach(roomId, userId, socket)) socket.emit('match:error', { message: 'Match not found or already over', gone: true });
    });
    socket.on('match:move', ({ roomId, move } = {}) => rooms.move(socket, roomId, move));
    socket.on('match:leave', ({ roomId } = {}) => rooms.leave(socket, roomId));
    socket.on('match:rematch', ({ roomId } = {}) => rooms.requestRematch(socket, roomId));

    socket.on('tournament:join', async ({ token } = {}) => {
      try {
        const pass = verifyToken(token);
        if (pass.typ !== 'tournament' || pass.uid !== userId) throw new Error('bad pass');
        await tournaments.join(socket, pass.tid, userId);
      } catch {
        socket.emit('tournament:error', { message: 'Your tournament pass is invalid or expired. Enter your Entry ID and passkey again.' });
      }
    });

    socket.on('disconnect', () => {
      matchmaking.removeEverywhere(socket);
      rooms.disconnect(socket);
      tournaments.leave(socket);
    });
  });

  return { io, rooms, matchmaking, tournaments };
}
