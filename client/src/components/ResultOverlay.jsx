import { useEffect, useState } from 'react';
import Confetti from './Confetti';
import { Mivo } from './Brand';

const LOOK = {
  win: { title: 'You win!', mood: 'wink', box: 'bg-win text-white', vignette: 'vignette-win' },
  lose: { title: 'You lost', mood: 'sad', box: 'bg-lose text-white', vignette: 'vignette-lose' },
  draw: { title: 'Draw!', mood: 'wow', box: 'bg-ink text-white', vignette: '' },
};

// Big full-screen moment when a match ends, so the result is impossible to miss.
// Pass a new `fireKey` each time a match ends; `outcome` is 'win' | 'lose' | 'draw'.
export default function ResultOverlay({ outcome, fireKey, subtitle }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!fireKey || !outcome) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, [fireKey, outcome]);

  const look = LOOK[outcome];
  return (
    <>
      <Confetti fireKey={outcome === 'win' ? fireKey : 0} />
      {visible && look && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-6" role="status" aria-live="assertive">
          {look.vignette && <div className={`absolute inset-0 ${look.vignette}`} />}
          <div className={`overlay-pop relative flex items-center gap-4 rounded-[28px] border-[4px] border-ink px-7 py-5 shadow-[0_8px_0_var(--color-ink)] ${look.box}`}>
            <Mivo className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" mood={look.mood} />
            <div>
              <p className="font-display text-4xl leading-none font-extrabold sm:text-5xl">{look.title}</p>
              {subtitle && <p className="mt-1 font-bold opacity-90">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Shake a container briefly when the player loses. Returns a className to apply.
export function useLoseShake(trigger) {
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!trigger) return undefined;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 560);
    return () => clearTimeout(t);
  }, [trigger]);
  return shaking ? 'lose-shake' : '';
}
