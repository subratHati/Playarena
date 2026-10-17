import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken, setToken, API_URL } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // One socket per logged-in session, shared by matchmaking, matches and lobbies.
  useEffect(() => {
    if (!user) return undefined;
    const s = io(API_URL, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      if (err.message === 'unauthorized') window.dispatchEvent(new Event('pa:session-expired'));
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const d = await api('/auth/register', { method: 'POST', body: { username, email, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Used after a password reset or change: the server returns a fresh login.
  const setSession = useCallback((token, nextUser) => {
    setToken(token);
    setUser(nextUser);
  }, []);

  // Log out everywhere if the server says this login is no longer valid (e.g. password changed elsewhere).
  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('pa:session-expired', onExpired);
    return () => window.removeEventListener('pa:session-expired', onExpired);
  }, [logout]);

  const refresh = useCallback(() => api('/auth/me').then((d) => setUser(d.user)), []);

  const value = useMemo(
    () => ({ user, loading, socket, connected, login, register, logout, refresh, setSession }),
    [user, loading, socket, connected, login, register, logout, refresh, setSession]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
