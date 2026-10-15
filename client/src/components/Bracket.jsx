const RESULT = { won: '', bye: 'bye', walkover: 'walkover', forfeit: 'forfeit', 'double no-show': 'no-show' };

function roundName(i, total, finished) {
  if (finished && i === total - 1) return 'Final';
  return `Round ${i + 1}`;
}

export default function Bracket({ rounds, me, status }) {
  if (!rounds?.length) return null;
  const finished = status === 'completed';
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-6">
        {rounds.map((r, i) => (
          <section key={r.round} className="w-56 shrink-0">
            <h4 className="mb-3 font-display text-lg font-bold">{roundName(i, rounds.length, finished)}</h4>
            <ol className="flex flex-col justify-around gap-3" style={{ minHeight: rounds[0].matches.length * 92 }}>
              {r.matches.map((m) => (
                <li key={m.key} className={`panel overflow-hidden text-sm ${m.status === 'live' ? 'border-court' : ''}`}>
                  {m.players.map((p, j) => {
                    const won = m.winner && p === m.winner;
                    return (
                      <div
                        key={j}
                        className={`flex items-center justify-between gap-2 px-3 py-2 ${j === 0 ? 'border-b border-line' : ''} ${
                          won ? 'font-bold' : m.status === 'done' && p ? 'text-muted line-through decoration-1' : ''
                        } ${p && p === me ? 'bg-court/8' : ''}`}
                      >
                        <span className="truncate">{p || <span className="text-muted no-underline">—</span>}</span>
                        {won && <span className="text-win" aria-label="winner">✓</span>}
                      </div>
                    );
                  })}
                  {(m.status === 'live' || RESULT[m.result]) && (
                    <div className="bg-chalk px-3 py-1 text-xs text-muted">{m.status === 'live' ? 'Playing now' : RESULT[m.result]}</div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
