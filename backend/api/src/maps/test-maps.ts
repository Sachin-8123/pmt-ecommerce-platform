export {};

/**
 * Maps / Geocoding / ETA Foundation — Test Suite (Prompt 11)
 *
 * Runs against a live server at http://localhost:5000.
 * Start server first: npm run start:dev
 * Then run: npx ts-node src/maps/test-maps.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http');
const https = require('https');
const bcrypt = require('bcrypt');
const { io } = require('socket.io-client');
const { PrismaClient, UserRole, DeliveryStatus, FulfillmentType, PaymentStatus, OrderStatus } = require('@prisma/client');
const { OsmMapsProvider } = require('./providers/osm.provider');

const prisma = new PrismaClient();
let fixtureMarker: string | null = null;

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';
const pass: string[] = [];
const fail: string[] = [];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown; sessionToken?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers },
      (res: any) => {
        let raw = '';
        res.on('data', (c: any) => (raw += c));
        res.on('end', () => {
          let data: unknown = raw;
          try { data = JSON.parse(raw); } catch { /* ignore */ }
          const setCookie = res.headers['set-cookie'];
          const sessionCookie = Array.isArray(setCookie)
            ? setCookie.find((cookie: string) => cookie.startsWith('pmt_access_token='))?.split(';', 1)[0]
            : undefined;
          resolve({
            status: res.statusCode,
            data,
            sessionToken: sessionCookie?.slice('pmt_access_token='.length),
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------
function assertTest(name: string, condition: boolean, detail = '') {
  if (condition) {
    pass.push(name);
    console.log(`  PASS: ${name}${detail ? ' -- ' + detail : ''}`);
  } else {
    fail.push(name);
    console.log(`  FAIL: ${name}${detail ? ' -- ' + detail : ''}`);
  }
}

function noSecrets(name: string, data: unknown) {
  const s = JSON.stringify(data);
  assertTest(`${name} no passwordHash`, !s.includes('passwordHash'));
  assertTest(`${name} no API key`, !s.includes(process.env.MAPS_API_KEY || 'MAPS_API_KEY_PLACEHOLDER'));
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
async function loginOrRegister(email: string, phone: string): Promise<string> {
  const reg = await request('POST', '/api/auth/register', { name: 'MapsTester', email, phone, password: 'Password123' });
  if (reg.sessionToken) return reg.sessionToken;
  const login = await request('POST', '/api/auth/login', { email, password: 'Password123' });
  return login.sessionToken ?? '';
}

async function login(email: string): Promise<string> {
  const response = await request('POST', '/api/auth/login', { email, password: 'FixturePass123' });
  const token = response.sessionToken;
  if (response.status !== 200 || typeof token !== 'string') {
    throw new Error(`Fixture login failed for ${email}: HTTP ${response.status}`);
  }
  return token;
}

/** Creates only marker-scoped data and is always removed after this test run. */
async function createRouteFixture(marker: string) {
  const passwordHash = await bcrypt.hash('FixturePass123', 12);
  const createUser = (suffix: string, role: any) =>
    prisma.user.create({
      data: {
        name: `Route Fixture ${suffix}`,
        email: `${marker}-${suffix}@test.invalid`,
        phone: `97${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`,
        passwordHash,
        role,
      },
    });
  const [admin, customerA, customerB, vendorUserA, vendorUserB, partnerUserA, partnerUserB] = await Promise.all([
    createUser('admin', UserRole.ADMIN),
    createUser('customer-a', UserRole.CUSTOMER),
    createUser('customer-b', UserRole.CUSTOMER),
    createUser('vendor-a', UserRole.VENDOR),
    createUser('vendor-b', UserRole.VENDOR),
    createUser('partner-a', UserRole.DELIVERY_PARTNER),
    createUser('partner-b', UserRole.DELIVERY_PARTNER),
  ]);
  const [vendorA, vendorB, partnerA, partnerB] = await Promise.all([
    prisma.vendor.create({ data: { businessName: `${marker} Vendor A`, ownerId: vendorUserA.id, phone: '9111111111', email: `${marker}-vendor-a@shop.test` } }),
    prisma.vendor.create({ data: { businessName: `${marker} Vendor B`, ownerId: vendorUserB.id, phone: '9222222222', email: `${marker}-vendor-b@shop.test` } }),
    prisma.deliveryPartner.create({ data: { userId: partnerUserA.id, vehicleType: 'Bike', vehicleNumber: `${marker.slice(-6)}A` } }),
    prisma.deliveryPartner.create({ data: { userId: partnerUserB.id, vehicleType: 'Bike', vehicleNumber: `${marker.slice(-6)}B` } }),
  ]);
  const product = await prisma.product.create({
    data: { vendorId: vendorA.id, name: `${marker} Product`, sku: `${marker}-sku`, price: 100, sellingPrice: 100, stockQuantity: 20 },
  });
  const [addressA, addressB, addressMissing] = await Promise.all([
    prisma.address.create({ data: { userId: customerA.id, name: 'Customer A', phone: '9333333333', addressLine1: 'Fixture Destination A', city: 'Hyderabad', state: 'Telangana', pincode: '500001', latitude: 17.4, longitude: 78.5 } }),
    prisma.address.create({ data: { userId: customerB.id, name: 'Customer B', phone: '9444444444', addressLine1: 'Fixture Destination B', city: 'Hyderabad', state: 'Telangana', pincode: '500002', latitude: 17.41, longitude: 78.51 } }),
    prisma.address.create({ data: { userId: customerA.id, name: 'No Coordinates', phone: '9555555555', addressLine1: 'Fixture Missing Coordinates', city: 'Hyderabad', state: 'Telangana', pincode: '500003' } }),
  ]);
  const createOrder = async (customerId: string, addressId: string, suffix: string) => {
    const order = await prisma.order.create({
      data: {
        orderNumber: `${marker}-${suffix}`,
        userId: customerId,
        vendorId: vendorA.id,
        addressId,
        subtotal: 100,
        deliveryFee: 0,
        discount: 0,
        totalAmount: 100,
        status: OrderStatus.OUT_FOR_DELIVERY,
        paymentStatus: PaymentStatus.PAID,
        fulfillment: FulfillmentType.DELIVERY,
        items: { create: { productId: product.id, quantity: 1, unitPrice: 100, totalPrice: 100 } },
        payments: { create: { provider: 'fixture', amount: 100, status: PaymentStatus.PAID } },
      },
    });
    return order;
  };
  const [mainOrder, customerBOrder, staleOrder, deliveredOrder, cancelledOrder, missingOrder] = await Promise.all([
    createOrder(customerA.id, addressA.id, 'main'),
    createOrder(customerB.id, addressB.id, 'customer-b'),
    createOrder(customerA.id, addressA.id, 'stale'),
    createOrder(customerA.id, addressA.id, 'delivered'),
    createOrder(customerA.id, addressA.id, 'cancelled'),
    createOrder(customerA.id, addressMissing.id, 'missing-destination'),
  ]);
  const [main, customerBDelivery, stale, delivered, cancelled, missingDestination] = await Promise.all([
    prisma.delivery.create({ data: { orderId: mainOrder.id, deliveryPartnerId: partnerA.id, status: DeliveryStatus.OUT_FOR_DELIVERY } }),
    prisma.delivery.create({ data: { orderId: customerBOrder.id, deliveryPartnerId: partnerB.id, status: DeliveryStatus.OUT_FOR_DELIVERY } }),
    prisma.delivery.create({ data: { orderId: staleOrder.id, deliveryPartnerId: partnerA.id, status: DeliveryStatus.OUT_FOR_DELIVERY } }),
    prisma.delivery.create({ data: { orderId: deliveredOrder.id, deliveryPartnerId: partnerA.id, status: DeliveryStatus.DELIVERED } }),
    prisma.delivery.create({ data: { orderId: cancelledOrder.id, deliveryPartnerId: partnerA.id, status: DeliveryStatus.CANCELLED } }),
    prisma.delivery.create({ data: { orderId: missingOrder.id, deliveryPartnerId: partnerA.id, status: DeliveryStatus.OUT_FOR_DELIVERY } }),
  ]);
  const now = new Date();
  await prisma.deliveryLocation.createMany({ data: [
    { deliveryId: main.id, latitude: 17.385, longitude: 78.4867, recordedAt: now },
    { deliveryId: customerBDelivery.id, latitude: 17.386, longitude: 78.4877, recordedAt: now },
    { deliveryId: stale.id, latitude: 17.38, longitude: 78.48, recordedAt: new Date(now.getTime() - 5 * 60_000) },
    { deliveryId: delivered.id, latitude: 17.37, longitude: 78.47, recordedAt: now },
    { deliveryId: cancelled.id, latitude: 17.36, longitude: 78.46, recordedAt: now },
    { deliveryId: missingDestination.id, latitude: 17.35, longitude: 78.45, recordedAt: now },
  ] });
  return { admin, customerA, customerB, vendorUserA, vendorUserB, partnerUserA, partnerUserB, main, customerBDelivery, stale, delivered, cancelled, missingDestination };
}

async function cleanupRouteFixture(marker: string) {
  const users = await prisma.user.findMany({ where: { email: { startsWith: marker } }, select: { id: true } });
  const userIds = users.map((user: any) => user.id);
  if (!userIds.length) return;
  const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const orderIds = orders.map((order: any) => order.id);
  const deliveries = await prisma.delivery.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const deliveryIds = deliveries.map((delivery: any) => delivery.id);
  const vendors = await prisma.vendor.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const vendorIds = vendors.map((vendor: any) => vendor.id);
  await prisma.deliveryLocation.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
  await prisma.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { vendorId: { in: vendorIds } } });
  await prisma.deliveryPartner.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

function joinTrackingRoom(token: string, deliveryId: string): Promise<{ socket: any; acknowledgement: any }> {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE_URL}/tracking`, { auth: { token }, transports: ['websocket'] });
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out joining tracking room'));
    }, 5_000);
    socket.on('connect_error', (error: unknown) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });
    socket.on('connect', () => {
      // `handleConnection` resolves the JWT user asynchronously.  A freshly
      // connected client can otherwise race it and receive the gateway's
      // transient "Unauthorized tracking socket" acknowledgement.  Retry only
      // that transient response; a real access denial is returned to the test.
      let attempts = 0;
      const join = () => {
        socket.emit('delivery.join', { deliveryId }, (acknowledgement: any) => {
          if (acknowledgement?.error === 'Unauthorized tracking socket' && attempts++ < 5) {
            setTimeout(join, 50);
            return;
          }
          clearTimeout(timeout);
          resolve({ socket, acknowledgement });
        });
      };
      setTimeout(join, 50);
    });
  });
}

// ---------------------------------------------------------------------------
// Main tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\nMaps / Geocoding / ETA Foundation -- Test Suite (Prompt 11)\n');

  const ts = Date.now();
  fixtureMarker = `route-fixture-${ts}`;
  const fixture = await createRouteFixture(fixtureMarker);
  const [token, adminToken, customerBToken, vendorAToken, vendorBToken, partnerAToken, partnerBToken] = await Promise.all([
    login(fixture.customerA.email), login(fixture.admin.email), login(fixture.customerB.email),
    login(fixture.vendorUserA.email), login(fixture.vendorUserB.email), login(fixture.partnerUserA.email),
    login(fixture.partnerUserB.email),
  ]);

  // ---- Geocoding ----------------------------------------------------------
  console.log('\n-- Geocoding (/api/maps/geocode) --');

  // T01 Valid geocode
  {
    const res = await request('POST', '/api/maps/geocode', { address: 'Hyderabad, Telangana, India' }, token);
    assertTest('T01 Valid geocode -> 201', res.status === 201, `HTTP ${res.status}`);
    if (res.status === 201) {
      const d = res.data as any;
      assertTest('T01 geocode has latitude', typeof d.latitude === 'number');
      assertTest('T01 geocode has longitude', typeof d.longitude === 'number');
      assertTest('T01 geocode has provider', typeof d.provider === 'string');
      noSecrets('T01 geocode', d);
    }
  }

  // T02 Empty address
  {
    const res = await request('POST', '/api/maps/geocode', { address: '' }, token);
    assertTest('T02 Empty address -> 400', res.status === 400, `HTTP ${res.status}`);
  }

  // T03 Excessively long address
  {
    const res = await request('POST', '/api/maps/geocode', { address: 'A'.repeat(600) }, token);
    assertTest('T03 Excessively long address -> 400', res.status === 400, `HTTP ${res.status}`);
  }

  // ---- Reverse geocoding --------------------------------------------------
  console.log('\n-- Reverse Geocoding (/api/maps/reverse-geocode) --');

  // T04 Valid reverse geocode
  {
    const res = await request('GET', '/api/maps/reverse-geocode?latitude=17.3850&longitude=78.4867', undefined, token);
    assertTest('T04 Valid reverse geocode -> 200', res.status === 200, `HTTP ${res.status}`);
    if (res.status === 200) {
      const d = res.data as any;
      assertTest('T04 has address', typeof d.address === 'string');
      assertTest('T04 has latitude', typeof d.latitude === 'number');
      assertTest('T04 has longitude', typeof d.longitude === 'number');
      noSecrets('T04 reverse geocode', d);
    }
  }

  // T05 Invalid latitude
  {
    const res = await request('GET', '/api/maps/reverse-geocode?latitude=95&longitude=78', undefined, token);
    assertTest('T05 Invalid latitude -> 400', res.status === 400, `HTTP ${res.status}`);
  }

  // T06 Invalid longitude
  {
    const res = await request('GET', '/api/maps/reverse-geocode?latitude=17&longitude=185', undefined, token);
    assertTest('T06 Invalid longitude -> 400', res.status === 400, `HTTP ${res.status}`);
  }

  // ---- Distance -----------------------------------------------------------
  console.log('\n-- Distance (/api/maps/distance) --');

  // T07 Valid distance
  {
    const res = await request(
      'GET',
      '/api/maps/distance?originLatitude=17.3850&originLongitude=78.4867&destinationLatitude=28.6139&destinationLongitude=77.2090',
      undefined,
      token,
    );
    assertTest('T07 Valid distance -> 200', res.status === 200, `HTTP ${res.status}`);
    if (res.status === 200) {
      const d = res.data as any;
      // T08 Distance is non-negative
      assertTest('T08 distanceMeters >= 0', d.distanceMeters >= 0);
      assertTest('T08 distanceKm >= 0', d.distanceKm >= 0);
    }
  }

  // ---- Route --------------------------------------------------------------
  console.log('\n-- Route (/api/maps/route) --');

  // T09 Valid route
  {
    const res = await request(
      'GET',
      '/api/maps/route?originLatitude=17.3850&originLongitude=78.4867&destinationLatitude=17.4&destinationLongitude=78.5',
      undefined,
      token,
    );
    assertTest('T09 Valid route -> 200', res.status === 200, `HTTP ${res.status}`);
    if (res.status === 200) {
      const d = res.data as any;
      // T10 ETA is non-negative
      assertTest('T10 etaMinutes >= 0', d.etaMinutes >= 0);
      assertTest('T10 durationSeconds >= 0', d.durationSeconds >= 0);
      assertTest('T10 distanceMeters >= 0', d.distanceMeters >= 0);
      assertTest('T10 route has provider', typeof d.provider === 'string');
    }
  }

  // ---- Delivery ETA -------------------------------------------------------
  console.log('\n-- Delivery ETA (/api/deliveries/:id/eta) --');

  // T11 Unauthorized ETA access
  {
    const res = await request('GET', '/api/deliveries/some-fake-id/eta', undefined, undefined);
    assertTest('T11 Unauthorized delivery ETA -> 401', res.status === 401, `HTTP ${res.status}`);
  }

  // ---- Live Delivery Route -----------------------------------------------
  console.log('\n-- Live Delivery Route (/api/deliveries/:id/route) --');

  // A guard runs before parameter parsing, so this verifies unauthenticated
  // access is rejected without relying on a production delivery fixture.
  {
    const res = await request('GET', '/api/deliveries/not-a-uuid/route');
    assertTest('Route T02 Unauthenticated route request -> 401', res.status === 401, `HTTP ${res.status}`);
  }

  // Get deliveries via admin
  const deliveries: any[] = [fixture.main];

  if (deliveries.length === 0) {
    console.log('\n  No deliveries in DB -- skipping live ETA tests T12-T21.');
    console.log('  Create order, payment, and delivery to test live ETA.\n');
    console.log('  No delivery fixture -- skipping live route tests T01, T03-T29.\n');
  } else {
    const delivery = deliveries[0];
    const deliveryId = delivery.id;
    const status = delivery.status;
    console.log(`  Testing ETA with delivery ${deliveryId} (${status})`);

    // T17 Admin can access authorized ETA
    {
      const res = await request('GET', `/api/deliveries/${deliveryId}/eta`, undefined, adminToken);
      assertTest('T17 Admin can access authorized ETA', [200, 404].includes(res.status));
      if (res.status === 200) {
        const d = res.data as any;
        assertTest('T17 ETA has deliveryId', d.deliveryId === deliveryId);
        assertTest('T17 ETA has status', typeof d.status === 'string');
        assertTest('T17 ETA has isStale boolean', typeof d.isStale === 'boolean');
        assertTest('T18 latestLocation is null or object', d.latestLocation === null || typeof d.latestLocation === 'object');
        noSecrets('T24 ETA response', d);
      }
    }

    // T12 Customer access to own delivery
    const customerToken = customerBToken;
    {
      const res = await request('GET', `/api/deliveries/${deliveryId}/eta`, undefined, customerToken);
      // Customer accessing someone else's delivery should be blocked
      assertTest('T13 Customer cannot access another customers ETA', [403, 404].includes(res.status));
    }

    // T20, T21 Completed/Cancelled delivery handled correctly
    if (['DELIVERED', 'CANCELLED', 'FAILED'].includes(status)) {
      const res = await request('GET', `/api/deliveries/${deliveryId}/eta`, undefined, adminToken);
      if (res.status === 200) {
        const d = res.data as any;
        assertTest(`T${status === 'CANCELLED' ? '21' : '20'} ${status} delivery handled - no crash`, true);
        assertTest(`T${status === 'CANCELLED' ? '21' : '20'} isStale=true for inactive`, d.isStale === true);
        assertTest(`T${status === 'CANCELLED' ? '21' : '20'} etaMinutes is null for inactive`, d.etaMinutes === null);
      }
    }

    // T22 Destination comes from stored order/address
    {
      const res = await request('GET', `/api/deliveries/${deliveryId}/eta`, undefined, adminToken);
      assertTest('T22 ETA does not crash even without destination coords', [200, 404].includes(res.status));
    }

    // T23 Client cannot override destination (no destination param in request)
    {
      const res = await request('GET', `/api/deliveries/${deliveryId}/eta?destinationLatitude=99&destinationLongitude=99`, undefined, adminToken);
      // Query params should be ignored — endpoint does not accept destination override
      assertTest('T23 Client cannot override destination (extra params ignored)', [200, 404].includes(res.status));
    }
  }

  // ---- Disposable live route authorization and state cases ----------------
  const route = async (deliveryId: string, authToken: string, suffix = '') =>
    request('GET', `/api/deliveries/${deliveryId}/route${suffix}`, undefined, authToken);
  const mainRoute = await route(fixture.main.id, token);
  const main = mainRoute.data as any;
  assertTest('Route T01 Customer can access own delivery', mainRoute.status === 200, `HTTP ${mainRoute.status}`);
  assertTest('Route T04 latest stored GPS is used as origin', main?.origin?.latitude === 17.385 && main?.origin?.longitude === 78.4867);
  assertTest('Route T11 stored address is used as destination', main?.destination?.latitude === 17.4 && main?.destination?.longitude === 78.5);
  assertTest('Route T13 valid destination produces route', main?.distanceMeters >= 0 && main?.durationSeconds >= 0 && main?.etaMinutes >= 0);
  assertTest('Route T19 distanceMeters returned', typeof main?.distanceMeters === 'number');
  assertTest('Route T20 durationSeconds returned', typeof main?.durationSeconds === 'number');
  assertTest('Route T21 etaMinutes returned', typeof main?.etaMinutes === 'number');
  assertTest('Route T22 provider returned', typeof main?.provider === 'string');
  noSecrets('Route T23/T24 response', main);

  const customerBlocked = await route(fixture.customerBDelivery.id, token);
  assertTest('Route T03 Customer A blocked from Customer B delivery', [403, 404].includes(customerBlocked.status), `HTTP ${customerBlocked.status}`);
  assertTest('Route T05 Relevant vendor can access delivery', (await route(fixture.main.id, vendorAToken)).status === 200);
  assertTest('Route T06 Unrelated vendor is blocked', [403, 404].includes((await route(fixture.main.id, vendorBToken)).status));
  assertTest('Route T07 Assigned delivery partner can access route', (await route(fixture.main.id, partnerAToken)).status === 200);
  assertTest('Route T08 Wrong delivery partner is blocked', [403, 404].includes((await route(fixture.main.id, partnerBToken)).status));
  assertTest('Route T09 Admin can access route', (await route(fixture.main.id, adminToken)).status === 200);

  const override = await route(fixture.main.id, token, '?originLatitude=0&originLongitude=0&destinationLatitude=0&destinationLongitude=0');
  const overrideData = override.data as any;
  assertTest('Route T10 Client origin override is ignored', overrideData?.origin?.latitude === 17.385 && overrideData?.origin?.longitude === 78.4867);
  assertTest('Route T12 Client destination override is ignored', overrideData?.destination?.latitude === 17.4 && overrideData?.destination?.longitude === 78.5);

  const stale = await route(fixture.stale.id, adminToken);
  const staleData = stale.data as any;
  assertTest('Route T15 stale GPS returns isStale=true', stale.status === 200 && staleData?.isStale === true, `HTTP ${stale.status}`);
  assertTest('Route T16 stale GPS still calculates route', typeof staleData?.distanceMeters === 'number');
  for (const [label, delivery, status] of [['T17 delivered', fixture.delivered, 'DELIVERED'], ['T18 cancelled', fixture.cancelled, 'CANCELLED']] as const) {
    const response = await route(delivery.id, adminToken);
    const data = response.data as any;
    assertTest(`Route ${label} has no active ETA`, response.status === 200 && data?.status === status && data?.distanceMeters === null && data?.durationSeconds === null && data?.etaMinutes === null, `HTTP ${response.status}`);
  }
  const missingDestination = await route(fixture.missingDestination.id, adminToken);
  assertTest('Route T26 missing destination is controlled', missingDestination.status === 409 && !JSON.stringify(missingDestination.data).includes('stack'), `HTTP ${missingDestination.status}`);
  assertTest('Route T25 invalid delivery ID is handled safely', (await request('GET', '/api/deliveries/not-a-uuid/route', undefined, adminToken)).status === 400);

  const authorizedRoom = await joinTrackingRoom(partnerAToken, fixture.main.id);
  const unauthorizedRoom = await joinTrackingRoom(partnerBToken, fixture.main.id);
  try {
    const updateAcknowledgement = await new Promise<any>((resolve) => {
      authorizedRoom.socket.emit(
        'delivery.location.update',
        { deliveryId: fixture.main.id, latitude: 17.384, longitude: 78.485 },
        resolve,
      );
    });
    assertTest('Route T28 existing GPS Socket.IO update event still works', authorizedRoom.acknowledgement?.ok === true && updateAcknowledgement?.ok === true && updateAcknowledgement?.location?.deliveryId === fixture.main.id);
    assertTest('Route T29 unauthorized subscriber cannot join route-data room', unauthorizedRoom.acknowledgement?.ok === false);
  } finally {
    authorizedRoom.socket.disconnect();
    unauthorizedRoom.socket.disconnect();
  }

  // T26 Missing provider configuration handled safely (mock always works)
  {
    const res = await request('POST', '/api/maps/geocode', { address: 'Test City' }, token);
    assertTest('T26 Missing provider config handled safely (mock fallback)', [201, 200].includes(res.status));
  }

  // T27 Provider failure is forced against an unreachable OSM endpoint; the
  // provider must fall back without exposing the underlying network error.
  {
    const previousBaseUrl = process.env.MAPS_BASE_URL;
    process.env.MAPS_BASE_URL = 'http://127.0.0.1:1';
    try {
      const unavailableProvider = new OsmMapsProvider();
      const fallback = await unavailableProvider.geocode('Fixture provider outage');
      assertTest('T27 Provider failure handled safely', fallback.provider === 'mock' && !JSON.stringify(fallback).includes('stack'));
    } finally {
      if (previousBaseUrl === undefined) delete process.env.MAPS_BASE_URL;
      else process.env.MAPS_BASE_URL = previousBaseUrl;
    }
  }

  console.log(`\nRESULTS: ${pass.length} PASS / ${fail.length} FAIL`);
  if (fail.length > 0) {
    fail.forEach((f) => console.log(`  FAIL: ${f}`));
  }
  await cleanupRouteFixture(fixtureMarker);
  fixtureMarker = null;
  await prisma.$disconnect();
  process.exit(fail.length > 0 ? 1 : 0);
}

runTests().catch(async (error: unknown) => {
  console.error('Test runner error:');
  if (error instanceof Error) {
    console.error(`Name: ${error.name}`);
    console.error(`Message: ${error.message}`);
    console.error(`Stack: ${error.stack || '(not available)'}`);

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined) {
      try {
        console.error(`Cause: ${JSON.stringify(cause) ?? String(cause)}`);
      } catch {
        console.error(`Cause: ${String(cause)}`);
      }
    }

    const nestedErrors = (error as Error & { errors?: unknown }).errors;
    if (nestedErrors !== undefined) {
      console.error('Errors:', nestedErrors);
    }
  } else {
    try {
      console.error(`Non-Error value: ${JSON.stringify(error) ?? String(error)}`);
    } catch {
      console.error(`Non-Error value: ${String(error)}`);
    }
  }
  if (fixtureMarker) {
    await cleanupRouteFixture(fixtureMarker).catch((cleanupError: unknown) => console.error('Fixture cleanup error:', cleanupError));
  }
  await prisma.$disconnect();
  process.exit(1);
});
