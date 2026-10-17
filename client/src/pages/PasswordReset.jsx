import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(d.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-4xl font-extrabold">Reset your password</h1>
      <p className="mt-2 mb-6 text-muted">Enter the email you signed up with and we’ll send you a link.</p>
      {sent ? (
        <div className="panel p-6" role="status">
          <p className="font-bold">Check your email</p>
          <p className="mt-1 text-muted">{sent}</p>
          <p className="mt-4 text-sm">
            The link expires in 1 hour.{' '}
            <button type="button" className="font-bold text-court underline-offset-4 hover:underline" onClick={() => setSent('')}>
              Send it again
            </button>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          {error && (
            <p className="text-sm font-bold text-lose" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="font-bold text-court underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords don’t match');
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setSession(d.token, d.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="panel mx-auto max-w-sm p-6 text-center">
        <p className="mb-4 font-bold">This reset link is incomplete. Open the link from your email again, or ask for a new one.</p>
        <Link to="/forgot-password" className="btn-primary">
          Ask for a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-4xl font-extrabold">Choose a new password</h1>
      <p className="mt-2 mb-6 text-muted">You’ll be logged in, and logged out on your other devices.</p>
      <form onSubmit={submit} className="panel space-y-4 p-6">
        <div>
          <label htmlFor="new" className="label">
            New password
          </label>
          <input id="new" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          <p className="mt-1 text-sm text-muted">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            Type it again
          </label>
          <input id="confirm" type="password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        {error && (
          <p className="text-sm font-bold text-lose" role="alert">
            {error}{' '}
            {/expired|invalid/i.test(error) && (
              <Link to="/forgot-password" className="text-court underline">
                Ask for a new link
              </Link>
            )}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}

export function ChangePassword() {
  const { setSession } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (form.newPassword !== form.confirm) return setError('The two new passwords don’t match');
    setBusy(true);
    setError('');
    try {
      const d = await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      setSession(d.token, d.user);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg('Password changed. You’ve been logged out on your other devices.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="panel max-w-md space-y-4 p-6">
      <div>
        <label htmlFor="cur" className="label">
          Current password
        </label>
        <input id="cur" type="password" className="field" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" required />
      </div>
      <div>
        <label htmlFor="np" className="label">
          New password
        </label>
        <input id="np" type="password" className="field" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label htmlFor="cp" className="label">
          Type the new password again
        </label>
        <input id="cp" type="password" className="field" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" minLength={8} required />
      </div>
      {error && (
        <p className="text-sm font-bold text-lose" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-sm font-bold text-win" role="status">
          {msg}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
