import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatWhen, passKey } from '../lib/api';
import { GAMES } from '../lib/games';
import { tournamentImage } from '../lib/image';
import Countdown, { useNow } from '../components/Countdown';
import Bracket from '../components/Bracket';
import OnlineMatch from '../components/OnlineMatch';

export default function Lobby() {
  const { id } = useParams();
  const { user, socket, loading } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [offset, setOffset] = useState(0); // server clock - local clock
  const now = useNow();
  const token = sessionStorage.getItem(passKey(id));

  useEffect(() => {
    if (!socket || !token) return undefined;
    const join = () => socket.emit('tournament:join', { token });
    const onState = (s) => {
      if (s.id !== id) return;
      setT(s);
      setOffset(s.serverTime - Date.now());
      if (s.me.activeRoomId) setRoomId(s.me.activeRoomId);
    };
    const onMatch = ({ roomId: r }) => setRoomId(r);
    const onError = (e) => setError(e.message);
    socket.on('tournament:state', onState);
    socket.on('tournament:match', onMatch);
    socket.on('tournament:error', onError);
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('tournament:state', onState);
      socket.off('tournament:match', onMatch);
      socket.off('tournament:error', onError);
      socket.off('connect', join);
    };
  }, [socket, token, id]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!token) return <Navigate to="/tournaments/enter" replace />;

  if (error) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <p className="mb-4 font-bold">{error}</p>
        <Link to="/tournaments/enter" className="btn-primary">
          Enter your pass again
        </Link>
      </div>
    );
  }
  if (!t) return <p className="py-16 text-center text-muted">Joining the lobby…</p>;

  const g = GAMES[t.gameId];
  const checkinOpen = now + offset >= new Date(t.checkinOpensAt).getTime();
  const inMatch = roomId && t.status === 'live';
  const placement = t.me.placement;
  const eliminated = placement && placement !== 'Champion';

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {tournamentImage(t) && <img src={tournamentImage(t)} alt="" className="hidden h-20 w-20 rounded-[12px] object-cover sm:block" />}
          <div>
          <p className={`font-bold ${g.text}`}>{g.name} lobby</p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{t.title}</h1>
          <p className="text-muted">{formatWhen(t.startsAt)}</p>
        </div>
        </div>
        <p className="text-sm text-muted">
          {t.inLobby} in the lobby, {t.checkedInCount} checked in of {t.registeredCount} registered
        </p>
      </header>

      {inMatch ? (
        <section className="panel p-5 sm:p-8">
          <h2 className="mb-4 text-xl font-extrabold">Your match</h2>
          <OnlineMatch key={roomId} roomId={roomId} onExit={() => setRoomId(null)} exitLabel="Back to bracket" />
        </section>
      ) : (
        <section className="panel p-6 sm:p-8" aria-live="polite">
          {t.status === 'upcoming' && (
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-extrabold">
                  {t.me.checkedIn ? 'You’re checked in.' : checkinOpen ? 'Checking you in…' : 'Check-in hasn’t opened yet.'}
                </h2>
                <p className="mt-1 max-w-md text-muted">
                  {t.me.checkedIn
                    ? 'Keep this page open. Your first match appears here when the bracket is drawn.'
                    : `Stay on this page — you’ll be checked in automatically at ${formatWhen(t.checkinOpensAt)}.`}
                </p>
              </div>
              <div>
                <p className="mb-1 text-sm text-muted">Bracket drawn in</p>
                <Countdown to={t.startsAt} offset={offset} />
              </div>
            </div>
          )}
          {t.status === 'live' && (
            <>
              <h2 className="text-2xl font-extrabold">
                {!t.me.checkedIn
                  ? 'Check-in closed before you arrived.'
                  : eliminated
                    ? `You’re out — ${placement.toLowerCase()}.`
                    : 'Waiting for your next match…'}
              </h2>
              <p className="mt-1 text-muted">
                {eliminated || !t.me.checkedIn
                  ? 'You can keep watching the bracket here.'
                  : 'The next round starts when every match in this round is done.'}
              </p>
            </>
          )}
          {t.status === 'completed' && (
            <>
              <h2 className="text-2xl font-extrabold">
                {placement === 'Champion' ? '🏆 You won the tournament!' : t.winnerName ? `${t.winnerName} won the tournament.` : 'The tournament is over.'}
              </h2>
              {placement && placement !== 'Champion' && <p className="mt-1 text-muted">Your finish: {placement}</p>}
            </>
          )}
          {['cancelled', 'deleted'].includes(t.status) && (
            <>
              <h2 className="text-2xl font-extrabold">This tournament was called off. Your entry fee will be refunded.</h2>
              <p className="mt-1 text-muted">{t.note}</p>
            </>
          )}
        </section>
      )}

      {t.rounds?.length > 0 && (
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Bracket</h2>
          <Bracket rounds={t.rounds} me={user.username} status={t.status} />
        </section>
      )}
    </div>
  );
}
