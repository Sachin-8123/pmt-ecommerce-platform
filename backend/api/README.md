# PMT Backend API

This folder contains the NestJS backend API for Protection My Time (PMT).

Run locally:
  - Copy `.env.example` to `.env` and set DATABASE_URL and other variables.
  - npm install
  - npm run start:dev

Health-check:
  GET /api/health -> { "status": "ok", "service": "PMT API" }

Authentication API:
  POST /api/auth/register
    { "name": "Sachin", "email": "sachin@example.com", "phone": "9876543210", "password": "Password123" }

  POST /api/auth/login
    { "email": "sachin@example.com", "password": "Password123", "rememberMe": false }

  GET /api/auth/me
    Login and registration set an HttpOnly `pmt_access_token` cookie for browser sessions and continue returning `accessToken` for non-browser integrations.
    Browser requests should send credentials and use the HttpOnly cookie; do not persist the bearer token in browser storage.
    `POST /api/auth/logout` clears the session cookie.

JWT authentication uses the JWT_SECRET environment variable. Sessions expire after one hour by default or 30 days when `rememberMe` is true. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Bearer-token authentication remains supported for integrations.
Validation errors return HTTP 400, duplicate email or phone returns HTTP 409, and invalid or missing credentials return HTTP 401.

Test locally with PowerShell:
  $body = @{ name = 'Sachin'; email = 'sachin@example.com'; phone = '9876543210'; password = 'Password123' } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/auth/register -Method Post -ContentType 'application/json' -Body $body -SessionVariable pmtSession
  Invoke-RestMethod http://localhost:5000/api/auth/me -WebSession $pmtSession
  Invoke-RestMethod http://localhost:5000/api/auth/logout -Method Post -WebSession $pmtSession

Vendor API:
  POST /api/vendors
  GET /api/vendors?page=1&limit=20&search=store&isActive=true
  GET /api/vendors/:id
  PATCH /api/vendors/:id
  POST /api/vendors/:vendorId/staff
  GET /api/vendors/:vendorId/staff
  DELETE /api/vendors/:vendorId/staff/:staffId

All vendor endpoints require `Authorization: Bearer <accessToken>`. ADMIN users can manage every vendor.
The existing database role `VENDOR` is the PMT shop-owner role and can manage only its own vendors.
CUSTOMER and STAFF users cannot create or manage vendors. Vendor staff roles use the existing database enum:
MANAGER, ASSISTANT, CASHIER, or OTHER.

Create vendor example:
  $vendor = @{ businessName = 'Sachin Store'; email = 'store@example.com'; phone = '9876543210'; city = 'Pune'; state = 'Maharashtra'; pincode = '411001' } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/vendors -Method Post -ContentType 'application/json' -Body $vendor -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Add staff example:
  $staff = @{ userId = '<existing-user-id>'; role = 'MANAGER' } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/vendors/<vendor-id>/staff -Method Post -ContentType 'application/json' -Body $staff -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Category API:
  GET /api/categories                         (public; active categories)
  GET /api/categories/:id                     (public; active categories)
  POST /api/categories                        (ADMIN only)
  PATCH /api/categories/:id                   (ADMIN only)
  DELETE /api/categories/:id                  (ADMIN only; blocked while products use it)

Product API:
  GET /api/products?page=1&limit=20&search=phone&vendorId=<id>&categoryId=<id>&minPrice=10&maxPrice=1000&active=true
  GET /api/products/:id                       (public active products)
  POST /api/products                          (ADMIN or VENDOR/shop owner)
  PATCH /api/products/:id                     (ADMIN or owning VENDOR)
  DELETE /api/products/:id                    (soft deactivation)
  PATCH /api/products/:id/stock               (ADMIN or owning VENDOR)

Create product example:
  $product = @{ vendorId = '<vendor-id>'; categoryId = '<category-id>'; name = 'Phone'; sku = 'PHONE-001'; price = 500; sellingPrice = 475; stockQuantity = 10 } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/products -Method Post -ContentType 'application/json' -Body $product -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Adjust stock example:
  $stock = @{ type = 'INCREASE'; quantity = 10 } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/products/<product-id>/stock -Method Patch -ContentType 'application/json' -Body $stock -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Customers and unauthenticated users can view only active categories and products. The existing `VENDOR` role is the PMT shop-owner role.
Product stock uses the existing `Product.stockQuantity` field because the schema has no separate Inventory model. Product deletion deactivates the record to preserve historical references.

Shopping cart API:
  GET /api/cart
  POST /api/cart/items
  PATCH /api/cart/items/:itemId
  DELETE /api/cart/items/:itemId
  DELETE /api/cart

All cart endpoints require `Authorization: Bearer <accessToken>` and the authenticated user must have the `CUSTOMER` role. Cart ownership is derived from the JWT user identity; no `userId` is accepted from clients. ADMIN, VENDOR, and STAFF users receive `403`.

Add item example:
  $item = @{ productId = '<product-id>'; quantity = 2 } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/cart/items -Method Post -ContentType 'application/json' -Body $item -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Update item example:
  $quantity = @{ quantity = 5 } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/cart/items/<item-id> -Method Patch -ContentType 'application/json' -Body $quantity -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Cart totals are calculated on the server from the current product selling price. Adding, updating, removing, or clearing cart items never changes product stock. Invalid quantities return `400`, missing or inactive products return `404`, insufficient stock returns `409`, and missing or invalid JWTs return `401`.

Address API:
  POST /api/addresses
  GET /api/addresses
  GET /api/addresses/:id
  PATCH /api/addresses/:id
  DELETE /api/addresses/:id

Addresses require a JWT and are scoped to the authenticated customer. Address IDs are checked against the authenticated user during checkout.

Checkout and order API:
  GET /api/checkout/preview
  POST /api/orders                         { "addressId": "<address-id>" }
  GET /api/orders?page=1&limit=20&status=CONFIRMED
  GET /api/orders/:id
  PATCH /api/orders/:id/cancel
  GET /api/vendor/orders?page=1&limit=20
  GET /api/admin/orders?page=1&limit=20&status=CONFIRMED&search=<order-id>&vendorId=<vendor-id>

Checkout and customer order endpoints require a CUSTOMER JWT. The preview reports unavailable or under-stocked cart items and blocks checkout until resolved. Order creation reads prices and ownership from PostgreSQL, snapshots each item price, atomically decrements stock, creates the order and items, and clears the cart in one Prisma transaction. Shipping, discount, and tax are currently zero.

Customers can view and cancel only their own eligible orders. ADMIN can view all orders. VENDOR and STAFF can view only order items belonging to their vendor memberships through `/api/vendor/orders` or an authorized order lookup. Orders use the existing lifecycle statuses: PENDING, CONFIRMED, PROCESSING, PACKED, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, and CANCELLED.

Example checkout:
  $address = @{ name = 'Sachin'; phone = '9876543210'; addressLine1 = 'Main Road'; city = 'Pune'; state = 'Maharashtra'; pincode = '411001' } | ConvertTo-Json
  $savedAddress = Invoke-RestMethod http://localhost:5000/api/addresses -Method Post -ContentType 'application/json' -Body $address -Headers @{ Authorization = "Bearer $($auth.accessToken)" }
  Invoke-RestMethod http://localhost:5000/api/checkout/preview -Headers @{ Authorization = "Bearer $($auth.accessToken)" }
  $order = @{ addressId = $savedAddress.id } | ConvertTo-Json
  Invoke-RestMethod http://localhost:5000/api/orders -Method Post -ContentType 'application/json' -Body $order -Headers @{ Authorization = "Bearer $($auth.accessToken)" }

Payment integration:
  POST /api/payments/create       { "orderId": "<order-id>", "paymentMethod": "ONLINE" }
  POST /api/payments/retry        { "orderId": "<order-id>", "paymentMethod": "ONLINE" }
  POST /api/payments/verify       { "paymentId": "<payment-id>", "providerOrderId": "...", "providerPaymentId": "...", "signature": "..." }
  POST /api/payments/webhook      provider event with `x-payment-signature`
  GET /api/payments/:orderId/status
  GET /api/payments/order/:orderId
  GET /api/admin/payments/order/:orderId

Payments use a replaceable provider abstraction. Local development defaults to the `mock` provider and uses `PAYMENT_WEBHOOK_SECRET` for HMAC verification. Configure `PAYMENT_PROVIDER=mock`, `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, and `PAYMENT_WEBHOOK_SECRET` in `.env`; credentials are never returned or logged. The `.env.example` file contains placeholders only.

Payment amounts always come from the server-side order total. ONLINE payments remain `PENDING` until signature verification or a valid webhook marks them `PAID`; successful payment moves the order to `CONFIRMED`. Failed payments remain retryable and do not delete the order. COD creates a `PENDING` payment without calling an online provider and cannot be marked collected by the customer.

Payment creation supports the optional `Idempotency-Key` header. Webhook event IDs are unique and repeated events are acknowledged without repeating state changes. No card number, CVV, PIN, or other payment credential is stored. Inventory is deducted only during order creation and is never deducted again by payment processing.

Delivery partner and delivery API:
  POST /api/delivery-partners                         (ADMIN; register an existing DELIVERY_PARTNER user)
  GET /api/delivery-partners?page=1&limit=20&status=AVAILABLE
  PATCH /api/delivery-partners/:id/status
  POST /api/deliveries                                (ADMIN or authorized vendor)
  GET /api/deliveries/:id
  PATCH /api/deliveries/:id/assign
  PATCH /api/deliveries/:id/status
  PATCH /api/deliveries/:id/pickup
  PATCH /api/deliveries/:id/out-for-delivery
  PATCH /api/deliveries/:id/complete                  { "confirmation": true }
  PATCH /api/deliveries/:id/fail                      { "reason": "Customer unavailable" }
  GET /api/delivery-partners/me/deliveries?page=1&limit=20&status=ASSIGNED
  GET /api/orders/:orderId/delivery
  GET /api/vendor/deliveries
  GET /api/admin/deliveries

Delivery lifecycle:
  PENDING -> ASSIGNED -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED
  PENDING/ASSIGNED/PICKED_UP/OUT_FOR_DELIVERY may transition to FAILED; PENDING or ASSIGNED may be CANCELLED.

ADMIN manages partners and all deliveries. VENDOR/STAFF can manage deliveries only for their vendor order items. DELIVERY_PARTNER can update only their own assigned delivery. CUSTOMER can view delivery details only for their own order. Assignment atomically marks a partner BUSY; completion atomically marks the delivery and order DELIVERED and makes the partner AVAILABLE. COD orders are eligible for delivery without cash collection in this module.

GPS tracking API:
  POST /api/deliveries/:id/location
  GET /api/deliveries/:id/location
  GET /api/deliveries/:id/locations?limit=100
  GET /api/deliveries/:id/tracking

Only the assigned DELIVERY_PARTNER can post coordinates. Customers, assigned partners, relevant vendors/staff, and ADMIN can read authorized delivery locations. Coordinates are validated server-side, location history is bounded to 500 records per request, completed/failed/cancelled deliveries reject updates, and stale state uses `GPS_LOCATION_STALE_SECONDS`.

Real-time tracking uses Socket.IO namespace `/tracking` with a JWT in `auth.token` or `Authorization: Bearer <token>`:
  `delivery.join` -> `{ deliveryId }`
  `delivery.leave` -> `{ deliveryId }`
  `delivery.location.update` -> `{ deliveryId, latitude, longitude, accuracy, heading, speed }`
  `delivery.location.updated` is broadcast only to authorized subscribers in `delivery:<deliveryId>`.

Configure `GPS_UPDATE_MIN_INTERVAL_MS` and `GPS_LOCATION_STALE_SECONDS` in `.env`. Invalid or expired socket JWTs are disconnected, and unauthorized room joins are rejected.

Maps / Geocoding / ETA API:
  POST /api/maps/geocode           { "address": "Hyderabad, Telangana" }
  GET  /api/maps/reverse-geocode?latitude=17.3850&longitude=78.4867
  GET  /api/maps/distance?originLatitude=17.3850&originLongitude=78.4867&destinationLatitude=28.6139&destinationLongitude=77.2090
  GET  /api/maps/route?originLatitude=...&originLongitude=...&destinationLatitude=...&destinationLongitude=...
  GET  /api/deliveries/:id/eta

All maps endpoints require `Authorization: Bearer <accessToken>`. ADMIN and all authenticated users can use geocoding/distance/route. Delivery ETA authorization follows the same rules as delivery location access.

Maps provider abstraction:
  MAPS_PROVIDER=mock (default, no external API key required, uses Haversine formula)
  MAPS_PROVIDER=osm  (OpenStreetMap Nominatim, no key needed, rate-limited to ~1 req/s)
  MAPS_PROVIDER=google / mapbox (future — requires MAPS_API_KEY)

The mock provider returns deterministic pseudo-coordinates and uses the Haversine formula for accurate straight-line distances at 30 km/h average urban speed. All mock responses clearly identify themselves as estimates. The OSM provider calls Nominatim for geocoding and falls back to mock for routing.

Delivery ETA integrates with the live GPS location from DeliveryLocation and the stored order address coordinates. Destination coordinates always come from the authenticated database record, never from client input. If no GPS location exists, latestLocation is null and ETA fields are null. If the delivery is completed or cancelled, isStale is true and no ETA is calculated. A stale threshold is configurable via GPS_LOCATION_STALE_SECONDS.

To configure a real maps provider later:
  1. Set MAPS_PROVIDER=google or MAPS_PROVIDER=mapbox in .env
  2. Set MAPS_API_KEY=<your-key>
  3. Implement a new class matching the MapsProvider interface in src/maps/providers/
  4. Register it in the createMapsProvider() factory in osm.provider.ts
  Never commit API keys to source control.

Test maps locally with PowerShell:
  $token = Invoke-RestMethod http://localhost:5000/api/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"user@example.com","password":"Password123"}' | Select-Object -ExpandProperty accessToken
  Invoke-RestMethod 'http://localhost:5000/api/maps/geocode' -Method Post -ContentType 'application/json' -Body '{"address":"Hyderabad, India"}' -Headers @{ Authorization = "Bearer $token" }
  Invoke-RestMethod 'http://localhost:5000/api/maps/reverse-geocode?latitude=17.3850&longitude=78.4867' -Headers @{ Authorization = "Bearer $token" }
  Invoke-RestMethod 'http://localhost:5000/api/maps/distance?originLatitude=17.3850&originLongitude=78.4867&destinationLatitude=17.4&destinationLongitude=78.5' -Headers @{ Authorization = "Bearer $token" }
  Invoke-RestMethod 'http://localhost:5000/api/maps/route?originLatitude=17.3850&originLongitude=78.4867&destinationLatitude=17.4&destinationLongitude=78.5' -Headers @{ Authorization = "Bearer $token" }
  Invoke-RestMethod 'http://localhost:5000/api/deliveries/<delivery-id>/eta' -Headers @{ Authorization = "Bearer $token" }

Run automated maps tests (requires running server):
  npx ts-node src/maps/test-maps.ts
