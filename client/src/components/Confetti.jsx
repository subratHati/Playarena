import { useEffect, useRef } from 'react';

const COLORS = ['#3346e8', '#ffc53d', '#d6395f', '#0b8fa3', '#c97f00', '#ff8fab', '#138a4b'];

// One celebratory burst. Change `fireKey` to fire again. Skipped for reduced-motion users.
export default function Confetti({ fireKey }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!fireKey) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pieces = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 6,
      size: Math.random() * 7 + 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.35,
    }));

    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += 0.38;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2200);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.6);
        ctx.restore();
      }
      if (t < 2200) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fireKey]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden />;
}
