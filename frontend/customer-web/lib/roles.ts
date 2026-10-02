import type { UserRole } from './types';

export const roleMeta: Record<UserRole, { label: string; loginPath: string; homePath: string; description: string; icon: string }> = {
  CUSTOMER: { label: 'Customer', loginPath: '/login/customer', homePath: '/', description: 'Shop products, manage orders and track deliveries.', icon: '👤' },
  VENDOR: { label: 'Vendor', loginPath: '/login/vendor', homePath: '/vendor/dashboard', description: 'Manage products, inventory and shop orders.', icon: '🏪' },
  DELIVERY_PARTNER: { label: 'Delivery Partner', loginPath: '/login/delivery', homePath: '/delivery/dashboard', description: 'Manage assigned deliveries and delivery status.', icon: '🚚' },
  STAFF: { label: 'Staff', loginPath: '/login/staff', homePath: '/staff/dashboard', description: 'Manage operations for your assigned vendor.', icon: '👨‍💼' },
  ADMIN: { label: 'Admin', loginPath: '/login/admin', homePath: '/admin/dashboard', description: 'Manage the PMT platform.', icon: '🔐' },
};

export const pathAllowedFor = (path: string, role: UserRole) => {
  if (role === 'CUSTOMER') return !/^\/(admin|vendor|staff|delivery)(\/|$)/.test(path);
  return path.startsWith(roleMeta[role].homePath);
};
