import { useEffect, useRef, useState } from 'react';
import { engines, GAMES } from '../lib/games';
import { computerMove } from '../lib/ai';
import { Board, isMyTurn } from './Boards';

const DIFFICULTY_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// You (player 0) vs the computer (player 1), entirely in the browser.
export default function LocalGame({ gameId, difficulty, onExit, playerName = 'You' }) {
  const engine = engines[gameId];
  const game = GAMES[gameId];
  const [starter, setStarter] = useState(0);
  const [state, setState] = useState(() => engine.createState({ starter: 0 }));
  const [tally, setTally] = useState({ you: 0, cpu: 0, draw: 0 });
  const thinking = useRef(false);
  const [busy, setBusy] = useState(false);

  const outcome = engine.result(state);
  const view = engine.view(state, 0);
  const names = [playerName, `Computer (${DIFFICULTY_NAME[difficulty]})`];

  // Computer's turn.
  useEffect(() => {
    if (outcome || thinking.current) return;
    const cpuNeedsToAct =
      gameId === 'rock-paper-scissors' ? Boolean(state.picks[0]) && !state.picks[1] : state.turn === 1;
    if (!cpuNeedsToAct) return;
    thinking.current = true;
    setBusy(true);
    const t = setTimeout(() => {
      setState((s) => {
        const move = computerMove(gameId, engine.view(s, 1), difficulty);
        return engine.applyMove(s, 1, move).state || s;
      });
      thinking.current = false;
      setBusy(false);
    }, gameId === 'rock-paper-scissors' ? 600 : 450);
    return () => {
      clearTimeout(t);
      thinking.current = false;
    };
  }, [state, outcome, gameId, engine, difficulty]);

  // Count finished games once.
  const counted = useRef(null);
  useEffect(() => {
    if (!outcome || counted.current === state) return;
    counted.current = state;
    setTally((t) =>
      outcome.winner === null ? { ...t, draw: t.draw + 1 } : outcome.winner === 0 ? { ...t, you: t.you + 1 } : { ...t, cpu: t.cpu + 1 }
    );
  }, [outcome, state]);

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
  if (outcome) status = outcome.winner === null ? "It's a draw." : outcome.winner === 0 ? 'You win!' : 'The computer wins.';
  else if (gameId === 'rock-paper-scissors') status = busy ? 'Computer is picking…' : 'Make your pick.';
  else status = canMove ? 'Your move.' : 'Computer is thinking…';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {names[0]} vs {names[1]}
          </p>
          <p className={`font-display text-2xl font-bold ${outcome ? (outcome.winner === 0 ? 'text-win' : outcome.winner === 1 ? 'text-lose' : '') : ''}`} aria-live="polite">
            {status}
          </p>
        </div>
        <dl className="flex gap-4 text-center text-sm">
          <div>
            <dt className="text-muted">You</dt>
            <dd className="font-display text-xl font-bold">{tally.you}</dd>
          </div>
          <div>
            <dt className="text-muted">Draws</dt>
            <dd className="font-display text-xl font-bold">{tally.draw}</dd>
          </div>
          <div>
            <dt className="text-muted">Computer</dt>
            <dd className="font-display text-xl font-bold">{tally.cpu}</dd>
          </div>
        </dl>
      </div>

      {gameId !== 'rock-paper-scissors' && (
        <p className="mb-3 text-sm text-muted">
          You are{' '}
          {gameId === 'tic-tac-toe' ? (
            <b className="text-ttt">X</b>
          ) : (
            <b className="text-c4">red</b>
          )}
          . {starter === 0 ? 'You start this game.' : 'The computer starts this game.'}
        </p>
      )}

      <Board gameId={gameId} view={view} you={0} canMove={canMove} onMove={move} names={names} />

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {outcome && (
          <button type="button" className="btn-primary" onClick={again}>
            Play again
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onExit}>
          Change mode
        </button>
      </div>
      <p className="mx-auto mt-6 max-w-md text-center text-sm text-muted">{game.rules}</p>
    </div>
  );
}
