import { useEffect, useRef, useState } from 'react';

// ---------- Tic Tac Toe ----------
function XMark() {
  return (
    <svg viewBox="0 0 100 100" className="h-[62%] w-[62%]" aria-hidden>
      <path d="M18 18 L82 82" pathLength="100" className="draw" stroke="var(--color-ttt)" strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M82 18 L18 82" pathLength="100" className="draw draw-2" stroke="var(--color-ttt)" strokeWidth="16" strokeLinecap="round" fill="none" />
    </svg>
  );
}
function OMark() {
  return (
    <svg viewBox="0 0 100 100" className="h-[62%] w-[62%]" aria-hidden>
      <circle cx="50" cy="50" r="33" pathLength="100" className="draw" stroke="var(--color-ink)" strokeWidth="15" fill="none" strokeLinecap="round" transform="rotate(-90 50 50)" />
    </svg>
  );
}

const cellCenter = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];

export function TicTacToeBoard({ view, you, canMove, onMove }) {
  const myMark = you === 0 ? 'X' : 'O';
  const line = view.line;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px] rounded-[22px] bg-ink p-2 shadow-[0_8px_0_rgb(23_32_51/0.18)]">
      <div className="grid h-full grid-cols-3 gap-2">
        {view.board.map((cell, i) => {
          const playable = canMove && !cell;
          return (
            <button
              key={`${view.game}-${i}`}
              type="button"
              disabled={!playable}
              onClick={() => onMove({ cell: i })}
              aria-label={cell ? `Cell ${i + 1}: ${cell}` : `Place ${myMark} in cell ${i + 1}`}
              className={`group flex items-center justify-center rounded-2xl transition-colors ${
                line?.includes(i) ? 'bg-gold' : 'bg-chalk'
              } ${playable ? 'cursor-pointer hover:bg-white' : 'cursor-default'}`}
            >
              {cell === 'X' && <XMark />}
              {cell === 'O' && <OMark />}
              {!cell && playable && (
                <span className="font-display text-5xl font-extrabold text-ink/0 transition-colors group-hover:text-ink/15">{myMark}</span>
              )}
            </button>
          );
        })}
      </div>
      {line && (
        <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-2" aria-hidden>
          <line
            x1={cellCenter(line[0])[0]}
            y1={cellCenter(line[0])[1]}
            x2={cellCenter(line[2])[0]}
            y2={cellCenter(line[2])[1]}
            pathLength="100"
            className="draw draw-line"
            stroke="var(--color-c4)"
            strokeWidth="12"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

// ---------- Connect Four ----------
const COLS = 7;
export function ConnectFourBoard({ view, you, canMove, onMove }) {
  const [hover, setHover] = useState(null);
  const colFull = (c) => view.board[c] !== null;
  const discColor = (p) => (p === 0 ? 'bg-c4' : 'bg-gold');

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="mb-1 grid grid-cols-7 gap-1.5 px-2.5" aria-hidden>
        {Array.from({ length: COLS }, (_, c) => (
          <div key={c} className="flex h-8 items-end justify-center">
            {canMove && hover === c && !colFull(c) && <div className={`disc h-6 w-6 rounded-full ${discColor(you)}`} />}
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-1.5 overflow-hidden rounded-[22px] border-[3px] border-ink bg-court p-2 shadow-[0_8px_0_rgb(23_32_51/0.18)]"
        onMouseLeave={() => setHover(null)}
      >
        {view.board.map((cell, i) => {
          const c = i % COLS;
          const inLine = view.line?.includes(i);
          return (
            <button
              key={`${view.game}-${i}`}
              type="button"
              disabled={!canMove || colFull(c)}
              onMouseEnter={() => setHover(c)}
              onFocus={() => setHover(c)}
              onClick={() => onMove({ col: c })}
              aria-label={`Drop in column ${c + 1}`}
              className={`aspect-square rounded-full bg-[#1f2a8f] shadow-[inset_0_3px_0_rgb(0_0_0/0.35)] disabled:cursor-default ${
                hover === c && canMove && !colFull(c) ? 'bg-[#2a37b0]' : ''
              }`}
            >
              {cell !== null && (
                <span
                  className={`disc block h-full w-full rounded-full ${discColor(cell)} ${view.last === i ? 'disc-drop' : ''} ${
                    inLine ? 'bounce-in outline-4 outline-white outline-solid -outline-offset-4' : ''
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Stone Paper Scissors ----------
export const RPS_ICON = { rock: '✊', paper: '✋', scissors: '✌️' };
export const RPS_NAME = { rock: 'Stone', paper: 'Paper', scissors: 'Scissors' };

// Shows "Stone… Paper… Scissors!" with shaking fists for a moment before each reveal.
function useReveal(roundCount) {
  const prev = useRef(roundCount);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => {
    if (roundCount > prev.current) {
      setRevealing(true);
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const t = setTimeout(() => setRevealing(false), reduce ? 0 : 950);
      prev.current = roundCount;
      return () => clearTimeout(t);
    }
    prev.current = roundCount;
    return undefined;
  }, [roundCount]);
  return revealing;
}

export function RpsBoard({ view, you, canMove, onMove, names }) {
  const opp = 1 - you;
  const revealing = useReveal(view.rounds.length);
  const last = view.rounds.at(-1);
  // Hold the score back until the reveal finishes.
  const score = [...view.score];
  if (revealing && last && last.winner !== null) score[last.winner] -= 1;

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-[22px] bg-sps/12 px-4 py-3 font-display">
        <div className="text-center">
          <div className="text-5xl font-extrabold tabular-nums">{score[you]}</div>
          <div className="truncate text-sm text-muted">{names[you]}</div>
        </div>
        <div className="text-center text-sm text-muted">
          first
          <br />
          to {view.target}
        </div>
        <div className="text-center">
          <div className="text-5xl font-extrabold tabular-nums">{score[opp]}</div>
          <div className="truncate text-sm text-muted">{names[opp]}</div>
        </div>
      </div>

      <div className="mb-5 flex min-h-28 items-center justify-center gap-5 rounded-[22px] border-2 border-dashed border-sps/40 p-4" aria-live="polite">
        {revealing ? (
          <>
            <span className="shake-fist text-6xl">✊</span>
            <span className="font-display text-lg font-extrabold">Stone… Paper… Scissors!</span>
            <span className="shake-fist text-6xl"><span className="inline-block -scale-x-100">✊</span></span>
          </>
        ) : last ? (
          <>
            <span className="bounce-in text-6xl" title={RPS_NAME[last.picks[you]]}>
              {RPS_ICON[last.picks[you]]}
            </span>
            <span className="bounce-in text-center font-display text-lg font-extrabold">
              {last.winner === null ? 'Tie!' : last.winner === you ? 'Your round!' : `${names[opp]}’s round`}
            </span>
            <span className="bounce-in text-6xl" title={RPS_NAME[last.picks[opp]]}>
              <span className="inline-block -scale-x-100">{RPS_ICON[last.picks[opp]]}</span>
            </span>
          </>
        ) : (
          <span className="text-center text-muted">Pick a hand below. First to {view.target} rounds wins.</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {Object.keys(RPS_ICON).map((c) => (
          <button
            key={c}
            type="button"
            disabled={!canMove || Boolean(view.myPick) || revealing}
            onClick={() => onMove({ choice: c })}
            className={`flex flex-col items-center gap-1 rounded-[20px] border-[3px] bg-card py-5 font-bold shadow-[0_5px_0_rgb(23_32_51/0.12)] transition-transform enabled:hover:-translate-y-1 enabled:hover:border-sps enabled:active:translate-y-0 disabled:cursor-default ${
              view.myPick === c ? 'border-sps bg-sps/10' : 'border-ink/80'
            } ${view.myPick && view.myPick !== c ? 'opacity-40' : ''}`}
          >
            <span className="text-5xl">{RPS_ICON[c]}</span>
            {RPS_NAME[c]}
          </button>
        ))}
      </div>
      <p className="mt-4 min-h-6 text-center text-sm text-muted" aria-live="polite">
        {view.myPick && !view.opponentPicked && !revealing
          ? `You picked ${RPS_NAME[view.myPick]}. Waiting for ${names[opp]}…`
          : !view.myPick && view.opponentPicked
            ? `${names[opp]} has picked. Your turn.`
            : ''}
      </p>
    </div>
  );
}

export function Board({ gameId, ...props }) {
  if (gameId === 'tic-tac-toe') return <TicTacToeBoard {...props} />;
  if (gameId === 'connect-four') return <ConnectFourBoard {...props} />;
  return <RpsBoard {...props} />;
}

// Is it this player's turn to act?
export function isMyTurn(gameId, view, you) {
  if (gameId === 'rock-paper-scissors') return !view.myPick;
  return view.turn === you;
}
