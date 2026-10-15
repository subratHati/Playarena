import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, formatWhen, inr } from '../lib/api';
import { GAMES } from '../lib/games';
import Countdown from '../components/Countdown';
import Ticket from '../components/Ticket';
import Bracket from '../components/Bracket';
import PaymentModal from '../components/PaymentModal';

const STEPS = [
  ['Book your seat', 'Pay the entry fee. Seats are first come, first served.'],
  ['Keep your pass', 'You get an Entry ID and passkey. They also stay in My entries.'],
  ['Check in', 'Enter with your pass shortly before the start time and wait in the lobby.'],
  ['Play your matches', 'The bracket is drawn at the start time. Win to move on; miss your match and you lose it.'],
];

export default function TournamentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [booking, setBooking] = useState(false);
  const [justPaid, setJustPaid] = useState(false);

  const load = useCallback(
    () =>
      api(`/tournaments/${id}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load, user?.id]);

  if (error) return <p className="panel p-8 text-center font-bold">{error}</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  const t = data.tournament;
  const reg = data.registration;
  const g = GAMES[t.gameId];
  const canBook = t.status === 'upcoming' && t.seatsLeft > 0 && new Date(t.startsAt) > new Date();

  const createOrder = () => api(`/tournaments/${t.id}/checkout`, { method: 'POST' });

  const book = async () => {
    if (!user) return navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    setBooking(true);
    setError('');
    try {
      const d = await createOrder();
      if (d.registration) {
        // Free entry: credentials issued straight away.
        setData((x) => ({ ...x, registration: d.registration }));
        setJustPaid(true);
        load();
      } else setOrder(d);
    } catch (e) {
      if (e.data?.registration) setData((x) => ({ ...x, registration: e.data.registration }));
      else window.alert(e.message);
    } finally {
      setBooking(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this tournament? Everyone who paid is refunded.')) return;
    try {
      await api(`/tournaments/${t.id}/cancel`, { method: 'POST' });
      load();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="space-y-10">
      <Link to="/tournaments" className="text-sm font-bold text-court underline-offset-4 hover:underline">
        All tournaments
      </Link>

      <header className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className={`mb-2 font-bold ${g.text}`}>{g.name}</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">{t.title}</h1>
          <p className="mt-3 text-lg text-muted">{formatWhen(t.startsAt)}</p>
          {t.description && <p className="mt-4 max-w-2xl">{t.description}</p>}
        </div>
        <div>
          {t.status === 'upcoming' && (
            <>
              <p className="mb-1 text-sm text-muted">Starts in</p>
              <Countdown to={t.startsAt} />
            </>
          )}
          {t.status === 'live' && <p className="font-display text-3xl font-extrabold text-lose">Being played now</p>}
          {t.status === 'completed' && (
            <p className="font-display text-3xl font-extrabold">
              {t.winnerName ? (
                <>
                  🏆 {t.winnerName}
                  <span className="block text-base font-normal text-muted">Champion</span>
                </>
              ) : (
                'Finished'
              )}
            </p>
          )}
          {t.status === 'cancelled' && <p className="font-display text-3xl font-extrabold text-muted">Cancelled</p>}
        </div>
      </header>

      {t.note && <p className="rounded-[10px] bg-gold/25 px-4 py-3">{t.note}</p>}

      <dl className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {[
          ['Entry fee', inr(t.entryFee)],
          ['Players', `${t.registeredCount} / ${t.maxPlayers}`],
          ['Format', 'Knockout'],
          ['Reward', t.reward],
        ].map(([k, v]) => (
          <div key={k} className="p-4">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>

      {reg ? (
        <section>
          <h2 className="mb-1 text-2xl font-extrabold">{justPaid ? 'You’re in. Here’s your pass.' : 'Your pass'}</h2>
          <p className="mb-4 text-muted">
            You’ll need this Entry ID and passkey to enter the lobby. Check-in opens{' '}
            {formatWhen(t.checkinOpensAt)}.
          </p>
          <Ticket tournament={t} registration={reg} />
        </section>
      ) : canBook ? (
        <section className="panel flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="text-2xl font-extrabold">Book a seat</h2>
            <p className="text-muted">
              {t.seatsLeft} of {t.maxPlayers} seats left.
            </p>
          </div>
          <button type="button" className="btn-primary px-6 py-3 text-lg" disabled={booking} onClick={book}>
            {t.entryFee === 0 ? 'Join for free' : `Book for ${inr(t.entryFee)}`}
          </button>
        </section>
      ) : (
        t.status === 'upcoming' && <p className="panel p-6 font-bold">Registration is closed — all seats are taken.</p>
      )}

      {t.rounds?.length > 0 ? (
        <section>
          <h2 className="mb-4 text-2xl font-extrabold">Bracket</h2>
          <Bracket rounds={t.rounds} me={user?.username} status={t.status} />
        </section>
      ) : (
        t.status === 'upcoming' && (
          <section>
            <h2 className="mb-4 text-2xl font-extrabold">How it works</h2>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(([h, b], i) => (
                <li key={h} className="panel p-5">
                  <span className="font-display text-3xl font-extrabold text-court">{i + 1}</span>
                  <h3 className="mt-2 mb-1 font-bold">{h}</h3>
                  <p className="text-sm text-muted">{b}</p>
                </li>
              ))}
            </ol>
          </section>
        )
      )}

      {user?.role === 'admin' && t.status === 'upcoming' && (
        <button type="button" className="btn-ghost text-lose" onClick={cancel}>
          Cancel tournament and refund everyone
        </button>
      )}

      {order && (
        <PaymentModal
          order={order}
          createOrder={createOrder}
          tournament={t}
          onClose={() => {
            setOrder(null);
            load();
          }}
          onPaid={(registration) => {
            setOrder(null);
            setJustPaid(true);
            setData((x) => ({ ...x, registration }));
            load();
          }}
        />
      )}
    </div>
  );
}
