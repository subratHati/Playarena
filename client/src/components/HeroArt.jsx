import { MivoShape } from './Brand';

const INK = '#172033';
const Mivo = ({ x, y, size = 90, mood, rotate = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${size / 64})`}>
    <MivoShape mood={mood} />
  </g>
);

function TttArt() {
  const cells = ['X', 'O', '', '', 'X', 'O', 'O', '', 'X'];
  return (
    <>
      <g transform="rotate(-6 200 150)">
        <rect x="95" y="45" width="210" height="210" rx="26" fill={INK} />
        {cells.map((c, i) => {
          const x = 107 + (i % 3) * 64;
          const y = 57 + Math.floor(i / 3) * 64;
          return (
            <g key={i}>
              <rect x={x} y={y} width="58" height="58" rx="14" fill={[0, 4, 8].includes(i) ? '#ffc53d' : '#edf0f4'} />
              {c === 'X' && (
                <path d={`M${x + 15} ${y + 15} L${x + 43} ${y + 43} M${x + 43} ${y + 15} L${x + 15} ${y + 43}`} stroke="#0b8fa3" strokeWidth="9" strokeLinecap="round" />
              )}
              {c === 'O' && <circle cx={x + 29} cy={y + 29} r="15" stroke={INK} strokeWidth="8" fill="none" />}
            </g>
          );
        })}
        <path d="M123 73 L289 239" stroke="#d6395f" strokeWidth="9" strokeLinecap="round" />
      </g>
      <path d="M40 60 l18 18 m0 -18 l-18 18" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" opacity=".7" />
      <circle cx="355" cy="70" r="15" stroke="#ffffff" strokeWidth="7" fill="none" opacity=".7" />
      <Mivo x={300} y={190} size={92} mood="wink" rotate={8} />
    </>
  );
}

function TrophyArt() {
  return (
    <>
      {[
        [60, 70, '#ffc53d', 20],
        [340, 60, '#ff8fab', -15],
        [80, 230, '#0b8fa3', 30],
        [330, 240, '#ffffff', 10],
        [205, 30, '#d6395f', 45],
      ].map(([x, y, c, r], i) => (
        <rect key={i} x={x} y={y} width="16" height="9" rx="2" fill={c} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <g transform="rotate(8 270 200)">
        <rect x="225" y="160" width="150" height="80" rx="14" fill="#ffffff" />
        <line x1="330" y1="168" x2="330" y2="232" stroke="#cfd6e0" strokeWidth="3" strokeDasharray="6 6" />
        <rect x="240" y="180" width="70" height="10" rx="5" fill="#cfd6e0" />
        <rect x="240" y="200" width="50" height="16" rx="5" fill={INK} />
        <circle cx="352" cy="200" r="10" fill="#3346e8" />
      </g>
      <g>
        <path d="M120 70 h120 v40 a60 60 0 0 1 -120 0 z" fill="#ffc53d" stroke={INK} strokeWidth="6" />
        <path d="M120 85 h-22 a22 22 0 0 0 22 40" fill="none" stroke={INK} strokeWidth="6" />
        <path d="M240 85 h22 a22 22 0 0 1 -22 40" fill="none" stroke={INK} strokeWidth="6" />
        <rect x="168" y="168" width="24" height="34" fill="#ffc53d" stroke={INK} strokeWidth="6" />
        <rect x="135" y="200" width="90" height="26" rx="8" fill="#c97f00" stroke={INK} strokeWidth="6" />
        <path d="M180 95 l8 16 18 3 -13 12 3 18 -16 -9 -16 9 3 -18 -13 -12 18 -3z" fill="#ffffff" />
        <rect x="132" y="78" width="16" height="44" rx="8" fill="#ffffff" opacity=".35" />
      </g>
      <Mivo x={40} y={150} size={96} mood="wow" rotate={-8} />
    </>
  );
}

function C4Art() {
  const grid = [
    [null, null, null, null, null, null],
    [null, null, null, null, null, null],
    [null, null, 1, null, null, null],
    [null, 0, 0, 1, null, null],
    [0, 1, 1, 0, 1, null],
  ];
  return (
    <>
      <g transform="rotate(5 210 170)">
        <rect x="90" y="70" width="250" height="215" rx="22" fill="#3346e8" stroke={INK} strokeWidth="6" />
        {grid.map((row, r) =>
          row.map((v, c) => (
            <circle
              key={`${r}-${c}`}
              cx={120 + c * 38}
              cy={102 + r * 38}
              r="14"
              fill={v === 0 ? '#d6395f' : v === 1 ? '#ffc53d' : '#1f2a8f'}
            />
          ))
        )}
      </g>
      <circle cx="248" cy="40" r="15" fill="#ffc53d" stroke={INK} strokeWidth="4" />
      <path d="M248 62 v14 M238 66 l-4 8 M258 66 l4 8" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity=".8" />
      <Mivo x={18} y={40} size={92} />
    </>
  );
}

function SpsArt() {
  return (
    <>
      {[
        ['✊', 110, 150, -12],
        ['✋', 200, 110, 6],
        ['✌️', 290, 160, 14],
      ].map(([e, x, y, r]) => (
        <g key={e} transform={`rotate(${r} ${x} ${y})`}>
          <circle cx={x} cy={y} r="56" fill="#ffffff" stroke={INK} strokeWidth="6" />
          <text x={x} y={y + 22} fontSize="62" textAnchor="middle">
            {e}
          </text>
        </g>
      ))}
      <Mivo x={300} y={210} size={74} mood="wink" />
    </>
  );
}

const ARTS = { ttt: TttArt, trophy: TrophyArt, c4: C4Art, sps: SpsArt };

export default function HeroArt({ art, className = '' }) {
  const Art = ARTS[art] || TttArt;
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden>
      <Art />
    </svg>
  );
}
