import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import type { Cart } from './types';

type CartValue = { cart: Cart | null; loading: boolean; refresh: () => Promise<void>; setCart: (cart: Cart) => void };
const CartContext = createContext<CartValue | null>(null);
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token, role, ready } = useAuth(); const [cart, setCart] = useState<Cart | null>(null); const [loading, setLoading] = useState(false);
  const refresh = async () => { if (!token || role !== 'CUSTOMER') { setCart(null); return; } setLoading(true); try { setCart(await api<Cart>('/cart', {}, token)); } catch { setCart(null); } finally { setLoading(false); } };
  useEffect(() => { if (ready) refresh(); }, [token, role, ready]);
  return <CartContext.Provider value={{ cart, loading, refresh, setCart }}>{children}</CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('useCart must be used inside CartProvider'); return value; }
