import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '../components/Layout';
import { EmptyState, ErrorMessage, Loading } from '../components/State';
import { addressesApi, ApiError, checkoutApi, money, paymentsApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import type { Address, AddressInput, CheckoutPreview } from '../lib/types';

const blank: AddressInput = { name: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '' };
const labels: Record<keyof AddressInput, string> = { name: 'Full name', phone: 'Phone', addressLine1: 'Address line 1', addressLine2: 'Address line 2 (optional)', city: 'City', state: 'State', pincode: 'Postal code' };
const messageFor = (error: unknown) => error instanceof ApiError && error.status === 409 ? 'Some items are no longer available. Please review your cart.' : error instanceof ApiError && error.status === 401 ? 'Please login to continue.' : error instanceof Error ? error.message : 'Unable to connect to the server. Please try again.';

export default function CheckoutPage() {
  const router = useRouter(); const { token, ready } = useAuth(); const { refresh } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null); const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [addressId, setAddressId] = useState(''); const [method, setMethod] = useState<'COD' | 'ONLINE'>('COD'); const [form, setForm] = useState<AddressInput>(blank);
  const [showForm, setShowForm] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const submitting = useRef(false);
  const load = useCallback(async () => {
    if (!token) return;
    try { const [nextAddresses, nextPreview] = await Promise.all([addressesApi.list(token), checkoutApi.preview(token)]); setAddresses(nextAddresses); setPreview(nextPreview); setAddressId((current) => current || nextAddresses[0]?.id || ''); }
    catch (e) { setError(messageFor(e)); }
  }, [token]);
  useEffect(() => { if (!ready) return; if (!token) { router.replace('/login?next=/checkout'); return; } void load(); }, [ready, token, router, load]);
  const addAddress = async (event: FormEvent) => {
    event.preventDefault(); if (!token || busy) return; setBusy(true); setError('');
    try { const address = await addressesApi.create(form, token); setAddresses((current) => [...(current || []), address]); setAddressId(address.id); setForm(blank); setShowForm(false); }
    catch (e) { setError(messageFor(e)); } finally { setBusy(false); }
  };
  const place = async () => {
    if (!token || !addressId || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const currentPreview = await checkoutApi.preview(token); setPreview(currentPreview);
      if (!currentPreview.canCheckout) { setError(currentPreview.issues.join('. ') || 'Some items are no longer available in the requested quantity.'); return; }
      const order = await checkoutApi.createOrder(addressId, token);
      const payment = await paymentsApi.create(order.id, method, token, `checkout-${order.id}-${method}`);
      await refresh(); router.push(`/orders/${order.id}?placed=1&payment=${payment.id}`);
    } catch (e) { setError(messageFor(e)); await load(); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (!ready || !addresses || !preview) return <Layout><Loading label="Loading checkout…" /></Layout>;
  if (!preview.items.length) return <Layout><EmptyState title="Your cart is empty" detail="Add products before checkout." /></Layout>;
  return <Layout><section className="page-heading"><p className="eyebrow">Secure checkout</p><h1>Review your order</h1><p>Prices, availability and totals below are confirmed by PMT.</p></section>{error && <ErrorMessage message={error} />}<div className="checkout-layout"><div><section className="checkout-section"><h2>Delivery address</h2>{addresses.length === 0 && <p className="muted-copy">Add a delivery address to continue.</p>}{addresses.map((address) => <label className={`address-card ${addressId === address.id ? 'chosen' : ''}`} key={address.id}><input type="radio" name="address" checked={addressId === address.id} onChange={() => setAddressId(address.id)} /><span><strong>{address.name}</strong><br />{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}<br />{address.city}, {address.state} — {address.pincode}<br />{address.phone}</span></label>)}<button type="button" className="link-button add-address" onClick={() => setShowForm((value) => !value)}>+ Add a new address</button>{showForm && <form className="address-form" onSubmit={addAddress}>{(Object.keys(blank) as Array<keyof AddressInput>).map((key) => <label key={key}>{labels[key]}<input required={key !== 'addressLine2'} inputMode={key === 'phone' || key === 'pincode' ? 'numeric' : undefined} pattern={key === 'phone' ? '[0-9]{10,15}' : key === 'pincode' ? '[0-9]{4,10}' : undefined} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button></form>}</section><section className="checkout-section"><h2>Payment method</h2><label className={`address-card ${method === 'COD' ? 'chosen' : ''}`}><input type="radio" name="payment" checked={method === 'COD'} onChange={() => setMethod('COD')} /><span><strong>Cash on Delivery</strong><br />Payment remains pending until it is collected during delivery.</span></label><label className={`address-card ${method === 'ONLINE' ? 'chosen' : ''}`}><input type="radio" name="payment" checked={method === 'ONLINE'} onChange={() => setMethod('ONLINE')} /><span><strong>Online payment</strong><br />A backend payment request will be created. This local mock provider has no hosted checkout page.</span></label></section></div><aside className="checkout-summary"><h2>Order summary</h2>{preview.items.map((item) => <p key={item.id}><span>{item.productName} × {item.quantity}{item.vendor?.businessName ? <small>{item.vendor.businessName}</small> : null}</span><strong>{money(item.subtotal)}</strong></p>)}{preview.issues.length > 0 && <ErrorMessage message={preview.issues.join('. ')} />}<p><span>Subtotal</span><strong>{money(preview.subtotal)}</strong></p>{preview.shippingCharge > 0 && <p><span>Shipping</span><strong>{money(preview.shippingCharge)}</strong></p>}<p className="checkout-total"><span>Total</span><strong>{money(preview.total)}</strong></p><button className="button full" disabled={busy || !addressId || !preview.canCheckout} onClick={place}>{busy ? 'Processing…' : 'Place order'}</button></aside></div></Layout>;
}
