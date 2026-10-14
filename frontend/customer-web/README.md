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

`/login` provides category navigation for Customer, Vendor, Delivery Partner, Staff and Admin. Each category uses the same `POST /api/auth/login` endpoint and then reads `GET /api/auth/me`; the returned backend role determines access. The API issues an HttpOnly session cookie, and the browser does not persist a bearer token in local storage. The frontend never trusts the selected category as authorization.

Dashboard placeholders are protected at `/vendor/dashboard`, `/delivery/dashboard`, `/staff/dashboard`, and `/admin/dashboard`. Backend RBAC remains the security boundary for all API data and operations. Public `/register` supports Customer, Vendor, Delivery Partner, Staff, and Admin accounts.

## Standalone animated login

The repository-root `index.html` is a framework-free login page that uses the same API session and role-specific destinations as the web app.

1. Configure and start the API as described in `backend/api/README.md`; use `http://localhost:5000` for the API.
2. Set `FRONTEND_URL=http://localhost:5500` in the API environment (or include that origin in its comma-separated value), then restart the API. The default CORS list also permits the Live Server origin on port 5500.
3. In VS Code, open the root `index.html` with Live Server. Use the `localhost` hostname, not `127.0.0.1`, so the browser can send the session cookie to the API.
4. A confirmed login redirects to the Next.js app on `http://localhost:3000`, using the dashboard associated with the role returned by the API. Run that app with `npm run dev` from this directory.

The API base and app base can be changed in the page's `API_ORIGIN` and `APP_ORIGIN` constants when deploying. For production, serve the page and app from the same site as the API or deliberately configure cross-site cookies and CSRF protections.
