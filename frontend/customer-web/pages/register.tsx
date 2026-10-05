import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '../components/Layout';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { roleMeta } from '../lib/roles';
import type { User, UserRole } from '../lib/types';

type AuthResponse = { accessToken: string; user: User };

export default function RegisterPage() {
	const router = useRouter();
	const { signIn } = useAuth();
	const [accountType, setAccountType] = useState<UserRole>('CUSTOMER');
	const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', businessName: '', vehicleType: '', vehicleNumber: '' });
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const result = await api<AuthResponse>('/auth/register', {
				method: 'POST',
				body: JSON.stringify({ ...form, role: accountType }),
			});
			signIn(result.accessToken, result.user);
			router.push(roleMeta[accountType].homePath);
		} catch (e) {
			setError(e instanceof ApiError ? e.message : 'Unable to create your account.');
		} finally {
			setBusy(false);
		}
	};

	const field = (name: keyof typeof form, type = 'text', required = true) => (
		<label>
			{{ name: 'Full name', businessName: 'Business name', vehicleType: 'Vehicle type', vehicleNumber: 'Vehicle number' }[name] || name[0].toUpperCase() + name.slice(1)}
			<input
				type={type}
				autoComplete={name === 'password' ? 'new-password' : name}
				required={required}
				minLength={name === 'password' ? 8 : undefined}
				value={form[name]}
				onChange={(event) => setForm({ ...form, [name]: event.target.value })}
			/>
		</label>
	);

	return (
		<Layout>
			<section className="auth-card">
				<p className="eyebrow">Join the marketplace</p>
				<h1>Create your PMT account</h1>
				<label>
					Account type
					<select
						value={accountType}
						onChange={(event) => setAccountType(event.target.value as UserRole)}
						style={{ width: '100%', padding: 11, border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink)' }}
					>
						<option value="CUSTOMER">Customer</option>
						<option value="VENDOR">Vendor</option>
						<option value="DELIVERY_PARTNER">Delivery Partner</option>
						<option value="STAFF">Staff</option>
						<option value="ADMIN">Admin</option>
					</select>
				</label>
					<form onSubmit={submit}>
						{field('name')}
						{field('email', 'email')}
						{field('phone', 'tel')}
						{field('password', 'password')}
						{accountType === 'VENDOR' && field('businessName')}
						{accountType === 'DELIVERY_PARTNER' && (
							<>
								{field('vehicleType', 'text', false)}
								{field('vehicleNumber', 'text', false)}
							</>
						)}
						<small>Phone must contain 10–15 digits. Password must be at least 8 characters.</small>
						{error && <p className="form-error">{error}</p>}
						<button className="button full" disabled={busy}>
							{busy ? 'Creating account…' : `Create ${roleMeta[accountType].label} account`}
						</button>
					</form>
				<p className="login-register">
					Already have an account? Login as{' '}
					<Link href="/login/customer">Customer</Link> ·{' '}
					<Link href="/login/vendor">Vendor</Link> ·{' '}
					<Link href="/login/delivery">Delivery Partner</Link> ·{' '}
					<Link href="/login/staff">Staff</Link> ·{' '}
					<Link href="/login/admin">Admin</Link>
				</p>
			</section>
		</Layout>
	);
}
