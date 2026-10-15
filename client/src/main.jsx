import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Play from './pages/Play';
import MatchPage from './pages/MatchPage';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import EnterTournament from './pages/EnterTournament';
import Lobby from './pages/Lobby';
import Me from './pages/Me';
import Admin from './pages/Admin';
import Auth from './pages/Auth';

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-4 text-4xl font-extrabold">This page doesn’t exist.</h1>
      <Link to="/" className="btn-primary">
        Back to games
      </Link>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="play/:gameId" element={<Play />} />
            <Route path="match/:roomId" element={<MatchPage />} />
            <Route path="tournaments" element={<Tournaments />} />
            <Route path="tournaments/enter" element={<EnterTournament />} />
            <Route path="tournaments/:id" element={<TournamentDetail />} />
            <Route path="tournaments/:id/lobby" element={<Lobby />} />
            <Route path="me" element={<Me />} />
            <Route path="admin" element={<Admin />} />
            <Route path="login" element={<Auth mode="login" />} />
            <Route path="register" element={<Auth mode="register" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
