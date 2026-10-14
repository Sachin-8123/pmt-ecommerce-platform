import { createContext, useContext, useEffect, useState } from 'react';
import { api, COOKIE_SESSION } from './api';
import type { User, UserRole } from './types';

type AuthValue = { user: User | null; token: string | null; role: UserRole | null; authenticated: boolean; ready: boolean; signIn: (user: User) => void; signOut: () => void };
const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = 'pmt_customer_token';
const USER_KEY = 'pmt_customer_user';
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Authentication uses the HttpOnly cookie, not browser storage.
    }
    api<User>('/auth/me')
      .then((currentUser) => {
        setUser(currentUser);
        setToken(COOKIE_SESSION);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);
  const signIn = (nextUser: User) => { setToken(COOKIE_SESSION); setUser(nextUser); };
  const signOut = () => {
    void api<void>('/auth/logout', { method: 'POST', keepalive: true }).catch((error: unknown) => {
      console.error('Unable to clear the PMT server session.', error);
    });
    setToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, token, role: user?.role || null, authenticated: !!user && !!token, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
