# Gem Index

Gem Index is a Pokemon TCG analytics app for grading-aware investing.

## What is implemented

- PSA/TAG gem-rate analytics (`grade 10 / total graded`)
- Card-level metrics: price history, liquidity, scarcity, arbitrage, ROI
- Set-level metrics: total set value, ROI, volatility
- Card Index (S&P-style equal-weight basket)
- Scanner flow to add to collection or wishlist
- Portfolio tracking: raw, graded, sealed

## Added in this update

- Direct TCGplayer OAuth ingestion (beyond PokemonTCG passthrough):
  - OAuth token flow against TCGplayer API
  - group + product matching
  - direct market price ingestion into sales feed (`TCGPLAYER_DIRECT`)
- Background jobs with queue + scheduler:
  - recurring sync jobs stored in DB
  - queued one-off tasks
  - worker tick processing (manual, interval, or cron-triggered)
- Email verification + password reset flows:
  - verification token request + confirm
  - password reset token request + confirm
  - local email outbox for development/debug
- Billing tiers + feature gating:
  - `FREE`, `PRO`, `ELITE`
  - role + subscription entitlement checks in API and app UI
  - Stripe Checkout + Billing Portal + Webhook sync (with manual fallback in dev when Stripe keys are absent)

## Stack

- Next.js 16 + App Router + TypeScript
- Tailwind CSS v4
- Prisma + Postgres support, with file fallback (`data/gemindex-db.json`)
- BullMQ queue worker (optional Redis-backed)
- `bcryptjs` + `jose` for auth/session security

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Expo Go (Mobile Wrapper)

The `mobile/` folder is an Expo app that opens Gem Index in a native WebView.

1. Start Gem Index web app:
```bash
npm run dev
```
2. In another terminal, start Expo:
```bash
npm run mobile:start
```
3. Scan the Expo QR code with Expo Go.
4. In the mobile app URL bar:
   - Use your deployed URL, or
   - Use your computer LAN URL (example: `http://192.168.1.25:3000`), not `localhost`.

Optional env for Expo shell:
- `EXPO_PUBLIC_GEMINDEX_URL` (default URL loaded on startup)

## Tests

```bash
npm test
npm run test:e2e
```

## Default seeded admin

- Email: `demo@gemindex.local`
- Password: `demo1234`

## Environment variables

See `.env.example`.

Key ones:

- `SESSION_SECRET`
- `AUTH_REQUIRE_EMAIL_VERIFICATION` (optional override; production still enforces verification)
- `DATABASE_URL` (optional; if unset, file storage is used)
- `REDIS_URL` (optional; enables queue worker mode)
- `POKEMONTCG_API_KEY`
- `EUR_TO_USD_RATE`
- `TCGPLAYER_PUBLIC_KEY`
- `TCGPLAYER_PRIVATE_KEY`
- `TCGPLAYER_CATEGORY_ID` (default `3` for Pokemon)
- `TCGPLAYER_ACCESS_TOKEN` (optional passthrough header)
- `SCHEDULER_TICK_MS`
- `WORKER_TICK_MS`
- `WORKER_CONCURRENCY`
- `DISABLE_BACKGROUND_SCHEDULER`
- `CRON_SECRET`
- `APP_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `LOG_LEVEL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_ELITE_MONTHLY`

## Background sync architecture

- Recurring jobs are in `syncJobs`.
- One-off queued tasks are in `syncTasks`.
- Worker processes:
  - pending queued tasks
  - due recurring jobs
- In-process interval scheduler starts when authenticated API traffic initializes scheduler hooks.
- You can also call the worker route from external cron.

## Worker runtime

Run a dedicated worker process:

```bash
npm run worker
```

Run a single worker tick:

```bash
npm run worker:once
```

External cron trigger:

```bash
curl -X POST "http://localhost:3000/api/jobs/worker?token=$CRON_SECRET"
```

Operational runbook: `docs/OPERATIONS.md`
Deployment runbook: `docs/DEPLOY.md`

### Render sanity check

If your Render URL shows a "Create Next App" page, the service is pointing to the wrong repo/config.

- Expected app URL: `https://gemindex.onrender.com`
- Expected health endpoint: `https://gemindex.onrender.com/api/health` (JSON response, not 404)
- Correct Render commands:
  - Build: `npm ci && npm run build`
  - Start: `npm run start`
- Quick verification command:
  - `npm run verify:deploy -- https://gemindex.onrender.com`

## API routes

Public analytics:

- `GET /api/dashboard`
- `GET /api/cards`
- `GET /api/sets`
- `GET /api/health`

Auth/session:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/2fa/setup` (admin)
- `POST /api/auth/2fa/enable` (admin)
- `POST /api/auth/2fa/disable` (admin)

Email verification:

- `POST /api/auth/verify-email/request`
- `POST /api/auth/verify-email/confirm`

Password reset:

- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`

Billing:

- `GET /api/billing/status`
- `POST /api/billing/checkout`
- `POST /api/billing/subscribe`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`

Dev outbox (admin):

- `GET /api/auth/dev/outbox`

Portfolio (authenticated):

- `GET|POST /api/collection`
- `GET|POST /api/wishlist`
- `GET|POST /api/sealed`
- `POST /api/scanner`

Sync and jobs:

- `GET /api/sync/status`
- `POST /api/sync/catalog` (enqueue catalog task)
- `POST /api/sync/sales` (enqueue sales or direct TCGplayer task)
- `GET /api/jobs/status` (admin)
- `POST /api/jobs/enqueue` (admin)
- `POST /api/jobs/worker` (admin or cron secret)
- `POST /api/jobs/bootstrap` (admin)

## Local data file

- `data/gemindex-db.json`

Delete it to reset and reseed.
