import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { canvasToDataUrl, loadImage, MAX_UPLOAD_BYTES } from '../lib/image';

const MAX_ZOOM = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Drag to move, slider (or + and − keys) to zoom. Zooming out below "fill" shows the whole
// picture with a blurred fill around it. Calls onChange({ dataUrl, bytes }) with the cropped picture.
export default function ImageCropper({ file, shape, onChange, onError, allowFit = true }) {
  const frameRef = useRef(null);
  const [img, setImg] = useState(null);
  const [src, setSrc] = useState(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1); // 1 = picture just covers the frame
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px from centre, in frame pixels
  const drag = useRef(null);
  const zoomId = useId();

  // Load the chosen file.
  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    let alive = true;
    loadImage(url)
      .then((el) => {
        if (!alive) return;
        setImg(el);
        setSrc(url);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch((e) => onError?.(e.message));
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [file, onError]);

  // New shape: start centred again.
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [shape.id]);

  // Track the frame's on-screen size.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setFrame({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  const cover = img && frame.w ? Math.max(frame.w / img.width, frame.h / img.height) : 1;
  const contain = img && frame.w ? Math.min(frame.w / img.width, frame.h / img.height) : 1;
  const minZoom = allowFit ? contain / cover : 1; // ≤ 1; banners must fill the frame
  const scale = cover * zoom;
  const dw = img ? img.width * scale : 0;
  const dh = img ? img.height * scale : 0;

  const clampOffset = useCallback(
    (o, w = dw, h = dh) => ({
      x: w > frame.w ? clamp(o.x, -(w - frame.w) / 2, (w - frame.w) / 2) : 0,
      y: h > frame.h ? clamp(o.y, -(h - frame.h) / 2, (h - frame.h) / 2) : 0,
    }),
    [dw, dh, frame.w, frame.h]
  );

  const setZoomTo = (z) => {
    const nz = clamp(z, minZoom, MAX_ZOOM);
    const k = nz / zoom;
    // keep the same point under the centre of the frame
    setOffset((o) => clampOffset({ x: o.x * k, y: o.y * k }, img.width * cover * nz, img.height * cover * nz));
    setZoom(nz);
  };

  // Export (debounced) whenever the crop changes.
  useEffect(() => {
    if (!img || !frame.w) return undefined;
    const t = setTimeout(() => {
      const [ow, oh] = shape.out;
      const k = ow / frame.w;
      const c = document.createElement('canvas');
      c.width = ow;
      c.height = oh;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (dw < frame.w - 0.5 || dh < frame.h - 0.5) {
        // Blurred fill: draw the picture tiny, then stretch it (works in every browser).
        const tiny = document.createElement('canvas');
        tiny.width = 24;
        tiny.height = Math.max(1, Math.round((24 * oh) / ow));
        const s = Math.max(tiny.width / img.width, tiny.height / img.height) * 1.2;
        tiny.getContext('2d').drawImage(img, (tiny.width - img.width * s) / 2, (tiny.height - img.height * s) / 2, img.width * s, img.height * s);
        ctx.fillStyle = '#172033';
        ctx.fillRect(0, 0, ow, oh);
        ctx.globalAlpha = 0.75;
        ctx.drawImage(tiny, 0, 0, ow, oh);
        ctx.globalAlpha = 1;
      }
      const x = (frame.w / 2 + offset.x - dw / 2) * k;
      const y = (frame.h / 2 + offset.y - dh / 2) * k;
      ctx.drawImage(img, x, y, dw * k, dh * k);
      const out = canvasToDataUrl(c);
      if (out.bytes > MAX_UPLOAD_BYTES) onError?.('This picture is too detailed to upload. Try a different one.');
      else onChange(out);
    }, 200);
    return () => clearTimeout(t);
  }, [img, frame.w, frame.h, dw, dh, offset.x, offset.y, shape, onChange, onError]);

  if (!img) return <div className="grid aspect-video place-items-center rounded-[14px] bg-chalk text-sm text-muted">Loading picture…</div>;

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, o: offset };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setOffset(clampOffset({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y }));
  };
  const onPointerUp = () => (drag.current = null);
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setOffset((o) => clampOffset({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') setZoomTo(zoom * 1.1);
    else if (e.key === '-') setZoomTo(zoom / 1.1);
  };
  const canMove = dw > frame.w + 1 || dh > frame.h + 1;

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        role="application"
        aria-label="Picture position. Drag or use arrow keys to move, plus and minus to zoom."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={`relative mx-auto w-full touch-none overflow-hidden rounded-[14px] bg-ink select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-court ${
          canMove ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ aspectRatio: shape.ratio, maxHeight: 420, maxWidth: 420 * shape.ratio }}
      >
        {zoom < 1 && <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" draggable={false} />}
        <img
          src={src}
          alt="Crop preview"
          draggable={false}
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
          style={{ width: dw, height: dh, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
        />
        {/* rule-of-thirds guide */}
        <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border border-white/15" />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={zoomId} className="text-sm font-bold">
          Zoom
        </label>
        <input
          id={zoomId}
          type="range"
          min={minZoom}
          max={MAX_ZOOM}
          step="any"
          value={zoom}
          onChange={(e) => setZoomTo(Number(e.target.value))}
          className="min-w-[140px] flex-1 accent-court"
        />
        <div className="flex gap-2">
          {allowFit && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setZoomTo(minZoom)} disabled={minZoom >= 0.999}>
              Fit whole picture
            </button>
          )}
          {allowFit && (
            <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setZoomTo(1)}>
              Fill frame
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">
        {canMove ? 'Drag the picture to choose which part shows.' : 'The whole picture fits.'} Original {img.width}×{img.height}.
      </p>
    </div>
  );
}
