import { config } from '../config.js';
import { catalog } from '../games/index.js';

const gameName = (id) => catalog.find((g) => g.id === id)?.name || id;

export function checkinOpensAt(t) {
  return new Date(new Date(t.startsAt).getTime() - config.checkinOpensMinutes * 60_000);
}

export function serializeRounds(t) {
  return (t.rounds || []).map((round, i) => ({
    round: i + 1,
    matches: round.matches.map((m) => {
      const wIdx = m.winner ? m.players.findIndex((p) => p && p.toString() === m.winner.toString()) : -1;
      return {
        key: m.key,
        players: m.usernames.map((u) => u || null),
        winner: wIdx >= 0 ? m.usernames[wIdx] : null,
        status: m.status,
        result: m.result,
      };
    }),
  }));
}

export function serializeTournament(t, { withBracket = false } = {}) {
  const out = {
    id: t._id.toString(),
    title: t.title,
    gameId: t.gameId,
    gameName: gameName(t.gameId),
    description: t.description,
    entryFee: t.entryFee,
    maxPlayers: t.maxPlayers,
    registeredCount: t.registeredCount,
    seatsLeft: Math.max(0, t.maxPlayers - t.registeredCount),
    startsAt: t.startsAt,
    checkinOpensAt: checkinOpensAt(t),
    reward: t.reward,
    status: t.status,
    winnerName: t.winnerName,
    note: t.note,
    imageUrl: t.imageVersion ? `/api/tournaments/${t._id}/image?v=${t.imageVersion}` : null,
    imageAspect: t.imageAspect || 'square',
    deletedAt: t.deletedAt || null,
  };
  if (withBracket) out.rounds = serializeRounds(t);
  return out;
}

export function serializeRegistration(r, t) {
  return {
    id: r._id.toString(),
    entryId: r.entryId,
    passkey: r.passkey,
    checkedIn: Boolean(r.checkedInAt),
    placement: r.placement,
    registeredAt: r.createdAt,
    tournament: t ? serializeTournament(t) : undefined,
  };
}
