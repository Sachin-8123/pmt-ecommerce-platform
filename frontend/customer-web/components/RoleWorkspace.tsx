import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, money } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { UserRole } from '../lib/types';
import { Layout } from './Layout';
import { RoleGuard } from './RoleGuard';
import { EmptyState, ErrorMessage, Loading } from './State';

type Result = { data?: any[]; total?: number; page?: number; limit?: number };

type DeliverySummary = {
  id: string;
  orderId: string;
  status: string;
  address?: any;
  deliveryPartner?: any;
  vendorItemCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

const nav: Record<Exclude<UserRole, 'CUSTOMER'>, Array<[string, string]>> = {
  VENDOR: [['Dashboard', 'dashboard'], ['Products', 'products'], ['Inventory', 'inventory'], ['Orders', 'orders'], ['Staff', 'staff'], ['Reports', 'reports'], ['Settings', 'settings']],
  DELIVERY_PARTNER: [['Dashboard', 'dashboard'], ['Assigned Deliveries', 'deliveries'], ['Active Delivery', 'active'], ['History', 'history'], ['Tracking', 'tracking'], ['Profile', 'profile']],
  STAFF: [['Dashboard', 'dashboard'], ['Products', 'products'], ['Inventory', 'inventory'], ['Orders', 'orders'], ['Customers', 'customers'], ['Profile', 'profile']],
  ADMIN: [['Dashboard', 'dashboard'], ['Vendors', 'vendors'], ['Delivery Partners', 'delivery-partners'], ['Categories', 'categories'], ['Products', 'products'], ['Inventory', 'inventory'], ['Orders', 'orders'], ['Deliveries', 'deliveries'], ['Reports', 'reports'], ['Audit Logs', 'audit-logs'], ['Settings', 'settings']],
};

const endpoint = (role: Exclude<UserRole, 'CUSTOMER'>, section: string) => {
  if (role === 'DELIVERY_PARTNER') {
    if (['deliveries', 'active', 'history', 'tracking', 'dashboard'].includes(section)) return '/delivery-partners/me/deliveries?limit=100';
    if (section === 'profile') return null;
    return null;
  }
  if (section === 'products' || section === 'inventory') return '/products?limit=100';
  if (section === 'orders') return role === 'ADMIN' ? '/admin/orders?limit=100' : '/vendor/orders?limit=100';
  if (section === 'deliveries') return role === 'ADMIN' ? '/admin/deliveries?limit=100' : '/vendor/deliveries?limit=100';
  if (section === 'vendors') return '/vendors?limit=100';
  if (section === 'delivery-partners') return '/delivery-partners?limit=100';
  if (section === 'categories') return '/categories?limit=100';
  return null;
};

const normalizeDeliveries = (payload: Result | null | undefined): DeliverySummary[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as DeliverySummary[];
  if (Array.isArray(payload.data)) return payload.data as DeliverySummary[];
  return [];
};

const formatStatus = (status?: string) => {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const safeAddress = (address?: any) => {
  if (!address) return 'Pickup address unavailable';
  const parts = [address.addressLine1, address.addressLine2, address.city, address.state, address.pincode].filter(Boolean);
  return parts.join(', ') || 'Address unavailable';
};

export function RoleWorkspace({ role, section = 'dashboard' }: { role: Exclude<UserRole, 'CUSTOMER'>; section?: string }) {
  const { token, user, signOut } = useAuth();
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const target = useMemo(() => {
    const sectionKey = section === 'dashboard' ? (role === 'DELIVERY_PARTNER' ? 'dashboard' : 'orders') : section;
    return endpoint(role, sectionKey);
  }, [role, section]);

  useEffect(() => {
    if (!token || user?.role !== role || !target) {
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api<Result>(target, {}, token)
      .then((payload) => {
        if (!cancelled) setResult(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError && err.status === 403
            ? 'You do not have permission to access this section.'
            : 'Unable to load this section right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user?.role, role, target, refreshKey]);

  const title = nav[role].find(([, key]) => key === section)?.[0] || 'Dashboard';
  const base = role === 'DELIVERY_PARTNER' ? 'delivery' : role.toLowerCase();

  const renderDashboard = () => {
    if (role === 'DELIVERY_PARTNER') {
      return <DeliveryDashboard token={token} initialData={result} onRefresh={() => setRefreshKey((value) => value + 1)} />;
    }

    if (section === 'profile') {
      return <ProfilePanel user={user} signOut={signOut} routeBack={() => router.push(`/${base}/dashboard`)} />;
    }

    return <GenericWorkspaceView title={title} result={result} section={section} role={role} />;
  };

  return (
    <Layout>
      <RoleGuard role={role}>
        <div className="role-shell">
          <aside className="role-sidebar">
            <p className="eyebrow">{role.replace('_', ' ')}</p>
            {nav[role].map(([label, key]) => (
              <Link className={key === section ? 'active' : ''} href={key === 'dashboard' ? `/${base}/dashboard` : `/${base}/${key}`} key={key}>
                {label}
              </Link>
            ))}
          </aside>

          <section className="role-content">
            <section className="page-heading compact">
              <div>
                <p className="eyebrow">PMT workspace</p>
                <h1>{title}</h1>
              </div>
            </section>

            {loading ? <Loading label="Loading workspace…" /> : error ? <ErrorMessage message={error} /> : !target ? <EmptyState title="This workspace section is not enabled." detail="The existing backend API for this role section is not available." /> : renderDashboard()}
          </section>
        </div>
      </RoleGuard>
    </Layout>
  );
}

function DeliveryDashboard({ token, initialData, onRefresh }: { token: string | null; initialData: Result | null; onRefresh: () => void }) {
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>(normalizeDeliveries(initialData));
  const [routeDetails, setRouteDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    const list = normalizeDeliveries(initialData);
    setDeliveries(list);
    if (!token || !list.length) {
      setRouteDetails({});
      return;
    }
    setLoading(true);
    setError('');

    Promise.all(
      list.map(async (delivery) => {
        const address = delivery.address;
        if (typeof address?.latitude !== 'number' || typeof address?.longitude !== 'number') {
          return { deliveryId: delivery.id, route: null };
        }
        try {
          return { deliveryId: delivery.id, route: await api<any>(`/deliveries/${delivery.id}/route`, {}, token) };
        } catch {
          return { deliveryId: delivery.id, route: null };
        }
      })
    )
      .then((results) => {
        const nextRoutes: Record<string, any> = {};
        results.forEach((resultEntry) => {
          if (resultEntry.route) nextRoutes[resultEntry.deliveryId] = resultEntry.route;
        });
        setRouteDetails(nextRoutes);
      })
      .catch(() => setError('Unable to load assigned delivery details.'))
      .finally(() => setLoading(false));
  }, [initialData, token]);

  const pendingCount = deliveries.filter((entry) => entry.status === 'PENDING').length;
  const assignedCount = deliveries.filter((entry) => entry.status === 'ASSIGNED').length;
  const pickedUpCount = deliveries.filter((entry) => entry.status === 'PICKED_UP').length;
  const deliveredCount = deliveries.filter((entry) => entry.status === 'DELIVERED').length;
  const activeCount = deliveries.filter((entry) => ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(entry.status)).length;

  const performAction = async (delivery: DeliverySummary, action: 'pickup' | 'outForDelivery' | 'complete') => {
    if (!token) return;
    setActionBusy(delivery.id);
    const route = {
      pickup: `/deliveries/${delivery.id}/pickup`,
      outForDelivery: `/deliveries/${delivery.id}/out-for-delivery`,
      complete: `/deliveries/${delivery.id}/complete`,
    }[action];

    try {
      await api(route, { method: 'PATCH', body: JSON.stringify({}) }, token);
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The delivery action failed.');
    } finally {
      setActionBusy(null);
    }
  };

  if (!token) return <EmptyState title="Delivery dashboard unavailable" detail="Please log in again to view your assigned deliveries." />;
  if (loading && !deliveries.length) return <Loading label="Loading assigned deliveries…" />;
  if (error) return <ErrorMessage message={error} />;
  if (!deliveries.length) return <EmptyState title="No deliveries assigned" detail="You do not currently have any delivery assignments." />;

  return (
    <div className="delivery-dashboard">
      <div className="dashboard-header-card">
        <div>
          <p className="eyebrow">Delivery partner</p>
          <h2>{useAuth().user?.name || 'Delivery partner'}</h2>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="button small" onClick={() => window.location.assign('/delivery/profile')}>Profile</button>
          <button type="button" className="outline-button small-button" onClick={() => { useAuth().signOut(); void useRouter().push('/login'); }}>Logout</button>
        </div>
      </div>

      <div className="metric-grid delivery-metrics">
        <section className="dashboard-card"><p>Today</p><h2>{deliveries.length}</h2></section>
        <section className="dashboard-card"><p>Pending</p><h2>{pendingCount}</h2></section>
        <section className="dashboard-card"><p>Picked up</p><h2>{pickedUpCount}</h2></section>
        <section className="dashboard-card"><p>Delivered</p><h2>{deliveredCount}</h2></section>
      </div>

      <div className="delivery-summary-row">
        <span>Assigned: {assignedCount}</span>
        <span>Active: {activeCount}</span>
      </div>

      <div className="delivery-list">
        {deliveries.map((delivery) => {
          const route = routeDetails[delivery.id];
          const customerName = delivery.address?.name || 'Customer';
          const customerPhone = delivery.address?.phone || 'No phone number';
          const destinationText = safeAddress(delivery.address);
          const routeNote = route?.note || (route?.isStale ? 'GPS data is stale; route is still displayed for reference.' : '');

          return (
            <article className="delivery-order-card" key={delivery.id}>
              <div className="delivery-card-main">
                <div className="delivery-order-topline">
                  <div>
                    <p className="eyebrow">Order</p>
                    <h3>{delivery.orderId ? delivery.orderId.slice(0, 12) : 'Order'}</h3>
                  </div>
                  <span className={`badge status-${delivery.status.toLowerCase()}`}>{formatStatus(delivery.status)}</span>
                </div>

                <div className="delivery-contact-grid">
                  <div>
                    <p className="mini-label">Customer</p>
                    <strong>{customerName}</strong>
                    <small>{customerPhone}</small>
                  </div>
                  <div>
                    <p className="mini-label">Pickup</p>
                    <strong>Pickup details unavailable</strong>
                    <small>Not provided by the delivery API</small>
                  </div>
                  <div>
                    <p className="mini-label">Destination</p>
                    <strong>{customerName}</strong>
                    <small>{destinationText}</small>
                  </div>
                </div>

                <div className="delivery-meta-grid">
                  <div><p className="mini-label">Items</p><strong>{delivery.vendorItemCount ?? '—'}</strong></div>
                  <div><p className="mini-label">Order</p><strong>{delivery.orderId.slice(0, 12)}</strong></div>
                  <div><p className="mini-label">Status</p><strong>{formatStatus(delivery.status)}</strong></div>
                </div>

                <div className="delivery-actions">
                  {delivery.status === 'PENDING' && <button type="button" className="button small" disabled>Accept Order</button>}
                  {delivery.status === 'ASSIGNED' && <button type="button" className="button small" disabled={actionBusy === delivery.id} onClick={() => performAction(delivery, 'pickup')}>{actionBusy === delivery.id ? 'Processing…' : 'Order Received'}</button>}
                  {delivery.status === 'PICKED_UP' && <button type="button" className="button small" disabled={actionBusy === delivery.id} onClick={() => performAction(delivery, 'outForDelivery')}>{actionBusy === delivery.id ? 'Processing…' : 'Out for Delivery'}</button>}
                  {delivery.status === 'OUT_FOR_DELIVERY' && <button type="button" className="button small" disabled={actionBusy === delivery.id} onClick={() => performAction(delivery, 'complete')}>{actionBusy === delivery.id ? 'Processing…' : 'Delivered'}</button>}
                  {delivery.status === 'DELIVERED' && <button type="button" className="outline-button small-button" disabled>Delivered</button>}
                </div>
              </div>

              <div className="delivery-map-panel">
                <div className="map-header">
                  <strong>Live route</strong>
                  {route && route.origin && route.destination && (
                    <a href={`https://www.google.com/maps/dir/?api=1&origin=${route.origin.latitude},${route.origin.longitude}&destination=${route.destination.latitude},${route.destination.longitude}`} target="_blank" rel="noreferrer">Navigate</a>
                  )}
                </div>
                {route ? (
                  <>
                    <div className="mini-map" aria-label="Delivery route map">
                      <span className="map-point map-partner" style={{ left: '18%', top: '65%' }} />
                      <span className="map-point map-destination" style={{ left: '78%', top: '30%' }} />
                      <span className="route-line" style={{ left: '18%', top: '65%', width: '60%' }} />
                    </div>
                    <div className="map-meta">
                      <span>{route?.provider ? `Provider: ${route.provider}` : 'Provider unavailable'}</span>
                      <span>{route?.isStale ? 'GPS stale' : 'GPS live'}</span>
                    </div>
                    <small>{routeNote || 'Route data is ready'}</small>
                  </>
                ) : (
                  <div className="map-empty">No live route is available yet. Missing destination coordinates or GPS data will be handled safely here.</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProfilePanel({ user, signOut, routeBack }: { user: any; signOut: () => void; routeBack: () => void }) {
  return (
    <div className="auth-card compact-card">
      <p className="eyebrow">Profile</p>
      <h1>{user?.name || 'Workspace user'}</h1>
      <p className="auth-description">{user?.email || 'Unknown email'}</p>
      <p className="auth-description">Role: {user?.role || 'Unknown'}</p>
      <div className="delivery-actions" style={{ marginTop: '18px' }}>
        <button type="button" className="button small" onClick={routeBack}>Back to dashboard</button>
        <button type="button" className="outline-button small-button" onClick={() => { signOut(); void useRouter().push('/login'); }}>Logout</button>
      </div>
    </div>
  );
}

function GenericWorkspaceView({ title, result, section, role }: { title: string; result: Result | null; section: string; role: Exclude<UserRole, 'CUSTOMER'> }) {
  const items = Array.isArray(result?.data) ? result.data : [];
  if (!items.length) return <EmptyState title={`No ${title.toLowerCase()} found.`} detail="The backend returned no accessible records for this workspace." />;

  return (
    <div className="workspace-list">
      {items.map((item: any) => (
        <section className="dashboard-card" key={item.id || item.orderNumber || item.name || item.businessName || item.email || Math.random().toString()}>
          <strong>{item.name || item.businessName || item.orderNumber || item.id}</strong>
          <p>{item.status || item.email || item.description || item.phone || 'PMT workspace record'}</p>
          {item.stockQuantity !== undefined && <p>Stock: {item.stockQuantity}</p>}
          {item.total !== undefined && <p>Total: {money(item.total)}</p>}
          {item.address && <p>{safeAddress(item.address)}</p>}
          {item.paymentStatus && <p>Payment status: {formatStatus(item.paymentStatus)}</p>}
          {item.vendorName && <p>Vendor: {item.vendorName}</p>}
        </section>
      ))}
    </div>
  );
}

