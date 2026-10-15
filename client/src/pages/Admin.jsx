import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { GAME_LIST } from '../lib/games';
import { TournamentCard } from './Tournaments';

// datetime-local wants local time without a zone.
function localInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function Admin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    gameId: GAME_LIST[0].id,
    description: '',
    entryFee: 49,
    maxPlayers: 16,
    startsAt: localInput(Date.now() + 24 * 3600_000),
    reward: 'Champion badge + leaderboard spot',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState([]);

  useEffect(() => {
    api('/tournaments?status=upcoming,live').then((d) => setList(d.tournaments)).catch(() => {});
  }, []);

  if (loading) return null;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/tournaments', {
        method: 'POST',
        body: { ...form, startsAt: new Date(form.startsAt).toISOString() },
      });
      navigate(`/tournaments/${d.tournament.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,480px)_1fr]">
      <section>
        <h1 className="mb-6 text-4xl font-extrabold">Schedule a tournament</h1>
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <label htmlFor="title" className="label">
              Title
            </label>
            <input id="title" className="field" value={form.title} onChange={set('title')} required minLength={3} maxLength={80} />
          </div>
          <div>
            <label htmlFor="game" className="label">
              Game
            </label>
            <select id="game" className="field" value={form.gameId} onChange={set('gameId')}>
              {GAME_LIST.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="fee" className="label">
                Entry fee (₹)
              </label>
              <input id="fee" type="number" min="0" step="1" className="field" value={form.entryFee} onChange={set('entryFee')} required />
            </div>
            <div>
              <label htmlFor="max" className="label">
                Max players
              </label>
              <input id="max" type="number" min="2" max="256" className="field" value={form.maxPlayers} onChange={set('maxPlayers')} required />
            </div>
          </div>
          <div>
            <label htmlFor="starts" className="label">
              Starts at
            </label>
            <input id="starts" type="datetime-local" className="field" value={form.startsAt} onChange={set('startsAt')} required />
          </div>
          <div>
            <label htmlFor="reward" className="label">
              Reward
            </label>
            <input id="reward" className="field" value={form.reward} onChange={set('reward')} maxLength={120} />
            <p className="mt-1 text-sm text-muted">Badges, titles or merchandise — not cash.</p>
          </div>
          <div>
            <label htmlFor="desc" className="label">
              Description
            </label>
            <textarea id="desc" rows={3} className="field" value={form.description} onChange={set('description')} maxLength={600} />
          </div>
          {error && (
            <p className="text-sm font-bold text-lose" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Scheduling…' : 'Schedule tournament'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-extrabold">Upcoming and live</h2>
        {list.length === 0 ? (
          <p className="panel p-6 text-muted">Nothing scheduled.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {list.map((t) => (
              <li key={t.id} className="flex">
                <TournamentCard t={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
