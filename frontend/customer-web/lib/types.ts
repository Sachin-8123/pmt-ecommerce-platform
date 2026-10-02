export type Category = { id: string; name: string; description?: string | null; imageUrl?: string | null };
export type Product = {
  id: string; name: string; description?: string | null; price: number; sellingPrice: number;
  stockQuantity: number; imageUrl?: string | null; category?: Category | null;
  vendor?: { id: string; businessName: string } | null;
};
export type ProductsResponse = { data: Product[]; total: number; page: number; limit: number };
export type UserRole = 'CUSTOMER' | 'VENDOR' | 'DELIVERY_PARTNER' | 'STAFF' | 'ADMIN';
export type User = { id: string; name: string; email: string; role: UserRole };
export type Cart = {
  id: string; itemCount: number; subtotal: number;
  items: Array<{ id: string; quantity: number; subtotal: number; available: boolean; product: { id: string; name: string; price: number; imageUrl?: string | null; vendor?: { businessName: string } } }>;
};
export type Address = { id: string; name: string; phone: string; addressLine1: string; addressLine2?: string | null; city: string; state: string; pincode: string };
export type AddressInput = Omit<Address, 'id'>;
export type CheckoutPreview = { items: Array<{ id: string; productId: string; productName: string; vendor?: { businessName: string } | null; quantity: number; unitPrice: number; subtotal: number; available: boolean }>; subtotal: number; shippingCharge: number; discount: number; tax: number; total: number; canCheckout: boolean; issues: string[] };
export type OrderItem = { id: string; productId: string; productName: string; vendorName?: string; quantity: number; unitPrice: number; subtotal: number };
export type Order = { id: string; orderNumber: string; status: string; paymentStatus?: string; items: OrderItem[]; subtotal: number; shippingCharge: number; discount: number; tax: number; total: number; address: Address; createdAt: string };
export type OrdersResponse = { data: Order[]; page: number; limit: number; total: number };
export type Payment = { id: string; orderId: string; provider: string; providerOrderId?: string | null; paymentMethod: 'COD' | 'ONLINE'; currency: string; amount: number; status: string; paidAt?: string | null };
