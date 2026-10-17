import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, passKey } from '../lib/api';

export default function EnterTournament() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [entryId, setEntryId] = useState(params.get('entryId') || '');
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/tournaments/enter')}`} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/tournaments/enter', { method: 'POST', body: { entryId, passkey } });
      sessionStorage.setItem(passKey(d.tournamentId), d.token);
      navigate(`/tournaments/${d.tournamentId}/lobby`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-4xl font-extrabold">Enter a tournament</h1>
      <p className="mt-2 mb-6 text-muted">
        Use the Entry ID and passkey from your pass. You can find them anytime in{' '}
        <Link to="/me" className="font-bold text-court underline-offset-4 hover:underline">
          My entries
        </Link>
        .
      </p>
      <form onSubmit={submit} className="panel space-y-4 p-6">
        <div>
          <label htmlFor="entryId" className="label">
            Entry ID
          </label>
          <input
            id="entryId"
            className="field font-display text-lg tracking-wider uppercase"
            placeholder="MV-TTT-XXXXXX"
            value={entryId}
            onChange={(e) => setEntryId(e.target.value.toUpperCase())}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label htmlFor="passkey" className="label">
            Passkey
          </label>
          <input
            id="passkey"
            className="field font-display text-lg tracking-wider uppercase"
            placeholder="8 characters"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value.toUpperCase())}
            autoComplete="off"
            maxLength={8}
            required
            autoFocus={Boolean(entryId)}
          />
        </div>
        {error && (
          <p className="text-sm font-bold text-lose" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Checking…' : 'Enter lobby'}
        </button>
      </form>
    </div>
  );
}
