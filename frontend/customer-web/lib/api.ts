const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

// The project-level environment example uses http://localhost:5000, while
// this app owns routes under /api. Accept either form so client requests never
// accidentally target /categories or /products at the backend root.
export const API_URL = configuredApiUrl.endsWith('/api')
  ? configuredApiUrl
  : `${configuredApiUrl}/api`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error response */ }
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    throw new ApiError(response.status, message || 'Something went wrong. Please try again.');
  }
  return body as T;
}

export const money = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(Number(value || 0));

// Keep checkout calls in the shared client. Prices, totals and ownership are
// deliberately never supplied by the browser.
export const addressesApi = {
  list: (token: string) => api<import('./types').Address[]>('/addresses', {}, token),
  create: (input: import('./types').AddressInput, token: string) => api<import('./types').Address>('/addresses', { method: 'POST', body: JSON.stringify(input) }, token),
};
export const checkoutApi = {
  preview: (token: string) => api<import('./types').CheckoutPreview>('/checkout/preview', {}, token),
  createOrder: (addressId: string, token: string) => api<import('./types').Order>('/orders', { method: 'POST', body: JSON.stringify({ addressId }) }, token),
};
export const ordersApi = {
  list: (token: string) => api<import('./types').OrdersResponse>('/orders', {}, token),
  get: (id: string, token: string) => api<import('./types').Order>(`/orders/${id}`, {}, token),
  cancel: (id: string, token: string) => api<import('./types').Order>(`/orders/${id}/cancel`, { method: 'PATCH' }, token),
  delivery: (id: string, token: string) => api<unknown>(`/orders/${id}/delivery`, {}, token),
};
export const paymentsApi = {
  create: (orderId: string, paymentMethod: 'COD' | 'ONLINE', token: string, idempotencyKey: string) => api<import('./types').Payment>('/payments/create', { method: 'POST', body: JSON.stringify({ orderId, paymentMethod }), headers: { 'Idempotency-Key': idempotencyKey } }, token),
  status: (orderId: string, token: string) => api<import('./types').Payment>(`/payments/${orderId}/status`, {}, token),
};
