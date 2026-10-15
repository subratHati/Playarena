import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GAMES } from '../lib/games';
import GameArt from '../components/GameArt';
import LocalGame from '../components/LocalGame';

const LEVELS = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
];

export default function Play() {
  const { gameId } = useParams();
  const game = GAMES[gameId];
  const { user, socket, connected } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(null); // null | 'computer'
  const [difficulty, setDifficulty] = useState('medium');
  const [waiting, setWaiting] = useState(null); // null | 'queue' | {code}
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

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
    <div className="mb-8 flex items-center gap-4">
      <GameArt gameId={gameId} className="h-16 w-16 shrink-0" />
      <div>
        <h1 className="text-3xl font-extrabold sm:text-4xl">{game.name}</h1>
        <p className="text-muted">{game.tagline}</p>
      </div>
    </div>
  );

  if (mode === 'computer') {
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <LocalGame key={difficulty} gameId={gameId} difficulty={difficulty} onExit={() => setMode(null)} playerName={user?.username || 'You'} />
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
      <p className="mb-8 max-w-2xl">{game.rules}</p>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel flex flex-col p-6">
          <h2 className="text-2xl font-extrabold">Play the computer</h2>
          <p className="mt-1 mb-5 text-muted">Starts right away. No account needed.</p>
          <fieldset className="mb-6">
            <legend className="label">Difficulty</legend>
            <div className="grid grid-cols-3 rounded-[10px] border border-line p-1">
              {LEVELS.map(([v, l]) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-lg py-2 text-center text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-court ${
                    difficulty === v ? 'bg-ink text-chalk' : 'hover:bg-chalk'
                  }`}
                >
                  <input type="radio" name="difficulty" value={v} checked={difficulty === v} onChange={() => setDifficulty(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn-primary mt-auto" onClick={() => setMode('computer')}>
            Start game
          </button>
        </section>

        <section className="panel flex flex-col p-6">
          <h2 className="text-2xl font-extrabold">Play online</h2>
          <p className="mt-1 mb-5 text-muted">Get matched with another player, or invite a friend with a code.</p>

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
              <p className="mb-4 text-sm text-muted">No one around? The computer is always ready.</p>
              <button type="button" className="btn-ghost" onClick={cancelWaiting}>
                Stop looking
              </button>
            </div>
          ) : waiting?.code ? (
            <div className="mt-auto text-center" aria-live="polite">
              <p className="text-sm text-muted">Share this code with your friend</p>
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
                  socket.emit('queue:join', { gameId });
                }}
              >
                Find an opponent
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                disabled={!connected}
                onClick={() => {
                  setError('');
                  socket.emit('invite:create', { gameId });
                }}
              >
                Invite a friend
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
                  className="field uppercase"
                  placeholder="Friend’s code"
                  value={joinCode}
                  maxLength={5}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                />
                <button type="submit" className="btn-ghost shrink-0" disabled={joinCode.length !== 5 || !connected}>
                  Join
                </button>
              </form>
              {!connected && <p className="text-sm text-muted">Connecting to the game server…</p>}
            </div>
          )}
          {error && <p className="mt-3 text-sm font-bold text-lose">{error}</p>}
        </section>
      </div>
    </div>
  );
}
