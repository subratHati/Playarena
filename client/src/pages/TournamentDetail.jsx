import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, formatWhen, inr } from '../lib/api';
import { GAMES } from '../lib/games';
import { tournamentImage } from '../lib/image';
import GameArt from '../components/GameArt';
import CoverImage from '../components/CoverImage';
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

// The square poster. Posters are cropped to square when uploaded, so it fills the frame exactly.
export function TournamentPoster({ t, className = '' }) {
  const g = GAMES[t.gameId];
  return (
    <div className={`relative w-full overflow-hidden rounded-[20px] border-[3px] border-ink shadow-[0_6px_0_var(--color-ink)] aspect-square ${className}`}>
      <CoverImage
        src={tournamentImage(t)}
        alt={`${t.title} poster`}
        loading="eager"
        className="h-full w-full"
        fallback={
          <div className={`grid h-full w-full place-items-center ${g.bg}`}>
            <GameArt gameId={t.gameId} className="h-2/3" />
          </div>
        }
      />
      {t.status === 'live' && <span className="absolute top-3 left-3 rounded-full bg-lose px-3 py-1 text-sm font-bold text-white">● Live now</span>}
    </div>
  );
}

function StatusBlock({ t }) {
  if (t.status === 'upcoming')
    return (
      <div className="rounded-[16px] bg-ink p-4 text-chalk sm:p-5">
        <p className="mb-1 text-sm opacity-70">Starts in</p>
        <div className="[&_.text-muted]:text-chalk/60">
          <Countdown to={t.startsAt} />
        </div>
      </div>
    );
  if (t.status === 'live') return <p className="rounded-[16px] bg-lose p-4 font-display text-2xl font-extrabold text-white">Being played now</p>;
  if (t.status === 'completed')
    return (
      <div className="rounded-[16px] bg-gold/30 p-4">
        <p className="font-display text-2xl font-extrabold">{t.winnerName ? `🏆 ${t.winnerName}` : 'Finished'}</p>
        {t.winnerName && <p className="text-sm text-muted">Champion</p>}
      </div>
    );
  return (
    <div className="rounded-[16px] bg-ink/10 p-4">
      <p className="font-display text-2xl font-extrabold">{t.status === 'deleted' ? 'Deleted' : 'Called off'}</p>
      <p className="text-sm text-muted">Paid entries will be refunded</p>
    </div>
  );
}

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
  const canBook = !reg && t.status === 'upcoming' && t.seatsLeft > 0 && new Date(t.startsAt) > new Date();
  const full = !reg && t.status === 'upcoming' && t.seatsLeft === 0;

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

  const remove = async () => {
    const reason = window.prompt(
      `Delete this tournament?${t.status === 'live' ? ' Matches being played now stop immediately.' : ''} Paid entries are marked “refund pending”. This can’t be undone.\n\nOptional note for players:`,
      ''
    );
    if (reason === null) return;
    try {
      await api(`/tournaments/${t.id}/delete`, { method: 'POST', body: { reason } });
      load();
    } catch (e) {
      window.alert(e.message);
    }
  };

  const bookLabel = t.entryFee === 0 ? 'Join for free' : `Book for ${inr(t.entryFee)}`;

  return (
    <div className={`space-y-10 ${canBook ? 'pb-24 sm:pb-0' : ''}`}>
      <Link to="/tournaments" className="text-sm font-bold text-court underline-offset-4 hover:underline">
        ← All tournaments
      </Link>

      <div className={`grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,440px)_1fr]`}>
        {/* Poster: on top on phones, a sticky column on desktop */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <TournamentPoster t={t} />
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className={`mb-1 font-bold ${g.text}`}>{g.name}</p>
            <h1 className="text-3xl leading-tight font-extrabold sm:text-5xl">{t.title}</h1>
            <p className="mt-2 text-muted sm:text-lg">{formatWhen(t.startsAt)}</p>
          </div>

          <StatusBlock t={t} />

          {t.note && <p className="rounded-[10px] bg-gold/25 px-4 py-3">{t.note}</p>}

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line">
            {[
              ['Entry fee', inr(t.entryFee)],
              ['Players', `${t.registeredCount} / ${t.maxPlayers}`],
              ['Format', 'Knockout'],
              ['Reward', t.reward],
            ].map(([k, v]) => (
              <div key={k} className="bg-card p-3 sm:p-4">
                <dt className="text-xs text-muted sm:text-sm">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>

          {t.description && <p className="whitespace-pre-line">{t.description}</p>}

          {canBook && (
            <div className="panel hidden items-center justify-between gap-4 p-5 sm:flex">
              <div>
                <h2 className="text-xl font-extrabold">Book a seat</h2>
                <p className="text-sm text-muted">
                  {t.seatsLeft} of {t.maxPlayers} seats left
                </p>
              </div>
              <button type="button" className="btn-primary px-6 py-3 text-lg" disabled={booking} onClick={book}>
                {bookLabel}
              </button>
            </div>
          )}
          {full && <p className="panel p-5 font-bold">Registration is closed — all seats are taken.</p>}

          {user?.role === 'admin' && ['upcoming', 'live'].includes(t.status) && (
            <div className="flex flex-wrap gap-3 border-t border-line pt-5">
              <Link to="/admin" className="btn-ghost">
                Participants and refunds
              </Link>
              <button type="button" className="btn-ghost text-lose" onClick={remove}>
                Delete tournament
              </button>
            </div>
          )}
        </div>
      </div>

      {reg && (
        <section>
          <h2 className="mb-1 text-2xl font-extrabold">{justPaid ? 'You’re in. Here’s your pass.' : 'Your pass'}</h2>
          <p className="mb-4 text-muted">
            You’ll need this Entry ID and passkey to enter the lobby. Check-in opens {formatWhen(t.checkinOpensAt)}.
            {justPaid && user?.email && ` We’ve also emailed it to ${user.email}, and we’ll remind you before the start.`}
          </p>
          <Ticket tournament={t} registration={reg} />
        </section>
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
            <ol className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {STEPS.map(([h, b], i) => (
                <li key={h} className="panel flex gap-4 p-4 sm:block sm:p-5">
                  <span className="font-display text-3xl leading-none font-extrabold text-court">{i + 1}</span>
                  <div>
                    <h3 className="mb-1 font-bold sm:mt-2">{h}</h3>
                    <p className="text-sm text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )
      )}

      {/* Phones: booking bar stays at the bottom of the screen */}
      {canBook && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 py-3 backdrop-blur sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-xl font-extrabold">{inr(t.entryFee)}</div>
              <div className="text-xs text-muted">{t.seatsLeft} seats left</div>
            </div>
            <button type="button" className="btn-primary px-6 py-3" disabled={booking} onClick={book}>
              {t.entryFee === 0 ? 'Join free' : 'Book a seat'}
            </button>
          </div>
        </div>
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
