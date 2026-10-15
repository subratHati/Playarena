import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, formatWhen, inr } from '../lib/api';
import { GAMES } from '../lib/games';
import Ticket from '../components/Ticket';

const PAY_STATUS = { paid: 'Paid', failed: 'Failed', refunded: 'Refunded', created: 'Not completed' };

export default function Me() {
  const { user, loading, refresh } = useAuth();
  const [regs, setRegs] = useState(null);
  const [matches, setMatches] = useState([]);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    if (!user) return;
    refresh().catch(() => {});
    api('/tournaments/me/registrations').then((d) => setRegs(d.registrations)).catch(() => setRegs([]));
    api('/matches/me').then((d) => setMatches(d.matches)).catch(() => {});
    api('/payments/me').then((d) => setPayments(d.payments)).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;
  if (!user) return <Navigate to="/login?next=/me" replace />;

  const active = regs?.filter((r) => ['upcoming', 'live'].includes(r.tournament.status)) || [];
  const past = regs?.filter((r) => !['upcoming', 'live'].includes(r.tournament.status)) || [];
  const s = user.stats;

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-4xl font-extrabold">{user.username}</h1>
        <dl className="mt-4 flex flex-wrap gap-8">
          {[
            ['Wins', s.wins],
            ['Losses', s.losses],
            ['Draws', s.draws],
            ['Tournaments won', s.tournamentsWon],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="font-display text-3xl font-extrabold">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section>
        <h2 className="mb-4 text-2xl font-extrabold">Your passes</h2>
        {!regs ? (
          <p className="text-muted">Loading…</p>
        ) : active.length === 0 ? (
          <p className="panel p-6 text-muted">
            You haven’t booked an upcoming tournament.{' '}
            <Link to="/tournaments" className="font-bold text-court underline-offset-4 hover:underline">
              Browse tournaments
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            {active.map((r) => (
              <Ticket key={r.id} tournament={r.tournament} registration={r} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Past tournaments</h2>
          <ul className="panel divide-y divide-line">
            {past.map((r) => (
              <li key={r.id}>
                <Link to={`/tournaments/${r.tournament.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-chalk/60">
                  <span>
                    <b>{r.tournament.title}</b>
                    <span className="block text-sm text-muted">
                      {GAMES[r.tournament.gameId].name}, {formatWhen(r.tournament.startsAt)}
                    </span>
                  </span>
                  <span className="text-sm font-bold">
                    {r.tournament.status === 'cancelled' ? 'Cancelled, refunded' : r.placement || 'Finished'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Recent online matches</h2>
          {matches.length === 0 ? (
            <p className="panel p-6 text-muted">Play someone online and your results show up here.</p>
          ) : (
            <ul className="panel divide-y divide-line">
              {matches.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className={`w-12 font-bold ${m.outcome === 'win' ? 'text-win' : m.outcome === 'loss' ? 'text-lose' : 'text-muted'}`}>
                    {m.outcome === 'win' ? 'Won' : m.outcome === 'loss' ? 'Lost' : 'Draw'}
                  </span>
                  <span className="flex-1">
                    {GAMES[m.gameId]?.name} vs <b>{m.opponent}</b>
                    {m.kind === 'tournament' && <span className="text-muted"> (tournament)</span>}
                    {['forfeit', 'walkover'].includes(m.reason) && <span className="text-muted"> by {m.reason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Payments</h2>
          {payments.length === 0 ? (
            <p className="panel p-6 text-muted">No payments yet.</p>
          ) : (
            <ul className="panel divide-y divide-line">
              {payments.map((p) => (
                <li key={p.orderId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <b>{p.tournament}</b>
                    <span className="block text-muted">{formatWhen(p.createdAt)}</span>
                  </span>
                  <span className="text-right">
                    <b>{inr(p.amount)}</b>
                    <span className={`block ${p.status === 'paid' ? 'text-win' : 'text-muted'}`}>{PAY_STATUS[p.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
