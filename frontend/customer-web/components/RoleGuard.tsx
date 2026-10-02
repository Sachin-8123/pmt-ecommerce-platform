import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { roleMeta } from '../lib/roles';
import { useAuth } from '../lib/auth';
import type { UserRole } from '../lib/types';
import { Loading } from './State';

export function RoleGuard({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const router = useRouter(); const { user, ready } = useAuth();
  useEffect(() => { if (ready && !user) void router.replace(`${roleMeta[role].loginPath}?next=${encodeURIComponent(router.asPath)}`); }, [ready, user, role, router]);
  if (!ready || !user) return <Loading label="Checking your account…" />;
  if (user.role !== role) return <section className="auth-card access-denied"><p className="eyebrow">Access restricted</p><h1>Permission denied</h1><p>You do not have permission to access the {roleMeta[role].label} dashboard.</p><Link className="button full" href={roleMeta[user.role].loginPath}>Go to {roleMeta[user.role].label} Login</Link></section>;
  return <>{children}</>;
}
