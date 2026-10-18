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

// ---------- Stone Paper Scissors (timed) ----------
export const RPS_ICON = { rock: '✊', paper: '✋', scissors: '✌️' };
export const RPS_NAME = { rock: 'Stone', paper: 'Paper', scissors: 'Scissors' };

// Counts down locally from the time the server (or local engine) said was left.
function useCountdown(remainingMs, resetKey) {
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setDeadline(remainingMs == null ? null : Date.now() + remainingMs);
  }, [remainingMs, resetKey]);
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : null;
}

function TimerRing({ leftMs, totalMs }) {
  const secs = Math.ceil(leftMs / 1000);
  const frac = totalMs ? Math.max(0, Math.min(1, leftMs / totalMs)) : 0;
  const urgent = leftMs <= 2000;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative h-24 w-24 ${urgent ? 'tick-pulse' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="var(--color-card)" stroke="var(--color-line)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={urgent ? 'var(--color-lose)' : 'var(--color-sps)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 100ms linear' }}
        />
      </svg>
      <span className={`absolute inset-0 grid place-items-center font-display text-4xl font-extrabold tabular-nums ${urgent ? 'text-lose' : ''}`}>
        {secs}
      </span>
    </div>
  );
}

function ScorePips({ score, target, color }) {
  return (
    <div className="flex justify-center gap-1" aria-label={`${score} of ${target}`}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={`h-3 w-3 rounded-full border-2 border-ink ${i < score ? color : 'bg-card'}`} />
      ))}
    </div>
  );
}

function Misses({ count, max }) {
  return (
    <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted" title={`${count} missed picks. ${max} allowed.`}>
      {Array.from({ length: max + 1 }, (_, i) => (
        <span key={i} className={i < count ? 'text-lose' : 'opacity-30'}>
          ⏱
        </span>
      ))}
    </div>
  );
}

export function RpsBoard({ view, you, canMove, onMove, names }) {
  const opp = 1 - you;
  const leftMs = useCountdown(view.remainingMs, `${view.phase}-${view.round}`);
  const last = view.rounds.at(-1);
  const lastKey = view.rounds.length;
  const result = last ? (last.winner === null ? 'tie' : last.winner === you ? 'win' : 'lose') : null;
  const showLast = last && (view.phase === 'reveal' || view.phase === 'over');

  return (
    <div className="mx-auto w-full max-w-[480px]">
      {/* Scoreboard */}
      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[22px] bg-sps/12 px-4 py-3">
        <div className="min-w-0 text-center">
          <div className="font-display text-5xl font-extrabold tabular-nums">{view.score[you]}</div>
          <div className="truncate text-sm font-bold">{names[you]}</div>
          <ScorePips score={view.score[you]} target={view.target} color="bg-win" />
          <Misses count={view.misses[you]} max={view.maxMisses} />
        </div>
        <div className="text-center text-xs text-muted">
          first
          <br />
          to {view.target}
        </div>
        <div className="min-w-0 text-center">
          <div className="font-display text-5xl font-extrabold tabular-nums">{view.score[opp]}</div>
          <div className="truncate text-sm font-bold">{names[opp]}</div>
          <ScorePips score={view.score[opp]} target={view.target} color="bg-lose" />
          <Misses count={view.misses[opp]} max={view.maxMisses} />
        </div>
      </div>

      {/* Stage */}
      {view.phase === 'ready' ? (
        <div className="rounded-[22px] border-[3px] border-ink bg-card p-5 text-center shadow-[0_6px_0_var(--color-ink)]">
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[you, opp].map((i) => (
              <div key={i} className={`rounded-2xl border-2 px-3 py-3 ${view.ready[i] ? 'border-win bg-win/10' : 'border-dashed border-line'}`}>
                <div className="truncate font-bold">{names[i]}</div>
                <div className={`text-sm font-bold ${view.ready[i] ? 'text-win' : 'text-muted'}`}>{view.ready[i] ? 'Ready ✓' : 'Not ready'}</div>
              </div>
            ))}
          </div>
          {view.ready[you] ? (
            <p className="font-bold">Waiting for {names[opp]} to get ready…</p>
          ) : (
            <button type="button" className="btn-primary px-8 py-3 text-xl" onClick={() => onMove({ ready: true })}>
              I’m ready
            </button>
          )}
          <p className="mt-4 text-sm text-muted">
            First pick: 10 seconds. After that: 3 seconds per round. Miss more than {view.maxMisses} picks and you lose the match.
          </p>
          {view.remainingMs != null && !view.ready[you] && (
            <p className="mt-2 text-sm font-bold text-lose">Press Ready within {Math.ceil((leftMs ?? 0) / 1000)}s or you lose this match.</p>
          )}
        </div>
      ) : (
        <>
          <div
            key={showLast ? `r${lastKey}` : `p${view.round}`}
            className={`relative mb-4 flex min-h-32 items-center justify-center gap-4 rounded-[22px] border-[3px] border-ink p-4 ${
              showLast ? `flash-${result} ${result === 'lose' ? 'lose-shake' : ''}` : 'bg-card'
            }`}
            aria-live="polite"
          >
            {showLast ? (
              <>
                <span className="bounce-in text-6xl" title={RPS_NAME[last.picks[you]]}>
                  {RPS_ICON[last.picks[you]]}
                </span>
                <div className="bounce-in text-center">
                  <div className={`font-display text-3xl font-extrabold ${result === 'win' ? 'text-win' : result === 'lose' ? 'text-lose' : ''}`}>
                    {result === 'win' ? 'You win the round!' : result === 'lose' ? 'Round lost' : 'Tie!'}
                  </div>
                  {last.timedOut[you] && <div className="text-sm font-bold text-lose">Too slow: random pick, 1 miss</div>}
                  {last.timedOut[opp] && <div className="text-sm font-bold text-muted">{names[opp]} was too slow</div>}
                </div>
                <span className="bounce-in text-6xl" title={RPS_NAME[last.picks[opp]]}>
                  <span className="inline-block -scale-x-100">{RPS_ICON[last.picks[opp]]}</span>
                </span>
                {result === 'win' && (
                  <span className="float-up absolute top-2 left-6 font-display text-2xl font-extrabold text-win">+1</span>
                )}
              </>
            ) : (
              <>
                <TimerRing leftMs={leftMs ?? 0} totalMs={view.windowMs} />
                <div className="text-left">
                  <div className="font-display text-xl font-extrabold">Round {view.round}</div>
                  <div className="text-sm text-muted">
                    {view.myPick
                      ? `You picked ${RPS_NAME[view.myPick]}. ${view.opponentPicked ? 'Revealing…' : `Waiting for ${names[opp]}…`}`
                      : view.opponentPicked
                        ? `${names[opp]} has picked. Quick!`
                        : 'Pick a hand!'}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Object.keys(RPS_ICON).map((c) => (
              <button
                key={c}
                type="button"
                disabled={!canMove}
                onClick={() => onMove({ choice: c })}
                className={`flex flex-col items-center gap-1 rounded-[20px] border-[3px] bg-card py-5 font-bold shadow-[0_5px_0_rgb(23_32_51/0.12)] transition-transform enabled:hover:-translate-y-1 enabled:hover:border-sps enabled:active:translate-y-0 disabled:cursor-default ${
                  view.myPick === c ? 'border-sps bg-sps/15' : 'border-ink/80'
                } ${view.myPick && view.myPick !== c ? 'opacity-40' : ''} ${!canMove && !view.myPick ? 'opacity-60' : ''}`}
              >
                <span className="text-5xl">{RPS_ICON[c]}</span>
                {RPS_NAME[c]}
              </button>
            ))}
          </div>
        </>
      )}
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
  if (gameId === 'rock-paper-scissors') return view.phase === 'ready' ? !view.ready[you] : view.phase === 'picking' && !view.myPick;
  return view.turn === you;
}
