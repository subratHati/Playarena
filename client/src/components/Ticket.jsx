import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GAMES } from '../lib/games';
import { formatWhen, inr } from '../lib/api';

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl font-extrabold tracking-wider sm:text-3xl">{value}</span>
        <button
          type="button"
          className="rounded-md border border-line px-2 py-0.5 text-xs font-bold hover:border-ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// The tournament pass: Entry ID + passkey on a ticket stub.
export default function Ticket({ tournament, registration, showEnter = true }) {
  const game = GAMES[tournament.gameId];
  const enterable = ['upcoming', 'live'].includes(tournament.status);
  return (
    <div className="ticket border border-line shadow-[0_1px_0_var(--color-line)]" style={{ '--tear': '70%' }}>
      <div className="ticket-tear max-sm:hidden" />
      <div className="grid sm:grid-cols-[70%_30%]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className={`h-3 w-3 rounded-full ${game.bg}`} />
            <span className="font-bold">{game.name}</span>
            <span className="text-muted">{formatWhen(tournament.startsAt)}</span>
          </div>
          <h3 className="mb-5 text-xl font-extrabold">{tournament.title}</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <CopyField label="Entry ID" value={registration.entryId} />
            <CopyField label="Passkey" value={registration.passkey} />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 border-t-2 border-dashed border-line p-5 sm:border-t-0 sm:p-6">
          <div>
            <div className="text-sm text-muted">Entry</div>
            <div className="font-display text-2xl font-extrabold">{inr(tournament.entryFee)}</div>
            {registration.placement && <div className="mt-2 text-sm font-bold">{registration.placement}</div>}
          </div>
          {showEnter && enterable && (
            <Link
              to={`/tournaments/enter?entryId=${encodeURIComponent(registration.entryId)}`}
              className="btn-primary px-3 py-2 text-sm"
            >
              Enter tournament
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
