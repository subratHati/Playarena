import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Auth({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next')?.startsWith('/') ? params.get('next') : '/';
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.username, form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const other = `${isLogin ? '/register' : '/login'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-4xl font-extrabold">{isLogin ? 'Log in' : 'Create your account'}</h1>
      <p className="mt-2 mb-6 text-muted">
        {isLogin ? 'Play online and join tournaments.' : 'Pick a username other players will see.'}
      </p>
      <form onSubmit={submit} className="panel space-y-4 p-6">
        {!isLogin && (
          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input id="username" className="field" value={form.username} onChange={set('username')} autoComplete="username" required pattern="[A-Za-z0-9_]{3,20}" title="3–20 letters, numbers or underscores" />
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">
            {isLogin ? 'Email or username' : 'Email'}
          </label>
          <input id="email" type={isLogin ? 'text' : 'email'} className="field" value={form.email} onChange={set('email')} autoComplete={isLogin ? 'username' : 'email'} required />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input id="password" type="password" className="field" value={form.password} onChange={set('password')} autoComplete={isLogin ? 'current-password' : 'new-password'} required minLength={isLogin ? 1 : 8} />
          {!isLogin && <p className="mt-1 text-sm text-muted">At least 8 characters.</p>}
        </div>
        {isLogin && (
          <p className="-mt-2 text-right text-sm">
            <Link to="/forgot-password" className="font-bold text-court underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </p>
        )}
        {error && (
          <p className="text-sm font-bold text-lose" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        {isLogin ? 'New here? ' : 'Already have an account? '}
        <Link to={other} className="font-bold text-court underline-offset-4 hover:underline">
          {isLogin ? 'Create an account' : 'Log in'}
        </Link>
      </p>
    </div>
  );
}
