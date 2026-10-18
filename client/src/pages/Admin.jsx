import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, formatWhen, inr } from '../lib/api';
import { GAME_LIST, GAMES } from '../lib/games';
import { POSTER_SHAPE, tournamentImage } from '../lib/image';
import GameArt from '../components/GameArt';
import CoverImage from '../components/CoverImage';
import ImageCropper from '../components/ImageCropper';
import { TournamentCard } from './Tournaments';
import { TournamentPoster } from './TournamentDetail';
import HeroManager from './AdminHero';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const STATUS = {
  upcoming: { label: 'Upcoming', cls: 'bg-court/12 text-court' },
  live: { label: 'Live', cls: 'bg-lose/12 text-lose' },
  completed: { label: 'Completed', cls: 'bg-win/12 text-win' },
  cancelled: { label: 'Called off', cls: 'bg-ink/10 text-ink' },
  deleted: { label: 'Deleted', cls: 'bg-ink text-chalk' },
};
const FILTERS = [
  ['all', 'All'],
  ['upcoming', 'Upcoming'],
  ['live', 'Live'],
  ['completed', 'Completed'],
  ['cancelled', 'Called off'],
  ['deleted', 'Deleted'],
];
const PAY = {
  paid: { label: 'Paid', cls: 'text-win' },
  refund_pending: { label: 'Refund pending', cls: 'text-lose font-bold' },
  refunded: { label: 'Refunded', cls: 'text-muted' },
  created: { label: 'Not completed', cls: 'text-muted' },
  failed: { label: 'Failed', cls: 'text-muted' },
};

// datetime-local wants local time without a zone.
function localInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.upcoming;
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

function Cover({ t, className = '' }) {
  return (
    <CoverImage
      src={tournamentImage(t)}
      className={className}
      fallback={
        <div className={`grid place-items-center ${GAMES[t.gameId]?.bg || 'bg-ink'} ${className}`}>
          <GameArt gameId={t.gameId} className="h-3/4" />
        </div>
      }
    />
  );
}

// ---------- Create ----------
function PreviewLabel({ children }) {
  return <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{children}</p>;
}

function CreateTournament({ onCreated }) {
  const [form, setForm] = useState({
    title: '',
    gameId: GAME_LIST[0].id,
    description: '',
    entryFee: 49,
    maxPlayers: 16,
    startsAt: localInput(Date.now() + 24 * 3600_000),
    reward: 'Champion badge + leaderboard spot',
  });
  const [file, setFile] = useState(null);
  const [crop, setCrop] = useState(null); // { dataUrl, bytes }
  const [imageError, setImageError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onCrop = useCallback((c) => {
    setCrop(c);
    setImageError('');
  }, []);
  const onCropError = useCallback((m) => setImageError(m), []);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setImageError('Choose a JPG, PNG or WebP picture');
    setImageError('');
    setCrop(null);
    setFile(f);
  };

  const preview = {
    id: 'preview',
    ...form,
    entryFee: Math.max(0, Math.round(Number(form.entryFee) || 0)),
    maxPlayers: Number(form.maxPlayers) || 2,
    registeredCount: 0,
    seatsLeft: Number(form.maxPlayers) || 2,
    startsAt: new Date(form.startsAt || Date.now()).toISOString(),
    status: 'upcoming',
    imageSrc: crop?.dataUrl,
    imageAspect: 'square',
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!crop) {
      setImageError('Add a cover picture for this tournament');
      document.getElementById('cover-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!window.confirm('Tournaments can’t be edited after they’re created. Schedule it now?')) return;
    setBusy(true);
    setError('');
    try {
      const d = await api('/tournaments', {
        method: 'POST',
        body: { ...form, startsAt: new Date(form.startsAt).toISOString(), image: crop.dataUrl, imageAspect: 'square' },
      });
      onCreated(d.tournament);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="panel space-y-4 p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">Details</h2>
        <div>
          <label htmlFor="title" className="label">
            Title
          </label>
          <input id="title" className="field" value={form.title} onChange={set('title')} required minLength={3} maxLength={80} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <div>
            <label htmlFor="starts" className="label">
              Starts at
            </label>
            <input id="starts" type="datetime-local" className="field" value={form.startsAt} onChange={set('startsAt')} required />
          </div>
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
        <div className="grid gap-4 lg:grid-cols-2">
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
        </div>
      </section>

      <section id="cover-section" className={`panel p-5 sm:p-6 ${imageError && !crop ? 'border-lose' : ''}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">Cover picture (required)</h2>
            <p className="text-sm text-muted">Square poster, 1080×1080. Drag and zoom to choose what shows.</p>
          </div>
          {file && (
            <label htmlFor="cover" className="btn-ghost cursor-pointer px-3 py-2 text-sm">
              Choose another picture
            </label>
          )}
        </div>
        <input id="cover" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />

        {!file ? (
          <label
            htmlFor="cover"
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed p-6 text-center ${
              imageError ? 'border-lose' : 'border-line hover:border-court'
            }`}
          >
            <b className="text-lg">Choose a picture</b>
            <span className="mt-1 text-sm text-muted">JPG, PNG or WebP. Best: a square 1080×1080 poster. You can crop it next.</span>
          </label>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <ImageCropper file={file} shape={POSTER_SHAPE} allowFit={false} onChange={onCrop} onError={onCropError} />
            </div>
            <div className="space-y-5 rounded-[14px] bg-chalk p-4">
              <p className="font-bold">
                Preview {crop && <span className="font-normal text-muted">({Math.round(crop.bytes / 1024)} KB)</span>}
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <PreviewLabel>Card on computer</PreviewLabel>
                  <div className="pointer-events-none">
                    <TournamentCard t={preview} layout="tile" preview />
                  </div>
                </div>
                <div>
                  <PreviewLabel>Tournament page</PreviewLabel>
                  <div className="mx-auto max-w-[260px]">
                    <TournamentPoster t={preview} />
                  </div>
                </div>
              </div>
              <div>
                <PreviewLabel>Card on phone</PreviewLabel>
                <div className="pointer-events-none max-w-[360px]">
                  <TournamentCard t={preview} layout="row" preview />
                </div>
              </div>
            </div>
          </div>
        )}
        {imageError && (
          <p className="mt-3 text-sm font-bold text-lose" role="alert">
            {imageError}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="rounded-[14px] bg-gold/25 p-4 text-sm sm:max-w-xl">
          Once scheduled, a tournament can’t be edited. If something is wrong, delete it and create a new one. Players who paid are marked “refund pending”.
        </p>
        <div className="space-y-2 sm:text-right">
          {error && (
            <p className="text-sm font-bold text-lose" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full px-8 py-3 text-lg sm:w-auto" disabled={busy}>
            {busy ? 'Scheduling…' : 'Schedule tournament'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------- Participants ----------
function toCsv(t, rows) {
  const head = ['Username', 'Email', 'Entry ID', 'Registered at', 'Checked in', 'Placement', 'Amount (INR)', 'Payment status', 'Method', 'Order ID', 'Refunded at'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.username,
      r.email,
      r.entryId,
      new Date(r.registeredAt).toLocaleString('en-IN'),
      r.checkedIn ? 'yes' : 'no',
      r.placement,
      r.payment?.amount ?? 0,
      PAY[r.payment?.status]?.label || 'Free entry',
      r.payment?.method,
      r.payment?.orderId,
      r.payment?.refundedAt ? new Date(r.payment.refundedAt).toLocaleString('en-IN') : '',
    ]
      .map(esc)
      .join(',')
  );
  return [`${esc(t.title)},${esc(formatWhen(t.startsAt))},${esc(STATUS[t.status]?.label)}`, head.map(esc).join(','), ...lines].join('\n');
}

function Participants({ tournamentId, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(
    () =>
      api(`/tournaments/${tournamentId}/participants`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [tournamentId]
  );
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error) return <p className="font-bold text-lose">{error}</p>;
  if (!data) return <p className="text-muted">Loading participants…</p>;
  const { tournament: t, participants: rows } = data;
  const pending = rows.filter((r) => r.payment?.status === 'refund_pending');

  const markRefunded = async (orderId) => {
    const msg = orderId ? 'Mark this payment as refunded? Do this after you’ve sent the money back.' : `Mark all ${pending.length} pending refunds as done?`;
    if (!window.confirm(msg)) return;
    setBusy(orderId || 'all');
    try {
      await api(`/tournaments/${t.id}/refunds`, { method: 'POST', body: orderId ? { orderId } : {} });
      await load();
      onChanged();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    const reason = window.prompt(
      `Delete “${t.title}”?\n\nPlayers can no longer see or enter it${t.status === 'live' ? ', and matches being played now stop immediately' : ''}. Paid entries are marked “refund pending”. This can’t be undone.\n\nOptional note for players:`,
      ''
    );
    if (reason === null) return;
    setBusy('delete');
    try {
      await api(`/tournaments/${t.id}/delete`, { method: 'POST', body: { reason } });
      await load();
      onChanged();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy('');
    }
  };

  const download = () => {
    const blob = new Blob([`﻿${toCsv(t, rows)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-participants.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line p-5">
        <Cover t={t} className="h-16 w-28 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-2xl font-extrabold">{t.title}</h2>
            <StatusBadge status={t.status} />
          </div>
          <p className="text-sm text-muted">
            {GAMES[t.gameId]?.name}, {formatWhen(t.startsAt)}, {inr(t.entryFee)} entry, {rows.length} registered
          </p>
          {t.note && <p className="mt-1 text-sm">{t.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {t.status !== 'deleted' && (
            <Link to={`/tournaments/${t.id}`} className="btn-ghost px-3 py-2 text-sm">
              Open page
            </Link>
          )}
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={download} disabled={!rows.length}>
            Download CSV
          </button>
          {pending.length > 0 && (
            <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => markRefunded(null)} disabled={busy === 'all'}>
              Mark all {pending.length} refunded
            </button>
          )}
          {['upcoming', 'live'].includes(t.status) && (
            <button type="button" className="btn px-3 py-2 text-sm border border-lose text-lose hover:bg-lose hover:text-white" onClick={remove} disabled={busy === 'delete'}>
              Delete tournament
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-muted">Nobody has registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-chalk text-muted">
              <tr>
                {['#', 'Player', 'Email', 'Entry ID', 'Registered', 'Checked in', 'Result', 'Paid', 'Payment', ''].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={r.registrationId} className={r.payment?.status === 'refund_pending' ? 'bg-lose/5' : ''}>
                  <td className="px-4 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 font-bold">{r.username}</td>
                  <td className="px-4 py-2.5">
                    <a href={`mailto:${r.email}`} className="text-court hover:underline">
                      {r.email}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">{r.entryId}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatWhen(r.registeredAt)}</td>
                  <td className="px-4 py-2.5">{r.checkedIn ? 'Yes' : '—'}</td>
                  <td className="px-4 py-2.5">{r.placement || '—'}</td>
                  <td className="px-4 py-2.5 font-bold">{r.payment ? rupees(r.payment.amount) : 'Free'}</td>
                  <td className="px-4 py-2.5">
                    <span className={PAY[r.payment?.status]?.cls}>{PAY[r.payment?.status]?.label || '—'}</span>
                    {r.payment?.orderId && <div className="font-mono text-[11px] text-muted">{r.payment.orderId}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.payment?.status === 'refund_pending' && (
                      <button type="button" className="btn-ghost whitespace-nowrap px-2.5 py-1 text-xs" onClick={() => markRefunded(r.payment.orderId)} disabled={busy === r.payment.orderId}>
                        Mark refunded
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------- Page ----------
export default function Admin() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('list');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api('/tournaments/admin/all')
        .then((d) => setList(d.tournaments))
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    if (user?.role === 'admin') load();
  }, [user?.role, load]);

  const shown = useMemo(() => (list || []).filter((t) => filter === 'all' || t.status === filter), [list, filter]);
  const pendingTotal = (list || []).reduce((s, t) => s + t.money.refundPending, 0);

  if (loading) return null;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold">Admin</h1>
          {pendingTotal > 0 && (
            <p className="mt-1 font-bold text-lose">
              {rupees(pendingTotal)} in refunds still to send. Open a tournament marked “Refund pending” to see who.
            </p>
          )}
        </div>
        <div role="tablist" className="grid w-full grid-cols-3 rounded-[12px] border border-line bg-card p-1 sm:flex sm:w-auto">
          {[
            ['list', 'Tournaments'],
            ['create', 'New tournament'],
            ['hero', 'Homepage'],
          ].map(([v, l]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`rounded-lg px-2 py-2 text-sm font-bold whitespace-nowrap sm:px-4 ${tab === v ? 'bg-ink text-chalk' : 'hover:bg-chalk'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      {tab === 'hero' ? (
        <HeroManager />
      ) : tab === 'create' ? (
        <CreateTournament
          onCreated={(t) => {
            load();
            setTab('list');
            setFilter('all');
            setSelected(t.id);
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={`rounded-full border px-3 py-1 text-sm font-bold ${filter === v ? 'border-ink bg-ink text-chalk' : 'border-line bg-card hover:border-ink'}`}
              >
                {l}
                {list && v !== 'all' && <span className="ml-1 opacity-60">{list.filter((t) => t.status === v).length}</span>}
              </button>
            ))}
          </div>

          {error && <p className="font-bold text-lose">{error}</p>}
          {!list && !error && <p className="text-muted">Loading…</p>}
          {list && shown.length === 0 && <p className="panel p-6 text-muted">No tournaments here.</p>}

          {shown.length > 0 && (
            <ul className="panel divide-y divide-line overflow-hidden">
              {shown.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(selected === t.id ? null : t.id)}
                    aria-expanded={selected === t.id}
                    className={`flex w-full flex-wrap items-center gap-4 p-3 text-left hover:bg-chalk/60 sm:flex-nowrap ${selected === t.id ? 'bg-court/5' : ''}`}
                  >
                    <Cover t={t} className="h-14 w-24 shrink-0 rounded-[10px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold">{t.title}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <div className="text-sm text-muted">
                        {GAMES[t.gameId]?.name}, {formatWhen(t.startsAt)}
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-4 text-right text-sm">
                      <div>
                        <dt className="text-muted">Players</dt>
                        <dd className="font-bold">
                          {t.registeredCount}/{t.maxPlayers}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Collected</dt>
                        <dd className="font-bold">{t.entryFee === 0 ? 'Free' : rupees(t.money.collected)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">To refund</dt>
                        <dd className={`font-bold ${t.money.refundPending ? 'text-lose' : 'text-muted'}`}>
                          {t.money.refundPending ? rupees(t.money.refundPending) : '—'}
                        </dd>
                      </div>
                    </dl>
                  </button>
                  {selected === t.id && (
                    <div className="bg-chalk/60 p-3 sm:p-4">
                      <Participants tournamentId={t.id} onChanged={load} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
