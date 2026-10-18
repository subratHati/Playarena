import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { GAMES } from '../lib/games';
import { Board, isMyTurn } from './Boards';
import Countdown from './Countdown';
import ResultOverlay, { useLoseShake } from './ResultOverlay';
import { useShownOutcome } from './LocalGame';

const REASON = {
  played: '',
  draw: '',
  forfeit: 'by forfeit',
  walkover: 'by walkover — opponent didn’t show up',
  'double no-show': '',
  timeouts: 'on time — too many missed picks',
  'double timeout': '',
  'not ready': '— opponent didn’t press Ready',
  cancelled: '',
};

// A live server-run match. Used for friendly online games and tournament matches.
export default function OnlineMatch({ roomId, onExit, exitLabel = 'Back' }) {
  const { socket, connected } = useAuth();
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);
  const [fire, setFire] = useState({ key: 0, outcome: null });
  // Count each time a match ends, so later updates (rematch requests etc.) don't replay the celebration.
  const [overCount, setOverCount] = useState(0);
  const prevStatus = useRef(null);
  useEffect(() => {
    if (m?.status === 'over' && prevStatus.current && prevStatus.current !== 'over') setOverCount((n) => n + 1);
    if (m?.status === 'over' && prevStatus.current === null) setOverCount((n) => n + 1);
    prevStatus.current = m?.status ?? prevStatus.current;
  }, [m?.status]);
  const finished = useMemo(() => (m?.status === 'over' ? m.result : null), [overCount, m?.status === 'over']); // eslint-disable-line react-hooks/exhaustive-deps
  const shownResult = useShownOutcome(finished, m?.gameId);
  useEffect(() => {
    if (!shownResult || shownResult.reason === 'cancelled' || shownResult.reason === 'double no-show') return;
    const outcome = shownResult.winnerIndex === null ? 'draw' : shownResult.winnerIndex === m?.you ? 'win' : 'lose';
    setFire((f) => ({ key: f.key + 1, outcome }));
  }, [shownResult]); // eslint-disable-line react-hooks/exhaustive-deps
  const shake = useLoseShake(fire.outcome === 'lose' ? fire.key : 0);

  useEffect(() => {
    if (!socket) return undefined;
    const onState = (s) => {
      if (s.roomId !== roomId) return;
      setM(s);
      setError('');
    };
    const onError = (e) => {
      if (e.gone) setGone(true);
      setError(e.message);
    };
    const onSuperseded = (d) => d.roomId === roomId && setError('This match is open in another tab.');
    const attach = () => socket.emit('match:attach', { roomId });
    socket.on('match:state', onState);
    socket.on('match:error', onError);
    socket.on('match:superseded', onSuperseded);
    socket.on('connect', attach);
    if (socket.connected) attach();
    return () => {
      socket.off('match:state', onState);
      socket.off('match:error', onError);
      socket.off('match:superseded', onSuperseded);
      socket.off('connect', attach);
    };
  }, [socket, roomId]);

  if (gone && !m) {
    return (
      <div className="panel p-8 text-center">
        <p className="mb-4 font-bold">This match has ended or no longer exists.</p>
        <button type="button" className="btn-primary" onClick={() => onExit(m?.gameId)}>
          {exitLabel}
        </button>
      </div>
    );
  }
  if (!m) return <p className="py-16 text-center text-muted">Connecting to the match…</p>;

  const game = GAMES[m.gameId];
  const me = m.you;
  const opp = 1 - me;
  const names = m.players.map((p, i) => (i === me ? `${p.username} (you)` : p.username));
  const over = m.status === 'over' && Boolean(shownResult);
  const canMove = m.status === 'playing' && connected && isMyTurn(m.gameId, m.view, me);
  const iWon = over && m.result?.winnerIndex === me;
  const iLost = over && m.result?.winnerIndex === opp;
  const rematchMine = m.rematchRequested.includes(me);
  const rematchTheirs = m.rematchRequested.includes(opp);

  let status;
  if (m.status === 'waiting') status = `Waiting for ${m.players[opp].username} to join…`;
  else if (over) {
    if (m.result.reason === 'cancelled') status = 'Match cancelled.';
    else if (m.result.reason === 'double no-show') status = 'Neither player showed up.';
    else if (m.result.reason === 'double timeout') status = 'Both players missed too many picks.';
    else if (m.result.winnerIndex === null) status = "It's a draw.";
    else status = `${iWon ? 'You win' : `${m.players[opp].username} wins`} ${REASON[m.result.reason] || ''}`.trim() + (iWon ? '!' : '.');
  } else if (m.status === 'over') status = '…';
  else if (m.gameId === 'rock-paper-scissors') status = m.view.phase === 'ready' ? 'Press Ready to start.' : 'Pick fast!';
  else status = canMove ? 'Your move.' : `${m.players[opp].username} is thinking…`;

  const leave = () => {
    if (m.status === 'playing' && !window.confirm('Leaving now forfeits the match. Leave anyway?')) return;
    socket.emit('match:leave', { roomId });
    onExit(m.gameId);
  };

  return (
    <div>
      <ResultOverlay
        outcome={fire.outcome}
        fireKey={fire.key}
        subtitle={fire.outcome === 'win' ? `You beat ${m.players[opp].username}` : fire.outcome === 'lose' ? `${m.players[opp].username} won ${REASON[m.result?.reason] || ''}`.trim() : ''}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          {m.players.map((p, i) => (
            <span key={i} className={`flex items-center gap-1.5 ${i === me ? 'font-bold' : ''}`}>
              <span
                className={`h-2.5 w-2.5 rounded-full ${p.connected ? 'bg-win' : 'bg-line'}`}
                title={p.connected ? 'Connected' : 'Not connected'}
              />
              {i === me ? 'You' : p.username}
              {m.gameId === 'tic-tac-toe' && <b className={i === 0 ? 'text-ttt' : ''}>({i === 0 ? 'X' : 'O'})</b>}
              {m.gameId === 'connect-four' && <span className={`h-3 w-3 rounded-full ${i === 0 ? 'bg-c4' : 'bg-gold'}`} />}
              {i === 0 && <span className="text-muted">vs</span>}
            </span>
          ))}
        </div>
        {!connected && <span className="text-sm font-bold text-lose">Reconnecting…</span>}
      </div>

      <p
        className={`mb-1 font-display text-2xl font-extrabold ${over ? 'bounce-in' : ''} ${iWon ? 'text-win' : iLost ? 'text-lose' : ''}`}
        aria-live="polite"
      >
        {status}
      </p>
      <div className="mb-4 min-h-6 text-sm text-muted" aria-live="polite">
        {m.notice}
        {m.status === 'waiting' && m.noShowAt && (
          <>
            {' '}
            If they don’t join in <Countdown to={m.noShowAt} compact />, you win by walkover.
          </>
        )}
        {m.kind === 'tournament' && m.gameId === 'tic-tac-toe' && m.view.game > 1 && !over && ` Replay game ${m.view.game}.`}
      </div>

      <div className={`${m.status === 'waiting' ? 'pointer-events-none opacity-50' : ''} ${shake}`}>
        <Board gameId={m.gameId} view={m.view} you={me} canMove={canMove} onMove={(move) => socket.emit('match:move', { roomId, move })} names={names} />
      </div>

      {error && <p className="mt-4 text-center text-sm font-bold text-lose">{error}</p>}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {over && m.kind === 'friendly' && (
          <button
            type="button"
            className="btn-primary"
            disabled={rematchMine || !m.players[opp].connected}
            onClick={() => socket.emit('match:rematch', { roomId })}
          >
            {rematchMine ? `Waiting for ${m.players[opp].username}…` : rematchTheirs ? 'Accept rematch' : 'Ask for a rematch'}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={over ? () => onExit(m.gameId) : leave}>
          {over ? exitLabel : m.kind === 'tournament' ? 'Forfeit match' : 'Leave match'}
        </button>
      </div>
      {over && m.kind === 'friendly' && !m.players[opp].connected && (
        <p className="mt-2 text-center text-sm text-muted">{m.players[opp].username} left the match.</p>
      )}
      <p className="mx-auto mt-6 max-w-md text-center text-sm text-muted">{game.rules}</p>
    </div>
  );
}
