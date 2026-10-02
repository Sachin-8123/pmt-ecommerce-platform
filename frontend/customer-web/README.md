# PMT Customer Web

Next.js + TypeScript + Tailwind customer-facing app.

## Customer checkout

Authenticated customers can proceed from Cart to `/checkout`, select or create one of their own delivery addresses, review the server checkout preview, and place a single multi-vendor order. The browser submits only an address ID and payment method; the API remains authoritative for products, inventory, prices and totals.

Supported methods are the backend's Cash on Delivery and online payment request flows. The local `mock` provider creates a pending payment request but has no hosted sandbox checkout; the UI never marks that payment successful. Payment and order status shown in `/orders` and `/orders/[id]` come from the API. Customer cancellation is shown only for statuses the backend allows.

Required environment variable:

- `NEXT_PUBLIC_API_URL` — API origin or API root; defaults to `http://localhost:5000/api`.

Run locally:
  - Copy `.env.example` to `.env.local` and edit if needed
  - npm install
  - npm run dev

Default: http://localhost:3000

The API must be running on port 5000 (or the URL above) and configured with its database and authentication environment variables. Run `npm run build` before release validation.

## Role-based login

`/login` provides category navigation for Customer, Vendor, Delivery Partner, Staff and Admin. Each category uses the same `POST /api/auth/login` endpoint and then reads `GET /api/auth/me`; the returned backend role determines access. The frontend never trusts the selected category as authorization.

Dashboard placeholders are protected at `/vendor/dashboard`, `/delivery/dashboard`, `/staff/dashboard`, and `/admin/dashboard`. Backend RBAC remains the security boundary for all API data and operations. Public `/register` remains customer-only because the existing backend registration endpoint creates the default `CUSTOMER` role.
