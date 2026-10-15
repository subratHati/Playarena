import { useState } from 'react';

// ---------- Tic Tac Toe ----------
export function TicTacToeBoard({ view, you, canMove, onMove }) {
  const myMark = you === 0 ? 'X' : 'O';
  return (
    <div className="mx-auto grid aspect-square w-full max-w-[360px] grid-cols-3 gap-2 rounded-2xl bg-ink/90 p-2">
      {view.board.map((cell, i) => {
        const inLine = view.line?.includes(i);
        const playable = canMove && !cell;
        return (
          <button
            key={`${view.game}-${i}`}
            type="button"
            disabled={!playable}
            onClick={() => onMove({ cell: i })}
            aria-label={cell ? `Cell ${i + 1}: ${cell}` : `Place ${myMark} in cell ${i + 1}`}
            className={`group flex items-center justify-center rounded-xl font-display text-6xl font-extrabold transition-colors sm:text-7xl ${
              inLine ? 'bg-gold' : 'bg-chalk'
            } ${playable ? 'cursor-pointer hover:bg-white' : 'cursor-default'}`}
          >
            {cell ? (
              <span className={`mark-pop ${cell === 'X' ? 'text-ttt' : 'text-ink'}`}>{cell}</span>
            ) : (
              playable && <span className="text-ink/0 group-hover:text-ink/15">{myMark}</span>
            )}
          </button>
        );
      })}
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
      <div className="mb-1 grid grid-cols-7 gap-1.5 px-2" aria-hidden>
        {Array.from({ length: COLS }, (_, c) => (
          <div key={c} className="flex h-6 items-center justify-center">
            {canMove && hover === c && !colFull(c) && <div className={`h-4 w-4 rounded-full ${discColor(you)}`} />}
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-7 gap-1.5 overflow-hidden rounded-2xl bg-court p-2" onMouseLeave={() => setHover(null)}>
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
              className="aspect-square rounded-full bg-chalk/95 disabled:cursor-default"
            >
              {cell !== null && (
                <span
                  className={`block h-full w-full rounded-full ${discColor(cell)} ${view.last === i ? 'disc-drop' : ''} ${
                    inLine ? 'ring-4 ring-white ring-inset' : ''
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

export function RpsBoard({ view, you, canMove, onMove, names }) {
  const last = view.rounds.at(-1);
  const opp = 1 - you;
  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="mb-5 flex items-center justify-center gap-6 font-display">
        <div className="text-center">
          <div className="text-5xl font-extrabold">{view.score[you]}</div>
          <div className="text-sm text-muted">{names[you]}</div>
        </div>
        <div className="text-sm text-muted">first to {view.target}</div>
        <div className="text-center">
          <div className="text-5xl font-extrabold">{view.score[opp]}</div>
          <div className="text-sm text-muted">{names[opp]}</div>
        </div>
      </div>

      {last && (
        <div className="mb-5 flex items-center justify-center gap-4 rounded-2xl bg-sps/10 p-4" aria-live="polite">
          <span className="text-5xl" title={RPS_NAME[last.picks[you]]}>{RPS_ICON[last.picks[you]]}</span>
          <span className="font-bold">
            {last.winner === null ? 'Tie' : last.winner === you ? 'You take the round' : `${names[opp]} takes the round`}
          </span>
          <span className="text-5xl" title={RPS_NAME[last.picks[opp]]}>{RPS_ICON[last.picks[opp]]}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {Object.keys(RPS_ICON).map((c) => (
          <button
            key={c}
            type="button"
            disabled={!canMove || Boolean(view.myPick)}
            onClick={() => onMove({ choice: c })}
            className={`flex flex-col items-center gap-1 rounded-2xl border-2 bg-card py-5 font-bold transition-colors enabled:hover:border-sps disabled:cursor-default ${
              view.myPick === c ? 'border-sps bg-sps/10' : 'border-line'
            } ${view.myPick && view.myPick !== c ? 'opacity-40' : ''}`}
          >
            <span className="text-5xl">{RPS_ICON[c]}</span>
            {RPS_NAME[c]}
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-muted" aria-live="polite">
        {view.myPick
          ? view.opponentPicked
            ? 'Revealing…'
            : `You picked ${RPS_NAME[view.myPick]}. Waiting for ${names[opp]}…`
          : view.opponentPicked
            ? `${names[opp]} has picked. Your turn.`
            : '\u00a0'}
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
