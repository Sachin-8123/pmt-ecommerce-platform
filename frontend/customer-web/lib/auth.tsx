import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import type { User, UserRole } from './types';

type AuthValue = { user: User | null; token: string | null; role: UserRole | null; authenticated: boolean; ready: boolean; signIn: (token: string, user: User) => void; signOut: () => void };
const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = 'pmt_customer_token';
const USER_KEY = 'pmt_customer_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    if (!savedToken || !savedUser) { setReady(true); return; }
    try { setToken(savedToken); setUser(JSON.parse(savedUser)); } catch { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
    api<User>('/auth/me', {}, savedToken).then(setUser).catch(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setToken(null); setUser(null); }).finally(() => setReady(true));
  }, []);
  const signIn = (nextToken: string, nextUser: User) => { localStorage.setItem(TOKEN_KEY, nextToken); localStorage.setItem(USER_KEY, JSON.stringify(nextUser)); setToken(nextToken); setUser(nextUser); };
  const signOut = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); setToken(null); setUser(null); };
  return <AuthContext.Provider value={{ user, token, role: user?.role || null, authenticated: !!user && !!token, ready, signIn, signOut }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth must be used inside AuthProvider'); return value; }
