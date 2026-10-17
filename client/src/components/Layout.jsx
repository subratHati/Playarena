import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mivo, Wordmark } from './Brand';

const navClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-bold transition-colors ${isActive ? 'bg-ink text-chalk' : 'text-ink hover:bg-ink/5'}`;

export default function Layout() {
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const [resume, setResume] = useState(null);
  const [open, setOpen] = useState(false);

  // Offer to jump back into an unfinished online match after a refresh.
  useEffect(() => {
    if (!socket) return undefined;
    const onResume = (d) => setResume(d);
    socket.on('match:resume-available', onResume);
    return () => socket.off('match:resume-available', onResume);
  }, [socket]);

  const links = (
    <>
      <NavLink to="/" end className={navClass} onClick={() => setOpen(false)}>
        Games
      </NavLink>
      <NavLink to="/tournaments" className={navClass} onClick={() => setOpen(false)}>
        Tournaments
      </NavLink>
      <NavLink to="/tournaments/enter" className={navClass} onClick={() => setOpen(false)}>
        Enter with pass
      </NavLink>
      {user && (
        <NavLink to="/me" className={navClass} onClick={() => setOpen(false)}>
          My entries
        </NavLink>
      )}
      {user?.role === 'admin' && (
        <NavLink to="/admin" className={navClass} onClick={() => setOpen(false)}>
          Admin
        </NavLink>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-chalk/90 backdrop-blur supports-[backdrop-filter]:bg-chalk/75 sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-xl" aria-label="MivoPlay home">
            <Mivo className="h-9 w-9" />
            <Wordmark />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">{links}</nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm sm:inline">
                  Signed in as <b>{user.username}</b>
                </span>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost px-3 py-1.5 text-sm">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary px-3 py-1.5 text-sm">
                  Sign up
                </Link>
              </>
            )}
            <button
              type="button"
              className="btn-ghost px-2.5 py-1.5 md:hidden"
              aria-expanded={open}
              aria-label="Menu"
              onClick={() => setOpen((o) => !o)}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        {open && <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">{links}</nav>}
      </header>

      {resume && (
        <div className="bg-gold">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className="font-bold">You have an unfinished {resume.kind === 'tournament' ? 'tournament ' : ''}match.</span>
            <button
              type="button"
              className="rounded-lg bg-ink px-3 py-1 font-bold text-chalk"
              onClick={() => {
                setResume(null);
                navigate(`/match/${resume.roomId}`);
              }}
            >
              Go back to it
            </button>
            <button type="button" className="ml-auto underline" onClick={() => setResume(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-6 text-sm text-muted">
          <Wordmark />
          <span>Tournament rewards are badges and leaderboard places — no cash prizes.</span>
        </div>
      </footer>
    </div>
  );
}
