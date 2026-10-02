import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { SearchBar } from './SearchBar';
export function Header() {
  const router = useRouter(); const { user, ready, signOut } = useAuth(); const { cart } = useCart(); const logout = () => { signOut(); void router.replace('/login'); };
  return <header className="site-header"><div className="header-main"><Link className="brand" href="/"><span>PMT</span><small>Protection My Time</small></Link><div className="header-search"><SearchBar /></div><nav><Link href="/categories">Categories</Link><Link href="/products">Products</Link><Link className="cart-link" href="/cart">Cart <b>{cart?.itemCount || 0}</b></Link>{!ready ? null : user ? <><Link href="/orders">Orders</Link>{user.role === 'CUSTOMER' && <Link href="/profile">Profile</Link>}<span className="welcome">Hi, {user.name.split(' ')[0]}</span><button className="link-button" onClick={logout}>Sign out</button></> : <><Link href="/login">Login</Link><Link className="button small" href="/register">Register</Link></>}</nav></div></header>;
}
