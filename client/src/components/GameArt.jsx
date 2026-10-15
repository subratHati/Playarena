// Small illustrations of each board for the game shelf.
export default function GameArt({ gameId, className = '' }) {
  if (gameId === 'tic-tac-toe') {
    return (
      <svg viewBox="0 0 120 120" className={className} aria-hidden>
        <rect width="120" height="120" rx="18" fill="var(--color-ttt)" />
        <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".55">
          <path d="M47 22v76M73 22v76M22 47h76M22 73h76" />
        </g>
        <g stroke="#fff" strokeWidth="7" strokeLinecap="round">
          <path d="M28 28l12 12M40 28L28 40M80 80l12 12M92 80L80 92M54 54l12 12M66 54L54 66" />
        </g>
        <circle cx="86" cy="34" r="8" fill="none" stroke="var(--color-ink)" strokeWidth="6" />
        <circle cx="34" cy="86" r="8" fill="none" stroke="var(--color-ink)" strokeWidth="6" />
        <path d="M24 24L96 96" stroke="var(--color-gold)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  if (gameId === 'connect-four') {
    const filled = { 35: 0, 36: 1, 37: 0, 38: 0, 29: 1, 30: 0, 31: 1, 23: 1, 24: 0, 17: 0, 39: 1, 32: 1 };
    return (
      <svg viewBox="0 0 120 120" className={className} aria-hidden>
        <rect width="120" height="120" rx="18" fill="var(--color-c4)" />
        <rect x="14" y="24" width="92" height="80" rx="10" fill="var(--color-court)" />
        {Array.from({ length: 42 }, (_, i) => {
          const r = Math.floor(i / 7);
          const c = i % 7;
          const p = filled[i];
          return (
            <circle
              key={i}
              cx={22 + c * 12.6}
              cy={32 + r * 12.6}
              r="4.8"
              fill={p === 0 ? 'var(--color-c4)' : p === 1 ? 'var(--color-gold)' : 'var(--color-chalk)'}
            />
          );
        })}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <rect width="120" height="120" rx="18" fill="var(--color-sps)" />
      <text x="30" y="58" fontSize="34" textAnchor="middle">✊</text>
      <text x="90" y="58" fontSize="34" textAnchor="middle">✋</text>
      <text x="60" y="100" fontSize="34" textAnchor="middle">✌️</text>
    </svg>
  );
}
