import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HERO_SLIDES } from '../content/heroSlides';
import HeroArt from './HeroArt';

const THEMES = {
  court: 'bg-court text-white',
  ink: 'bg-ink text-white',
  ttt: 'bg-ttt text-white',
  sps: 'bg-sps text-white',
  c4: 'bg-c4 text-white',
};
const INTERVAL = 6000;

export default function Hero({ slides = HERO_SLIDES }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const count = slides.length;
  const go = useCallback((i) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (paused || reduce || count < 2) return undefined;
    const t = setTimeout(() => go(index + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [index, paused, count, go]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-[28px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${s.title}`}
            aria-hidden={i !== index}
            className={`grid w-full shrink-0 items-center gap-2 px-6 pt-7 pb-16 sm:px-10 md:min-h-[360px] md:grid-cols-[1.1fr_1fr] md:py-10 ${THEMES[s.theme] || THEMES.court}`}
          >
            <div className="max-w-xl">
              <h2 className="text-4xl leading-[1.05] font-extrabold sm:text-5xl">{s.title}</h2>
              <p className="mt-3 max-w-md text-lg opacity-90">{s.text}</p>
              {s.cta && (
                <Link
                  to={s.cta.to}
                  tabIndex={i === index ? 0 : -1}
                  className="mt-6 inline-flex items-center rounded-[14px] border-[3px] border-ink bg-white px-5 py-3 font-display text-lg font-extrabold text-ink shadow-[0_5px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_var(--color-ink)]"
                >
                  {s.cta.label}
                </Link>
              )}
            </div>
            <div className="mx-auto w-full max-w-[250px] md:max-w-[420px]">
              {s.image ? (
                <img src={s.image} alt={s.imageAlt || ''} className="aspect-[4/3] w-full rounded-[22px] border-[3px] border-ink object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
              ) : (
                <HeroArt art={s.art} className="sticker w-full" />
              )}
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink">
            ‹
          </button>
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              className={`h-2.5 rounded-full transition-all ${i === index ? 'w-7 bg-white' : 'w-2.5 bg-white/50 hover:bg-white/80'}`}
            />
          ))}
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-ink">
            ›
          </button>
        </div>
      )}
    </section>
  );
}
