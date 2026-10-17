// MivoPlay brand: "Mivo" the mascot + wordmark.
export const BRAND = 'MivoPlay';

// Mivo's drawing on a 64×64 grid, so it can be placed inside other illustrations.
export function MivoShape({ mood = 'happy' }) {
  return (
    <>
      <path d="M32 9 V3" stroke="#172033" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="4" r="4" fill="#ffc53d" stroke="#172033" strokeWidth="2.5" />
      <rect x="6" y="9" width="52" height="50" rx="20" fill="#3346e8" stroke="#172033" strokeWidth="3" />
      <rect x="12" y="14" width="22" height="10" rx="5" fill="#ffffff" opacity=".18" />
      <circle cx="23" cy="32" r="8" fill="#ffffff" stroke="#172033" strokeWidth="2.5" />
      <circle cx="41" cy="32" r="8" fill="#ffffff" stroke="#172033" strokeWidth="2.5" />
      {mood === 'wink' ? (
        <path d="M35 33 Q41 28 47 33" stroke="#172033" strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : (
        <circle cx="43" cy="33" r="3.6" fill="#172033" />
      )}
      <circle cx="25" cy="33" r="3.6" fill="#172033" />
      <circle cx="14" cy="43" r="3" fill="#ff8fab" opacity=".9" />
      <circle cx="50" cy="43" r="3" fill="#ff8fab" opacity=".9" />
      {mood === 'wow' ? (
        <ellipse cx="32" cy="47" rx="5" ry="6" fill="#172033" />
      ) : (
        <path d="M26 45 Q32 51 38 45" stroke="#172033" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </>
  );
}

export function Mivo({ className = '', mood = 'happy', title }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <MivoShape mood={mood} />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      Mivo<span className="text-court">Play</span>
    </span>
  );
}
