import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HERO_SLIDES } from '../content/heroSlides';
import { api } from '../lib/api';
import { apiImage } from '../lib/image';
import HeroArt from './HeroArt';

const THEMES = {
  court: 'bg-court text-white',
  ink: 'bg-ink text-white',
  ttt: 'bg-ttt text-white',
  sps: 'bg-sps text-white',
  c4: 'bg-c4 text-white',
};
export const HERO_THEMES = [
  ['court', 'Blue'],
  ['ttt', 'Teal'],
  ['sps', 'Amber'],
  ['c4', 'Pink'],
  ['ink', 'Dark'],
];
const INTERVAL = 6000;

// Admin-made slide from the API → the shape the carousel uses.
export function fromApiSlide(s) {
  return {
    id: s.id,
    layout: s.layout,
    theme: s.theme,
    title: s.title,
    text: s.text,
    cta: s.ctaLabel || s.ctaTo ? { label: s.ctaLabel, to: s.ctaTo } : null,
    image: s.imageSrc || apiImage(s.imageUrl),
    imageMobile: s.imageMobileSrc || apiImage(s.mobileImageUrl),
    imageAlt: s.title,
  };
}

// Built-in slides, admin slides, or both, as chosen in Admin → Homepage.
export function useHeroSlides() {
  const [slides, setSlides] = useState(HERO_SLIDES);
  useEffect(() => {
    api('/hero')
      .then(({ mode, slides: custom }) => {
        const mine = custom.map(fromApiSlide);
        if (mode === 'custom' && mine.length) setSlides(mine);
        else if (mode === 'both') setSlides([...mine, ...HERO_SLIDES]);
      })
      .catch(() => {}); // keep the built-in slides
  }, []);
  return slides;
}

function SlideLink({ to, className, children, tabIndex }) {
  if (/^https?:\/\//.test(to))
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        {children}
      </a>
    );
  return (
    <Link to={to} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  );
}

function Slide({ s, active, eager }) {
  const theme = THEMES[s.theme] || THEMES.court;
  const tab = active ? 0 : -1;

  if (s.layout === 'banner') {
    // The picture fills the whole slide. Narrow screens (under 672px) use the 3:2 phone picture when there is one,
    // computers use the 14:5 picture. Without a phone picture, phones show the middle of the computer one.
    const alt = s.imageAlt || s.title || 'Banner';
    const pics = (
      <>
        <img src={s.imageMobile || s.image} alt={alt} loading={eager ? 'eager' : 'lazy'} draggable={false} className="h-full w-full object-cover @2xl:hidden" />
        <img src={s.image} alt={alt} loading={eager ? 'eager' : 'lazy'} draggable={false} className="hidden h-full w-full object-cover @2xl:block" />
      </>
    );
    return (
      <div className="h-full w-full bg-ink">
        {s.cta?.to ? (
          <SlideLink to={s.cta.to} tabIndex={tab} className="block h-full w-full">
            {pics}
          </SlideLink>
        ) : (
          pics
        )}
      </div>
    );
  }

  return (
    <div
      className={`grid h-full w-full grid-cols-[1fr_auto] items-center gap-3 px-5 pt-4 pb-10 @md:gap-5 @md:px-7 @5xl:gap-10 @5xl:px-12 @5xl:py-10 ${theme}`}
    >
      <div className="min-w-0">
        <h2 className="line-clamp-3 text-[clamp(20px,7cqw,26px)] leading-[1.05] font-extrabold @md:text-3xl @2xl:text-4xl @5xl:text-5xl">{s.title}</h2>
        {s.text && <p className="mt-2 line-clamp-2 text-sm opacity-90 @md:text-base @5xl:mt-3 @5xl:max-w-md @5xl:text-lg">{s.text}</p>}
        {s.cta?.to && s.cta?.label && (
          <SlideLink
            to={s.cta.to}
            tabIndex={tab}
            className="mt-3 inline-flex items-center whitespace-nowrap rounded-[12px] border-[3px] border-ink bg-white px-3.5 py-1.5 font-display text-base font-extrabold text-ink shadow-[0_4px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_var(--color-ink)] @md:mt-4 @md:px-4 @md:py-2 @md:text-lg @5xl:mt-6 @5xl:px-5 @5xl:py-3"
          >
            {s.cta.label}
          </SlideLink>
        )}
      </div>
      <div className="flex h-full min-h-0 items-center">
        {s.image ? (
          <img
            src={s.image}
            alt={s.imageAlt || ''}
            className="aspect-[4/3] max-h-full w-[110px] rounded-[14px] border-[3px] border-ink object-cover @md:w-[180px] @3xl:w-[250px] @5xl:w-[380px] @5xl:rounded-[22px]"
            loading={eager ? 'eager' : 'lazy'}
          />
        ) : (
          <HeroArt art={s.art} className="sticker max-h-full w-[110px] @md:w-[180px] @3xl:w-[250px] @5xl:w-[400px]" />
        )}
      </div>
    </div>
  );
}

export default function Hero({ slides = HERO_SLIDES, className = '-mx-4 sm:mx-0 sm:rounded-[28px]', autoplay = true }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const count = slides.length;
  const go = useCallback((i) => setIndex((i + count) % count), [count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!autoplay || paused || reduce || count < 2) return undefined;
    const t = setTimeout(() => go(index + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [index, paused, count, go, autoplay]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className={`@container relative overflow-hidden ${className}`}
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
      {/* Fixed shape so banners fill it exactly: 3:2 on phones, 14:5 from 672px wide up (see HERO_SHAPES) */}
      <div
        className="flex aspect-[3/2] transition-transform duration-500 ease-out motion-reduce:transition-none @2xl:aspect-[14/5]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((s, i) => (
          <div key={s.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}: ${s.title || 'Banner'}`} aria-hidden={i !== index} className="h-full w-full shrink-0">
            <Slide s={s} active={i === index} eager={i === 0} />
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 @3xl:bottom-4">
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="hidden h-8 w-8 place-items-center rounded-full bg-white/90 text-ink @md:grid">
            ‹
          </button>
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              className={`h-2.5 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.15)] transition-all ${i === index ? 'w-7 bg-white' : 'w-2.5 bg-white/55 hover:bg-white/80'}`}
            />
          ))}
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="hidden h-8 w-8 place-items-center rounded-full bg-white/90 text-ink @md:grid">
            ›
          </button>
        </div>
      )}
    </section>
  );
}
