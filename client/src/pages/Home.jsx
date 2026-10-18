import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatWhen, inr } from '../lib/api';
import { GAME_LIST, GAMES } from '../lib/games';
import GameArt from '../components/GameArt';
import Countdown from '../components/Countdown';
import Hero, { useHeroSlides } from '../components/Hero';
import CoverImage from '../components/CoverImage';
import { Mivo } from '../components/Brand';
import { tournamentImage } from '../lib/image';

export default function Home() {
  const heroSlides = useHeroSlides();
  const [tournaments, setTournaments] = useState([]);
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    api('/tournaments?status=upcoming,live').then((d) => setTournaments(d.tournaments.slice(0, 4))).catch(() => {});
    api('/leaderboard').then((d) => setLeaders(d.players.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <div className="space-y-12">
      <h1 className="sr-only">MivoPlay: quick games and tournaments</h1>
      <Hero slides={heroSlides} />

      <section aria-labelledby="games-h">
        <h2 id="games-h" className="mb-5 text-3xl font-extrabold">
          Pick a game
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_LIST.map((g) => (
            <li key={g.id} className="flex">
              <Link
                to={`/play/${g.id}`}
                className="group flex w-full items-center gap-4 rounded-[24px] border-[3px] border-ink bg-card p-3 shadow-[0_6px_0_var(--color-ink)] transition-transform hover:-translate-y-1 active:translate-y-1 active:shadow-[0_2px_0_var(--color-ink)] sm:flex-col sm:items-stretch sm:p-4"
              >
                <div className={`flex aspect-square w-24 shrink-0 items-center justify-center overflow-hidden rounded-[18px] ${g.bg} sm:aspect-auto sm:h-44 sm:w-full`}>
                  <GameArt gameId={g.id} className="h-full transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2 motion-reduce:transition-none" />
                </div>
                <div className="flex flex-1 items-end justify-between gap-3 sm:px-1">
                  <div>
                    <h3 className="text-xl font-extrabold sm:text-2xl">{g.name}</h3>
                    <p className="text-muted">{g.tagline}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border-[3px] border-ink ${g.bg} px-4 py-1.5 font-display font-extrabold text-white max-sm:hidden`}>
                    Play
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-3xl font-extrabold">Tournaments</h2>
            <Link to="/tournaments" className="font-bold text-court underline-offset-4 hover:underline">
              See all
            </Link>
          </div>
          {tournaments.length === 0 ? (
            <div className="panel flex items-center gap-4 p-6">
              <Mivo className="h-14 w-14 shrink-0" />
              <p className="text-muted">No tournaments are scheduled right now. Warm up against Mivo while you wait.</p>
            </div>
          ) : (
            <ul className="panel divide-y divide-line">
              {tournaments.map((t) => (
                <li key={t.id}>
                  <Link to={`/tournaments/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-chalk/60">
                    {tournamentImage(t) ? (
                      <CoverImage src={tournamentImage(t)} className="h-14 w-14 shrink-0 rounded-[10px]" />
                    ) : (
                      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-[10px] ${GAMES[t.gameId].bg}`} aria-hidden>
                        <GameArt gameId={t.gameId} className="h-11" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{t.title}</div>
                      <div className="text-sm text-muted">
                        {t.gameName}, {formatWhen(t.startsAt)}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {t.status === 'live' ? (
                        <span className="font-bold text-lose">Live now</span>
                      ) : (
                        <span>
                          Starts in <Countdown to={t.startsAt} compact />
                        </span>
                      )}
                      <div className="text-muted">
                        {inr(t.entryFee)}, {t.seatsLeft} seats left
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside>
          <h2 className="mb-4 text-3xl font-extrabold">Leaderboard</h2>
          {leaders.length === 0 ? (
            <p className="panel p-6 text-muted">Win a match to get on the board.</p>
          ) : (
            <ol className="panel divide-y divide-line">
              {leaders.map((p, i) => (
                <li key={p.username} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 font-display font-extrabold text-muted">{i + 1}</span>
                  <span className="flex-1 truncate font-bold">{p.username}</span>
                  <span className="text-sm text-muted">
                    {p.tournamentsWon > 0 && <b className="text-ink">{p.tournamentsWon} 🏆 </b>}
                    {p.wins}W {p.losses}L
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>
    </div>
  );
}
