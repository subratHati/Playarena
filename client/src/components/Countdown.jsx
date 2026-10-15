import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function splitDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

// Ticking countdown. `compact` renders inline text ("1m 05s"); otherwise a large clock.
export default function Countdown({ to, compact = false, offset = 0 }) {
  const now = useNow();
  const { d, h, m, s } = splitDuration(new Date(to).getTime() - (now + offset));
  const pad = (n) => String(n).padStart(2, '0');

  if (compact) {
    if (d) return <span>{d}d {h}h</span>;
    if (h) return <span>{h}h {pad(m)}m</span>;
    return <span>{m}m {pad(s)}s</span>;
  }
  const parts = d ? [[d, 'days'], [h, 'hrs'], [m, 'min']] : [[h, 'hrs'], [m, 'min'], [s, 'sec']];
  return (
    <div className="flex gap-4" role="timer">
      {parts.map(([v, l]) => (
        <div key={l} className="text-center">
          <div className="font-display text-4xl font-extrabold tabular-nums sm:text-5xl">{pad(v)}</div>
          <div className="text-sm text-muted">{l}</div>
        </div>
      ))}
    </div>
  );
}
