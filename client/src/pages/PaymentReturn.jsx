import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { clearPending, confirmPayment, readPending } from '../lib/payments';

// Players land here after paying on PhonePe's or Cashfree's own page.
// We ask the server (which asks the gateway) for the result, then show the pass.
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const orderId = params.get('order') || params.get('order_id')?.split('-')[0] || readPending()?.orderId;
  const [state, setState] = useState({ phase: 'checking', message: 'Checking your payment…' });
  const started = useRef(false);

  useEffect(() => {
    if (loading || !user || !orderId || started.current) return;
    started.current = true;
    const pending = readPending();
    confirmPayment(orderId, {}, { onWaiting: () => setState({ phase: 'checking', message: 'Waiting for the payment provider to confirm…' }) })
      .then((d) => {
        clearPending();
        const tid = d.registration?.tournament?.id || pending?.tournamentId;
        if (tid) navigate(`/tournaments/${tid}`, { replace: true, state: { justPaid: true } });
        else navigate('/me', { replace: true });
      })
      .catch((e) => {
        if (e.status !== 202) clearPending();
        setState({ phase: e.status === 202 ? 'waiting' : 'failed', message: e.message, tournamentId: pending?.tournamentId });
      });
  }, [loading, user, orderId, navigate]);

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/payments/return?order=${orderId || ''}`)}`} replace />;
  if (!orderId) return <Navigate to="/me" replace />;

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="panel space-y-4 p-8">
        {state.phase === 'checking' && <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-court/25 border-t-court" aria-hidden />}
        <h1 className="text-2xl font-extrabold">
          {state.phase === 'checking' ? 'Almost there' : state.phase === 'waiting' ? 'Payment still processing' : 'Payment not completed'}
        </h1>
        <p className="text-muted" role="status">
          {state.message}
        </p>
        {state.phase !== 'checking' && (
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {state.tournamentId && (
              <Link to={`/tournaments/${state.tournamentId}`} className="btn-primary">
                Back to the tournament
              </Link>
            )}
            <Link to="/me" className="btn-ghost">
              My entries
            </Link>
          </div>
        )}
        <p className="text-xs text-muted">Order {orderId}</p>
      </div>
    </div>
  );
}
