import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pathAllowedFor, roleMeta } from '../lib/roles';
import type { User, UserRole } from '../lib/types';

type AuthResponse = { accessToken: string; user: User };
const friendlyError = (error: unknown) => error instanceof ApiError && error.status === 401 ? 'Invalid email or password.' : error instanceof ApiError && error.status === 403 ? 'This account does not have permission to sign in here.' : error instanceof ApiError ? error.message : 'Unable to connect to PMT server.';
export function RoleLoginForm({ role }: { role: UserRole }) {
  const router = useRouter(); const { signIn } = useAuth(); const meta = roleMeta[role]; const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [wrongRole, setWrongRole] = useState<UserRole | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); setWrongRole(null);
    try { const result = await api<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); const user = await api<User>('/auth/me', {}, result.accessToken); signIn(result.accessToken, user); if (user.role !== role) { setWrongRole(user.role); return; } const requested = typeof router.query.next === 'string' ? router.query.next : ''; void router.push(requested && pathAllowedFor(requested, user.role) ? requested : meta.homePath); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  return <section className="auth-card"><p className="eyebrow">PMT · Protection My Time</p><h1>Login as {meta.label}</h1><p className="auth-description">{meta.description}</p><form onSubmit={submit}><label>Email<input type="email" autoComplete="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required minLength={8} disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}{wrongRole && <div className="role-warning">This account is registered as <strong>{roleMeta[wrongRole].label}</strong>. Please use {roleMeta[wrongRole].label} Login.<Link className="button full" href={roleMeta[wrongRole].loginPath}>Go to {roleMeta[wrongRole].label} Login</Link></div>}<button className="button full" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button></form><p><Link href="/login">Back to Login Categories</Link></p></section>;
}
