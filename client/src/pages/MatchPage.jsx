import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import OnlineMatch from '../components/OnlineMatch';

export default function MatchPage() {
  const { roomId } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="mx-auto max-w-2xl">
      <OnlineMatch roomId={roomId} onExit={(g) => navigate(g ? `/play/${g}` : '/')} exitLabel="Back to game" />
    </div>
  );
}
