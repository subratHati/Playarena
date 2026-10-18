import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { HERO_SHAPES, apiImage } from '../lib/image';
import { HERO_SLIDES } from '../content/heroSlides';
import Hero, { HERO_THEMES, fromApiSlide } from '../components/Hero';
import ImageCropper from '../components/ImageCropper';
import HeroArt from '../components/HeroArt';

const MODES = [
  ['default', 'Built-in slides only', 'The three MivoPlay slides that come with the site.'],
  ['custom', 'My slides only', 'Only the slides you add below.'],
  ['both', 'My slides, then built-in', 'Your slides first, followed by the built-in ones.'],
];
const EMPTY = { title: '', text: '', ctaLabel: '', ctaTo: '', theme: 'court' };

// Renders children at a fixed width and scales them down to fit, so the computer preview
// looks exactly like the live hero on a wide screen (1120px = the site's content width).
function ScaledBox({ width, ratio, children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-[14px]" style={{ aspectRatio: ratio }}>
      {scale > 0 && (
        <div className="absolute top-0 left-0 origin-top-left" style={{ width, transform: `scale(${scale})` }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Desktop and phone previews of one slide, using the real carousel.
function SlidePreview({ slide }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Computer</p>
        <div className="pointer-events-none">
          <ScaledBox width={1120} ratio={14 / 5}>
            <Hero slides={[slide]} className="" autoplay={false} />
          </ScaledBox>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Phone</p>
        <div className="pointer-events-none w-full max-w-[360px] overflow-hidden rounded-[22px] border-[6px] border-ink">
          <Hero slides={[slide]} className="" autoplay={false} />
        </div>
      </div>
    </div>
  );
}

function TextFields({ value, onChange, layout, idPrefix }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const id = (k) => `${idPrefix}-${k}`;
  return (
    <div className="space-y-3">
      {layout === 'side' && (
        <>
          <div>
            <label htmlFor={id('title')} className="label">
              Headline
            </label>
            <input id={id('title')} className="field" value={value.title} onChange={set('title')} maxLength={80} required />
          </div>
          <div>
            <label htmlFor={id('text')} className="label">
              Short text <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id={id('text')} rows={2} className="field" value={value.text} onChange={set('text')} maxLength={200} />
          </div>
        </>
      )}
      {layout === 'banner' && (
        <div>
          <label htmlFor={id('title')} className="label">
            What the banner says <span className="font-normal text-muted">(for screen readers)</span>
          </label>
          <input id={id('title')} className="field" value={value.title} onChange={set('title')} maxLength={80} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {layout === 'side' && (
          <div>
            <label htmlFor={id('cta')} className="label">
              Button label <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id={id('cta')} className="field" value={value.ctaLabel} onChange={set('ctaLabel')} maxLength={30} placeholder="See tournaments" />
          </div>
        )}
        <div className={layout === 'banner' ? 'sm:col-span-2' : ''}>
          <label htmlFor={id('to')} className="label">
            {layout === 'banner' ? 'Opens when tapped' : 'Button link'} <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id={id('to')} className="field" value={value.ctaTo} onChange={set('ctaTo')} maxLength={300} placeholder="/tournaments or https://…" />
        </div>
      </div>
      {layout === 'side' && (
        <div>
          <span className="label">Background colour</span>
          <div className="flex flex-wrap gap-2">
            {HERO_THEMES.map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={value.theme === k}
                onClick={() => onChange({ ...value, theme: k })}
                className={`flex items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1 text-sm font-bold ${value.theme === k ? 'border-ink' : 'border-line'}`}
              >
                <span className={`h-6 w-6 rounded-full bg-${k}`} />
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Choose a picture and crop it to one shape. value = { dataUrl, bytes } or null.
function PicturePicker({ title, hint, shape, allowFit = true, onChange, current }) {
  const id = useId();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const onCrop = useCallback((c) => {
    setError('');
    onChange(c);
  }, [onChange]);
  const onCropError = useCallback((m) => setError(m), []);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError('Choose a JPG, PNG or WebP picture');
    setError('');
    onChange(null);
    setFile(f);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-muted">
          Crops to {shape.out[0]}×{shape.out[1]}
        </span>
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />
      {file ? (
        <>
          <ImageCropper file={file} shape={shape} allowFit={allowFit} onChange={onCrop} onError={onCropError} />
          <label htmlFor={id} className="btn-ghost inline-flex cursor-pointer px-3 py-1.5 text-sm">
            Choose another picture
          </label>
        </>
      ) : (
        <label
          htmlFor={id}
          className="flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[14px] border-2 border-dashed border-line p-4 text-center hover:border-court"
          style={{ aspectRatio: shape.ratio, maxHeight: 220, maxWidth: 220 * shape.ratio }}
        >
          {current ? (
            <img src={current} alt="" className="h-full w-full rounded-[8px] object-cover" />
          ) : (
            <>
              <b>Choose a picture</b>
              <span className="mt-1 text-xs text-muted">JPG, PNG or WebP</span>
            </>
          )}
        </label>
      )}
      {current && !file && <p className="text-xs text-muted">Current picture. Tap it to replace.</p>}
      {error && (
        <p className="text-sm font-bold text-lose" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const BANNER_HINT = 'Fills the whole slide on computers. Keep important text away from the edges.';
const PHONE_HINT = 'Optional, but recommended: phones show this instead. Without it, phones show the middle part of the computer picture.';

function AddSlide({ onAdded, onCancel }) {
  const [layout, setLayout] = useState('side');
  const [crop, setCrop] = useState(null);
  const [cropMobile, setCropMobile] = useState(null);
  const [fields, setFields] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!crop) return setError(layout === 'banner' ? 'Choose the computer picture for the banner' : 'Choose a picture for the slide');
    setBusy(true);
    setError('');
    try {
      await api('/hero/slides', { method: 'POST', body: { ...fields, layout, image: crop.dataUrl, imageMobile: layout === 'banner' ? cropMobile?.dataUrl : undefined } });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const draft = fromApiSlide({ id: 'draft', layout, ...fields, title: fields.title || (layout === 'side' ? 'Your headline here' : ''), imageSrc: crop?.dataUrl, imageMobileSrc: cropMobile?.dataUrl });

  return (
    <form onSubmit={save} className="panel space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Add a slide</h2>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div role="radiogroup" aria-label="Slide layout" className="grid gap-2 sm:grid-cols-2">
        {[HERO_SHAPES.side, HERO_SHAPES.banner].map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={layout === s.id}
            onClick={() => {
              if (s.id === layout) return;
              setLayout(s.id);
              setCrop(null);
              setCropMobile(null);
            }}
            className={`rounded-[12px] border-2 p-3 text-left ${layout === s.id ? 'border-court bg-court/8' : 'border-line hover:border-ink'}`}
          >
            <b>{s.label}</b>
            <span className="block text-sm text-muted">
              {s.id === 'side' ? 'Headline and button, with your picture beside them (4:3).' : 'Your picture fills the whole slide, e.g. a poster with its own text. Computer 14:5, phone 3:2.'}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          {layout === 'side' ? (
            <PicturePicker key="side" title="Picture" shape={HERO_SHAPES.side} onChange={setCrop} />
          ) : (
            <>
              <PicturePicker key="banner" title="Computer picture (required)" hint={BANNER_HINT} shape={HERO_SHAPES.banner} allowFit={false} onChange={setCrop} />
              <PicturePicker key="bannerMobile" title="Phone picture" hint={PHONE_HINT} shape={HERO_SHAPES.bannerMobile} allowFit={false} onChange={setCropMobile} />
            </>
          )}
          <TextFields value={fields} onChange={setFields} layout={layout} idPrefix="new" />
        </div>
        <div className="rounded-[14px] bg-chalk p-4">
          <p className="mb-3 font-bold">Preview</p>
          {crop || layout === 'side' ? <SlidePreview slide={draft} /> : <p className="text-sm text-muted">Choose the computer picture to see the banner.</p>}
        </div>
      </div>

      {error && (
        <p className="text-sm font-bold text-lose" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary px-6 py-3" disabled={busy}>
        {busy ? 'Saving…' : 'Add slide'}
      </button>
    </form>
  );
}

function EditSlide({ slide, onSaved, onCancel }) {
  const [fields, setFields] = useState({ title: slide.title, text: slide.text, ctaLabel: slide.ctaLabel, ctaTo: slide.ctaTo, theme: slide.theme });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState(null);
  const [cropMobile, setCropMobile] = useState(null);
  const [removeMobile, setRemoveMobile] = useState(false);
  const banner = slide.layout === 'banner';
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/hero/slides/${slide.id}/update`, {
        method: 'POST',
        body: { ...fields, image: crop?.dataUrl, imageMobile: banner ? cropMobile?.dataUrl : undefined, removeMobileImage: banner && removeMobile && !cropMobile },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const preview = fromApiSlide({
    ...slide,
    ...fields,
    imageSrc: crop?.dataUrl,
    imageMobileSrc: cropMobile?.dataUrl,
    mobileImageUrl: removeMobile ? null : slide.mobileImageUrl,
  });
  return (
    <form onSubmit={save} className="grid gap-6 border-t border-line p-4 lg:grid-cols-2">
      <div className="space-y-4">
        {banner ? (
          <>
            <PicturePicker title="Computer picture" hint={BANNER_HINT} shape={HERO_SHAPES.banner} allowFit={false} onChange={setCrop} current={apiImage(slide.imageUrl)} />
            <PicturePicker title="Phone picture" hint={PHONE_HINT} shape={HERO_SHAPES.bannerMobile} allowFit={false} onChange={setCropMobile} current={removeMobile ? null : apiImage(slide.mobileImageUrl)} />
            {slide.mobileImageUrl && !cropMobile && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={removeMobile} onChange={(e) => setRemoveMobile(e.target.checked)} />
                Remove the phone picture
              </label>
            )}
          </>
        ) : (
          <PicturePicker title="Picture" shape={HERO_SHAPES.side} onChange={setCrop} current={apiImage(slide.imageUrl)} />
        )}
        <TextFields value={fields} onChange={setFields} layout={slide.layout} idPrefix={`e${slide.id}`} />
        {error && <p className="text-sm font-bold text-lose">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary px-4 py-2" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-ghost px-4 py-2" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <SlidePreview slide={preview} />
    </form>
  );
}

export default function HeroManager() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/hero/admin')
        .then(setData)
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="text-muted">{error || 'Loading…'}</p>;
  const { mode, slides, maxSlides } = data;
  const activeCount = slides.filter((s) => s.active).length;
  const move = (i, d) =>
    act(() => {
      const ids = slides.map((s) => s.id);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      return api('/hero/order', { method: 'POST', body: { ids } });
    });

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">What the homepage shows</h2>
        <p className="mb-4 text-sm text-muted">Slides rotate every 6 seconds at the top of the homepage.</p>
        <div role="radiogroup" aria-label="Homepage slides" className="grid gap-2 sm:grid-cols-3">
          {MODES.map(([v, l, d]) => {
            const disabled = v !== 'default' && activeCount === 0;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={mode === v}
                disabled={busy || disabled}
                onClick={() => act(() => api('/hero/settings', { method: 'POST', body: { mode: v } }))}
                className={`rounded-[12px] border-2 p-3 text-left disabled:opacity-50 ${mode === v ? 'border-court bg-court/8' : 'border-line hover:border-ink'}`}
              >
                <b>{l}</b>
                <span className="block text-sm text-muted">{disabled ? 'Add a slide first.' : d}</span>
              </button>
            );
          })}
        </div>
        {error && (
          <p className="mt-3 text-sm font-bold text-lose" role="alert">
            {error}
          </p>
        )}
      </section>

      {adding ? (
        <AddSlide
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div>
              <h2 className="text-xl font-extrabold">Your slides</h2>
              <p className="text-sm text-muted">
                {slides.length} of {maxSlides}
                {mode === 'default' && slides.length > 0 && ' — not shown right now. Pick “My slides” above to show them.'}
              </p>
            </div>
            <button type="button" className="btn-primary px-4 py-2" onClick={() => setAdding(true)} disabled={slides.length >= maxSlides}>
              Add a slide
            </button>
          </div>
          {slides.length === 0 ? (
            <p className="p-5 text-muted">No slides yet. Add one with your own picture.</p>
          ) : (
            <ul className="divide-y divide-line">
              {slides.map((s, i) => (
                <li key={s.id}>
                  <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                    <img src={apiImage(s.imageUrl)} alt="" className={`h-14 shrink-0 rounded-[10px] object-cover ${s.layout === 'banner' ? 'w-32' : 'w-20'} ${s.active ? '' : 'opacity-40 grayscale'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{s.title || 'Banner'}</div>
                      <div className="text-sm text-muted">
                        {s.layout === 'banner' ? 'Full banner' : 'Picture + text'}
                        {!s.active && ' · hidden'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" aria-label="Move up" className="btn-ghost px-2.5 py-1.5 text-sm" disabled={busy || i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button type="button" aria-label="Move down" className="btn-ghost px-2.5 py-1.5 text-sm" disabled={busy || i === slides.length - 1} onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1.5 text-sm"
                        disabled={busy}
                        onClick={() => act(() => api(`/hero/slides/${s.id}/update`, { method: 'POST', body: { active: !s.active } }))}
                      >
                        {s.active ? 'Hide' : 'Show'}
                      </button>
                      <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1.5 text-sm text-lose"
                        disabled={busy}
                        onClick={() => window.confirm('Delete this slide?') && act(() => api(`/hero/slides/${s.id}/delete`, { method: 'POST' }))}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {editing === s.id && (
                    <EditSlide
                      slide={s}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        load();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="panel p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">Built-in slides</h2>
        <p className="mb-4 text-sm text-muted">These come with MivoPlay and can’t be changed here.</p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {HERO_SLIDES.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-[12px] border border-line p-3">
              <span className={`grid h-14 w-16 shrink-0 place-items-center rounded-[10px] bg-${s.theme}`}>
                <HeroArt art={s.art} className="w-14" />
              </span>
              <span className="text-sm font-bold">{s.title}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
