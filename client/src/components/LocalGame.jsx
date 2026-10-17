import { useEffect, useRef, useState } from 'react';
import { engines, GAMES } from '../lib/games';
import { computerMove } from '../lib/ai';
import { Board, isMyTurn } from './Boards';
import { Mivo } from './Brand';
import Confetti from './Confetti';

// The computer always plays on easy. Change this one value to make it harder ('medium' or 'hard').
const DIFFICULTY = 'easy';
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Delay showing a finished result so Stone Paper Scissors can finish its reveal animation.
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

// You (player 0) vs Mivo the computer (player 1), entirely in the browser.
export default function LocalGame({ gameId, onExit, playerName = 'You' }) {
  const engine = engines[gameId];
  const game = GAMES[gameId];
  const [starter, setStarter] = useState(0);
  const [state, setState] = useState(() => engine.createState({ starter: 0 }));
  const [tally, setTally] = useState({ you: 0, cpu: 0, draw: 0 });
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const thinking = useRef(false);

  const outcome = engine.result(state);
  const shown = useShownOutcome(outcome, gameId);
  const view = engine.view(state, 0);
  const names = [playerName, 'Mivo'];

  // Mivo's turn.
  useEffect(() => {
    if (outcome || thinking.current) return undefined;
    const cpuNeedsToAct = gameId === 'rock-paper-scissors' ? Boolean(state.picks[0]) && !state.picks[1] : state.turn === 1;
    if (!cpuNeedsToAct) return undefined;
    thinking.current = true;
    setBusy(true);
    const t = setTimeout(
      () => {
        setState((s) => {
          const move = computerMove(gameId, engine.view(s, 1), DIFFICULTY);
          return engine.applyMove(s, 1, move).state || s;
        });
        thinking.current = false;
        setBusy(false);
      },
      gameId === 'rock-paper-scissors' ? 350 : 550
    );
    return () => {
      clearTimeout(t);
      thinking.current = false;
    };
  }, [state, outcome, gameId, engine]);

  // Count each finished game once, and celebrate wins.
  const counted = useRef(null);
   useEffect(() => {
    if (!shown || counted.current === shown) return;
    counted.current = shown;
    if (shown.winner === 0) setConfetti((n) => n + 1);
    setTally((t) =>
      shown.winner === null ? { ...t, draw: t.draw + 1 } : shown.winner === 0 ? { ...t, you: t.you + 1 } : { ...t, cpu: t.cpu + 1 }
    );
  }, [shown]);

  const move = (m) => {
    if (outcome || busy) return;
    const res = engine.applyMove(state, 0, m);
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
    } else status = 'Mivo wins this one.';
  } else if (outcome) status = '…';
  else if (gameId === 'rock-paper-scissors') status = 'Pick your hand.';
  else status = canMove ? 'Your move.' : 'Mivo is thinking…';

  return (
    <div>
      <Confetti fireKey={confetti} />
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

      <Board gameId={gameId} view={view} you={0} canMove={canMove} onMove={move} names={names} />

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
