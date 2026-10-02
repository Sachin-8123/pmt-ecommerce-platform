# Protection My Time (PMT)

> Protection My Time (PMT) is a multi-vendor e-commerce, delivery, shop management and referral/affiliate platform.

Project layout (initial scaffold):

PMT/
  frontend/
    customer-web/
  backend/
    api/
  mobile/
    customer-app/
    delivery-app/
  database/
  docs/

Tech stack (initial):
- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, NestJS, TypeScript
- Database: PostgreSQL, Prisma ORM

Getting started

1. Install dependencies for frontend and backend separately.

- Frontend (customer web):
  ```bash
  cd frontend/customer-web
  npm install
  npm run dev
  ```

- Backend (API):
  ```bash
  cd backend/api
  npm install
  npm run dev
  ```

Environment

- Copy the root `.env.example` to `.env` and fill in values for `DATABASE_URL`, `JWT_SECRET`, `PORT`, and `FRONTEND_URL`.

Health check

- After starting the backend, test: `GET /api/health` (default port 5000).

Database (PostgreSQL + Prisma)

- Requirement: Install PostgreSQL (12+). On Windows use the official installer or `choco install postgresql`.
- Create a database for PMT, for example `pmt_dev`:

```bash
# Linux / macOS
createdb pmt_dev

# Windows (PowerShell with psql in PATH)
psql -c "CREATE DATABASE pmt_dev;"
```

- Configure `DATABASE_URL` in `.env` (copy from `.env.example`) using the format:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/pmt_dev
```

- Run Prisma migration (creates SQL migration files and applies them):

```bash
cd backend/api
npx prisma migrate dev --name init
```

- Generate Prisma Client (after schema changes):

```bash
npx prisma generate
```

- If you do not have a local PostgreSQL instance, skip `migrate` — do not run destructive commands like `prisma migrate reset`.


Notes

- This repo only contains the initial scaffold for the frontend and backend. No production secret values are included.
# Protection My Time (PMT)

Protection My Time (PMT) is a production-ready full-stack foundation for a multi-vendor e-commerce, delivery, shop management and referral/affiliate platform.

This repository contains the initial project architecture and development environment scaffolding for PMT. It does not implement business features (auth, products, payments, delivery workflows) yet — only the initial apps and configuration needed to start development.

Project structure

PMT/
  frontend/
    customer-web/    # Next.js (TypeScript + Tailwind) customer-facing web app
    vendor-web/      # (placeholder) vendor web app
    admin-web/       # (placeholder) admin web app

  backend/
    api/             # NestJS backend API (TypeScript) + Prisma (Postgres)

  mobile/
    customer-app/    # (placeholder) mobile app
    delivery-app/    # (placeholder) delivery mobile app

  database/          # (placeholder) DB scripts/migrations
  docs/              # documentation

Technologies

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: Node.js, NestJS, TypeScript
- Database: PostgreSQL, Prisma ORM

What was created in this initial step

- A Next.js TypeScript + Tailwind scaffold for the customer web app (frontend/customer-web)
- A NestJS-style TypeScript API scaffold (backend/api) with a health-check route
- Prisma initialization (prisma/schema.prisma) in the backend
- .env.example files with placeholders for secrets and database URLs
- README and .gitignore files

Install and run (high-level)

1) Frontend (customer-web)
  - cd frontend/customer-web
  - npm install
  - npm run dev
  - Open http://localhost:3000 (defaults)

2) Backend (api)
  - cd backend/api
  - npm install
  - npm run start:dev
  - The backend listens on PORT (env) or default 5000
  - Health-check: GET http://localhost:5000/api/health

Notes

- No secrets or real credentials are stored. Use the provided .env.example files to create your own .env files locally.
- This scaffold focuses on clean production-style organization and independent run of frontend and backend.
- Next steps: add authentication, database models, Prisma migrations, Redis, WebSockets, S3 integration, payment providers, mobile apps, and Dockerization.

## Maps, geocoding, and ETA

The API exposes a provider-agnostic maps layer. `MapsService` depends on the `MapsProvider` interface, so Google, Mapbox, or a road-routing provider can be added without changing delivery logic. The configured provider is selected with `MAPS_PROVIDER`.

- `mock` (the default) makes no network calls. It uses deterministic development coordinates, Haversine distance, and a clearly labelled straight-line ETA estimate.
- `osm` uses Nominatim for geocoding and reverse geocoding. Results are cached in-process for five minutes; distance and route remain explicitly labelled Haversine estimates because Nominatim is not a routing service. Configure `MAPS_BASE_URL` only when using a compatible OSM endpoint.
- `MAPS_API_KEY` is reserved for future authenticated adapters and is never returned by the API.

All maps routes require JWT authentication:

- `POST /api/maps/geocode` with `{ "address": "..." }`
- `GET /api/maps/reverse-geocode?latitude=...&longitude=...`
- `GET /api/maps/distance?originLatitude=...&originLongitude=...&destinationLatitude=...&destinationLongitude=...`
- `GET /api/maps/route?originLatitude=...&originLongitude=...&destinationLatitude=...&destinationLongitude=...`
- `GET /api/deliveries/:id/eta`

Delivery ETA reuses the delivery tracking authorization rules and always derives the destination from the stored order address. It returns the last recorded GPS point and flags stale locations; inactive deliveries, missing locations, and addresses without coordinates return a safe response without inventing an ETA.

### Live delivery route

`GET /api/deliveries/:id/route` is authenticated and uses the same delivery authorization rules as tracking and ETA. It never accepts client-supplied origin or destination coordinates: the origin is the latest `DeliveryLocation`, while the destination is the delivery order's stored `Address` coordinates.

The response includes route distance, duration, ETA, provider, status, and `isStale`. A stale GPS point is returned and still used for a route estimate, with a note that the ETA is stale. Active deliveries without a GPS point return `origin: null` and no ETA. Inactive deliveries (including delivered and cancelled) retain their last known origin but do not calculate a live route. Missing stored destination coordinates return a controlled conflict response so the address can be geocoded.

After an authorized client receives the existing `delivery.location.updated` Socket.IO event, which already contains `deliveryId`, it can request this endpoint to refresh route data. The server does not calculate or broadcast routes on every GPS event. Mock and OSM-estimate providers remain straight-line estimates, not road routes; a future road-routing provider can be added behind `MapsService`.

Run the live maps checks after starting the API with `npm run test:maps` from `backend/api`. The delivery authorization checks require delivery fixtures in the configured test database.

