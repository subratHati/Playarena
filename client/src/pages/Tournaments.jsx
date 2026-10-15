import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatWhen, inr } from '../lib/api';
import { GAMES, GAME_LIST } from '../lib/games';
import Countdown from '../components/Countdown';

const TABS = [
  ['upcoming', 'Upcoming'],
  ['live', 'Live'],
  ['completed', 'Finished'],
];

export function TournamentCard({ t }) {
  const g = GAMES[t.gameId];
  const filled = Math.min(100, Math.round((t.registeredCount / t.maxPlayers) * 100));
  return (
    <Link to={`/tournaments/${t.id}`} className="panel flex w-full flex-col overflow-hidden transition-colors hover:border-ink">
      <div className={`h-2 ${g.bg}`} aria-hidden />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-1 text-sm font-bold">
          <span className={g.text}>{g.name}</span>
        </div>
        <h3 className="mb-1 text-xl font-extrabold">{t.title}</h3>
        <p className="mb-4 text-sm text-muted">{formatWhen(t.startsAt)}</p>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Entry</dt>
            <dd className="font-display text-xl font-extrabold">{inr(t.entryFee)}</dd>
          </div>
          <div>
            <dt className="text-muted">{t.status === 'upcoming' ? 'Starts in' : 'Status'}</dt>
            <dd className="font-display text-xl font-extrabold">
              {t.status === 'upcoming' && <Countdown to={t.startsAt} compact />}
              {t.status === 'live' && <span className="text-lose">Live</span>}
              {t.status === 'completed' && 'Finished'}
              {t.status === 'cancelled' && 'Cancelled'}
            </dd>
          </div>
        </dl>

        <div className="mt-auto">
          {t.status === 'completed' && t.winnerName ? (
            <p className="text-sm">
              Champion: <b>{t.winnerName}</b>
            </p>
          ) : (
            <>
              <div className="mb-1 flex justify-between text-sm">
                <span>
                  {t.registeredCount} of {t.maxPlayers} registered
                </span>
                {t.status === 'upcoming' && <span className="text-muted">{t.seatsLeft ? `${t.seatsLeft} left` : 'Full'}</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-chalk">
                <div className={`h-full rounded-full ${g.bg}`} style={{ width: `${filled}%` }} />
              </div>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function Tournaments() {
  const [tab, setTab] = useState('upcoming');
  const [game, setGame] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setList(null);
    const qs = new URLSearchParams({ status: tab === 'completed' ? 'completed,cancelled' : tab });
    if (game) qs.set('game', game);
    api(`/tournaments?${qs}`)
      .then((d) => setList(tab === 'completed' ? d.tournaments.reverse() : d.tournaments))
      .catch((e) => setError(e.message));
  }, [tab, game]);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold sm:text-5xl">Tournament zone</h1>
          <p className="mt-3 text-lg text-muted">
            Book a seat, get your Entry ID and passkey, and show up at the start time. Knockout brackets, played live
            against real players.
          </p>
        </div>
        <Link to="/tournaments/enter" className="btn-ghost">
          I have a pass
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-[10px] border border-line bg-card p-1">
          {TABS.map(([v, l]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold ${tab === v ? 'bg-ink text-chalk' : 'hover:bg-chalk'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <label htmlFor="game-filter" className="sr-only">
          Filter by game
        </label>
        <select id="game-filter" className="field w-auto py-2" value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="">All games</option>
          {GAME_LIST.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="font-bold text-lose">{error}</p>}
      {!list && !error && <p className="text-muted">Loading tournaments…</p>}
      {list?.length === 0 && (
        <p className="panel p-8 text-center text-muted">
          {tab === 'upcoming' ? 'Nothing scheduled yet. New tournaments are added regularly.' : tab === 'live' ? 'No tournament is being played right now.' : 'No finished tournaments yet.'}
        </p>
      )}
      {list?.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <li key={t.id} className="flex">
              <div className="flex w-full">
                <TournamentCard t={t} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
