import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFeatures } from '../lib/features';
import { GAMES } from '../lib/games';
import GameArt from '../components/GameArt';
import LocalGame from '../components/LocalGame';
import { Mivo } from '../components/Brand';

const HEADER_BG = { 'tic-tac-toe': 'bg-ttt', 'rock-paper-scissors': 'bg-sps', 'connect-four': 'bg-c4' };

export default function Play() {
  const { gameId } = useParams();
  const game = GAMES[gameId];
  const { user, socket, connected } = useAuth();
  const { matchmaking } = useFeatures();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | 'computer'
  const [waiting, setWaiting] = useState(null); // null | 'queue' | {code}
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(null);
    setWaiting(null);
    setError('');
  }, [gameId]);

  useEffect(() => {
    if (!socket) return undefined;
    const onFound = ({ roomId }) => navigate(`/match/${roomId}`);
    const onWaiting = () => setWaiting('queue');
    const onInvite = ({ code }) => setWaiting({ code });
    const onError = (e) => {
      setWaiting(null);
      setError(e.message);
      if (e.roomId) navigate(`/match/${e.roomId}`);
    };
    socket.on('match:found', onFound);
    socket.on('queue:waiting', onWaiting);
    socket.on('invite:created', onInvite);
    socket.on('match:error', onError);
    return () => {
      socket.off('match:found', onFound);
      socket.off('queue:waiting', onWaiting);
      socket.off('invite:created', onInvite);
      socket.off('match:error', onError);
      socket.emit('queue:leave');
    };
  }, [socket, navigate]);

  if (!game) {
    return (
      <div className="panel p-8 text-center">
        <p className="mb-4 font-bold">That game doesn’t exist.</p>
        <Link to="/" className="btn-primary">
          Back to games
        </Link>
      </div>
    );
  }

  const header = (
    <div className={`relative mb-8 flex items-center gap-4 overflow-hidden rounded-[24px] p-5 text-white sm:p-6 ${HEADER_BG[gameId]}`}>
      <GameArt gameId={gameId} className="sticker h-20 w-20 shrink-0 rounded-[18px] border-[3px] border-ink sm:h-24 sm:w-24" />
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{game.name}</h1>
        <p className="text-lg opacity-90">{game.tagline}</p>
      </div>
      <svg viewBox="0 0 120 120" className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 opacity-15" aria-hidden>
        <circle cx="60" cy="60" r="44" stroke="#fff" strokeWidth="16" fill="none" />
      </svg>
    </div>
  );

  if (mode === 'computer') {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <LocalGame gameId={gameId} onExit={() => setMode(null)} playerName={user?.username || 'You'} />
      </div>
    );
  }

  const cancelWaiting = () => {
    socket?.emit('queue:leave');
    setWaiting(null);
  };

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <p className="mb-8 max-w-2xl text-lg">{game.rules}</p>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="flex flex-col rounded-[24px] border-[3px] border-ink bg-card p-6 shadow-[0_6px_0_var(--color-ink)]">
          <div className="flex items-start gap-4">
            <Mivo className="h-16 w-16 shrink-0" mood="wink" />
            <div>
              <h2 className="text-2xl font-extrabold">Play Mivo</h2>
              <p className="mt-1 text-muted">Our friendly computer player. Starts right away, no account needed.</p>
            </div>
          </div>
          <button type="button" className="btn-primary mt-6 py-3 text-lg" onClick={() => setMode('computer')}>
            Start game
          </button>
        </section>

        <section className="flex flex-col rounded-[24px] border-[3px] border-ink bg-card p-6 shadow-[0_6px_0_var(--color-ink)]">
          <h2 className="text-2xl font-extrabold">Play a friend online</h2>
          <p className="mt-1 mb-5 text-muted">Create a code, send it to a friend, and play live from two phones or laptops.</p>

          {!user ? (
            <div className="mt-auto">
              <p className="mb-3 text-sm">Log in to play other people.</p>
              <div className="flex gap-2">
                <Link to={`/login?next=/play/${gameId}`} className="btn-primary flex-1">
                  Log in
                </Link>
                <Link to={`/register?next=/play/${gameId}`} className="btn-ghost flex-1">
                  Sign up
                </Link>
              </div>
            </div>
          ) : waiting === 'queue' ? (
            <div className="mt-auto text-center" aria-live="polite">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-line border-t-court motion-reduce:animate-none" />
              <p className="font-bold">Looking for an opponent…</p>
              <p className="mb-4 text-sm text-muted">No one around? Mivo is always ready.</p>
              <button type="button" className="btn-ghost" onClick={cancelWaiting}>
                Stop looking
              </button>
            </div>
          ) : waiting?.code ? (
            <div className="mt-auto text-center" aria-live="polite">
              <p className="text-sm text-muted">Send this code to your friend</p>
              <p className="my-2 font-display text-5xl font-extrabold tracking-[0.2em]">{waiting.code}</p>
              <p className="mb-4 text-sm text-muted">The game starts when they enter it. Keep this page open.</p>
              <button type="button" className="btn-ghost" onClick={cancelWaiting}>
                Cancel invite
              </button>
            </div>
          ) : (
            <div className="mt-auto space-y-3">
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!connected}
                onClick={() => {
                  setError('');
                  socket.emit('invite:create', { gameId });
                }}
              >
                Create an invite code
              </button>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError('');
                  socket.emit('invite:join', { code: joinCode });
                }}
              >
                <label htmlFor="code" className="sr-only">
                  Friend’s invite code
                </label>
                <input
                  id="code"
                  className="field uppercase placeholder:normal-case"
                  placeholder="Got a code? Enter it"
                  value={joinCode}
                  maxLength={5}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button type="submit" className="btn-ghost shrink-0" disabled={joinCode.length !== 5 || !connected}>
                  Join
                </button>
              </form>
              {matchmaking ? (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  disabled={!connected}
                  onClick={() => {
                    setError('');
                    socket.emit('queue:join', { gameId });
                  }}
                >
                  Find a random opponent
                </button>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-line px-3 py-2.5 text-muted">
                  <span>Find a random opponent</span>
                  <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-ink">Coming soon</span>
                </div>
              )}
              {!connected && <p className="text-sm text-muted">Connecting to the game server…</p>}
            </div>
          )}
          {error && <p className="mt-3 text-sm font-bold text-lose">{error}</p>}
        </section>
      </div>
    </div>
  );
}
