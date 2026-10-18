// A picture that fills its frame edge to edge (posters are cropped to the frame's shape when uploaded).
// fit="contain" instead shows the whole picture with a blurred copy filling any gap.
export default function CoverImage({ src, alt = '', className = '', loading = 'lazy', fallback = null, fit = 'cover' }) {
  if (!src) return fallback;
  if (fit === 'cover')
    return (
      <div className={`overflow-hidden bg-ink ${className}`}>
        <img src={src} alt={alt} loading={loading} draggable={false} className="h-full w-full object-cover" />
      </div>
    );
  return (
    <div className={`relative overflow-hidden bg-ink ${className}`}>
      <img src={src} alt="" aria-hidden loading={loading} className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
      <img src={src} alt={alt} loading={loading} className="relative h-full w-full object-contain" />
    </div>
  );
}
