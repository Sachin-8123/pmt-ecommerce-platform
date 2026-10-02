import Link from 'next/link';
import { Layout } from '../components/Layout';
import { roleMeta } from '../lib/roles';
import type { UserRole } from '../lib/types';

const roles: UserRole[] = ['CUSTOMER', 'VENDOR', 'DELIVERY_PARTNER', 'STAFF', 'ADMIN'];
export default function LoginCategoriesPage() { return <Layout><section className="page-heading login-heading"><p className="eyebrow">PMT · Protection My Time</p><h1>Login as</h1><p>Select the workspace you need. Your account’s backend-verified role controls access.</p></section><div className="login-category-grid">{roles.map((role) => { const meta = roleMeta[role]; return <Link className="login-category-card" href={meta.loginPath} key={role}><span>{meta.icon}</span><div><h2>{meta.label}</h2><p>{meta.description}</p></div><b>→</b></Link>; })}</div><p className="login-register">New customer? <Link href="/register">Create a customer account</Link></p></Layout>; }
