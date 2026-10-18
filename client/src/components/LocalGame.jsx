import { useEffect, useRef, useState } from 'react';
import { engines, GAMES } from '../lib/games';
import { computerMove } from '../lib/ai';
import { Board, isMyTurn } from './Boards';
import { Mivo } from './Brand';
import ResultOverlay, { useLoseShake } from './ResultOverlay';

// The computer always plays on easy. Change this one value to make it harder ('medium' or 'hard').
const DIFFICULTY = 'easy';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Delay showing a finished result so the last Stone Paper Scissors round is visible first.
export function useShownOutcome(outcome, gameId) {
  const [shown, setShown] = useState(outcome);
  useEffect(() => {
    if (!outcome || gameId !== 'rock-paper-scissors' || reduceMotion()) {
      setShown(outcome);
      return undefined;
    }
    const t = setTimeout(() => setShown(outcome), 1000);
    return () => clearTimeout(t);
  }, [outcome, gameId]);
  return shown;
}

const REASON_TEXT = {
  timeouts: 'Too many missed picks',
  'not ready': 'Didn’t press Ready in time',
};

// You (player 0) vs Mivo the computer (player 1), entirely in the browser.
export default function LocalGame({ gameId, onExit, playerName = 'You' }) {
  const engine = engines[gameId];
  const game = GAMES[gameId];
  const timed = Boolean(engine.timed);
  const [starter, setStarter] = useState(0);
  const [state, setState] = useState(() => engine.createState({ starter: 0 }));
  const [tally, setTally] = useState({ you: 0, cpu: 0, draw: 0 });
  const [busy, setBusy] = useState(false);
  const [fire, setFire] = useState({ key: 0, outcome: null });
  const [, forceRender] = useState(0);
  const thinking = useRef(false);

  const outcome = engine.result(state);
  const shown = useShownOutcome(outcome, gameId);
  const view = engine.view(state, 0, { now: Date.now() });
  const names = [playerName, 'Mivo'];
  const shake = useLoseShake(fire.outcome === 'lose' ? fire.key : 0);

  // ----- Timed games (Stone Paper Scissors): run the clock, Mivo gets ready and picks -----
  useEffect(() => {
    if (!timed || outcome) return undefined;
    const at = engine.nextEventAt(state);
    if (!at) return undefined;
    const t = setTimeout(() => setState((s) => engine.tick(s, { now: Date.now() })), Math.max(0, at - Date.now()) + 5);
    return () => clearTimeout(t);
  }, [timed, state, outcome, engine]);

  useEffect(() => {
    if (!timed || outcome) return undefined;
    if (state.phase === 'ready' && !state.ready[1]) {
      const t = setTimeout(() => setState((s) => engine.applyMove(s, 1, { ready: true }, { now: Date.now() }).state || s), 400);
      return () => clearTimeout(t);
    }
    if (state.phase === 'picking' && !state.picks[1]) {
      const room = Math.max(300, Math.min(1800, (state.windowMs || 3000) - 900));
      const t = setTimeout(() => {
        setState((s) => {
          if (s.phase !== 'picking' || s.picks[1]) return s;
          const move = computerMove(gameId, engine.view(s, 1, { now: Date.now() }), DIFFICULTY);
          return engine.applyMove(s, 1, move, { now: Date.now() }).state || s;
        });
      }, 350 + Math.random() * room);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [timed, state.phase, state.picks?.[1], state.ready?.[1], state.rounds?.length, outcome, engine, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render a few times a second so the countdown text stays fresh.
  useEffect(() => {
    if (!timed || outcome) return undefined;
    const t = setInterval(() => forceRender((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [timed, outcome]);

  // ----- Turn-based games: Mivo's move -----
  useEffect(() => {
    if (timed || outcome || thinking.current || state.turn !== 1) return undefined;
    thinking.current = true;
    setBusy(true);
    const t = setTimeout(() => {
      setState((s) => {
        const move = computerMove(gameId, engine.view(s, 1), DIFFICULTY);
        return engine.applyMove(s, 1, move).state || s;
      });
      thinking.current = false;
      setBusy(false);
    }, 550);
    return () => {
      clearTimeout(t);
      thinking.current = false;
    };
  }, [timed, state, outcome, gameId, engine]);

  // Count each finished game once, and celebrate (or commiserate).
  const counted = useRef(null);
  useEffect(() => {
    if (!shown || counted.current === shown) return;
    counted.current = shown;
    const result = shown.winner === null ? 'draw' : shown.winner === 0 ? 'win' : 'lose';
    setFire((f) => ({ key: f.key + 1, outcome: result }));
    setTally((t) =>
      shown.winner === null ? { ...t, draw: t.draw + 1 } : shown.winner === 0 ? { ...t, you: t.you + 1 } : { ...t, cpu: t.cpu + 1 }
    );
  }, [shown]);

  const move = (m) => {
    if (outcome || busy) return;
    const res = engine.applyMove(state, 0, m, { now: Date.now() });
    if (res.state) setState(res.state);
  };

  const again = () => {
    const next = 1 - starter;
    setStarter(next);
    setState(engine.createState({ starter: next }));
  };

  const canMove = !outcome && !busy && isMyTurn(gameId, view, 0);
  let status;
  let mood = 'happy';
  if (shown) {
    if (shown.winner === null) status = 'It’s a draw!';
    else if (shown.winner === 0) {
      status = 'You win!';
      mood = 'wink';
    } else {
      status = 'Mivo wins this one.';
      mood = 'sad';
    }
  } else if (outcome) status = '…';
  else if (timed) status = state.phase === 'ready' ? 'Press Ready to start.' : 'Pick fast!';
  else status = canMove ? 'Your move.' : 'Mivo is thinking…';

  const reasonText = shown?.reason && REASON_TEXT[shown.reason];

  return (
    <div>
      <ResultOverlay
        outcome={fire.outcome}
        fireKey={fire.key}
        subtitle={reasonText && fire.outcome === 'lose' ? reasonText : fire.outcome === 'lose' ? 'Mivo got you this time' : fire.outcome === 'win' ? 'Mivo is impressed' : ''}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mivo className={`h-14 w-14 shrink-0 ${shown ? 'bounce-in' : ''}`} mood={mood} key={shown ? 'done' : 'play'} />
          <div>
            <p className="text-sm text-muted">You vs Mivo</p>
            <p
              className={`font-display text-2xl font-extrabold ${shown ? 'bounce-in' : ''} ${
                shown?.winner === 0 ? 'text-win' : shown?.winner === 1 ? 'text-lose' : ''
              }`}
              aria-live="polite"
            >
              {status}
            </p>
            {reasonText && <p className="text-sm font-bold text-lose">{reasonText}</p>}
          </div>
        </div>
        <dl className="flex gap-2 text-center text-sm">
          {[
            ['You', tally.you],
            ['Draws', tally.draw],
            ['Mivo', tally.cpu],
          ].map(([k, v]) => (
            <div key={k} className="min-w-16 rounded-xl bg-card px-3 py-1.5 shadow-[0_3px_0_rgb(23_32_51/0.08)]">
              <dt className="text-muted">{k}</dt>
              <dd className="font-display text-xl font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {gameId !== 'rock-paper-scissors' && (
        <p className="mb-3 text-sm text-muted">
          You are {gameId === 'tic-tac-toe' ? <b className="text-ttt">X</b> : <b className="text-c4">red</b>}.{' '}
          {starter === 0 ? 'You go first.' : 'Mivo goes first this time.'}
        </p>
      )}

      <div className={shake}>
        <Board gameId={gameId} view={view} you={0} canMove={canMove} onMove={move} names={names} />
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {shown && (
          <button type="button" className="btn-primary bounce-in px-6 py-3 text-lg" onClick={again}>
            Play again
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onExit}>
          Back
        </button>
      </div>
      <p className="mx-auto mt-6 max-w-md text-center text-sm text-muted">{game.rules}</p>
    </div>
  );
}
