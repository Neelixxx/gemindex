# Production Deploy (Managed Postgres + Redis + Cron)

## Target Architecture

- `gemindex-web` Next.js app service
- `gemindex-worker` background worker service (`npm run worker`)
- managed Postgres (`DATABASE_URL`)
- managed Redis (`REDIS_URL`)
- scheduled cron tick hitting `/api/jobs/worker`

## Render Blueprint

Use `infra/render/render.yaml` to provision:

- web service
- worker service
- cron service
- managed Postgres
- managed Redis key-value

## Deploy Steps

1. Push this repository to GitHub.
2. In Render, create a new Blueprint and point to `infra/render/render.yaml`.
3. Set required env vars in Render:
   - `POKEMONTCG_API_KEY`
   - `TCGPLAYER_PUBLIC_KEY`
   - `TCGPLAYER_PRIVATE_KEY`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_PRO_MONTHLY`
   - `STRIPE_PRICE_ELITE_MONTHLY`
4. After first deploy, run Prisma migration against managed Postgres:
   - `npx prisma migrate deploy`
5. Verify health:
   - `GET /api/health`
6. Verify worker:
   - `POST /api/jobs/worker?token=<CRON_SECRET>`

## Stripe Setup

1. Create recurring Stripe Prices for Pro and Elite plans.
2. Copy the two Price IDs into:
   - `STRIPE_PRICE_PRO_MONTHLY`
   - `STRIPE_PRICE_ELITE_MONTHLY`
3. In Stripe Dashboard, add webhook endpoint:
   - `https://<your-app-domain>/api/billing/webhook`
4. Subscribe webhook events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## CI/CD

- `.github/workflows/deploy-render.yml` runs lint/test/build and triggers deploy hooks.
- `.github/workflows/cron-worker.yml` can be used as external scheduler fallback.
