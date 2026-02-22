# Operations Guide

## Health Checks

- `GET /api/health` returns status, storage mode, queue mode, counts, and worker heartbeat.
- Use this endpoint for uptime checks and cron watchdogs.

## Structured Logs

- API and worker logs are emitted via `pino`.
- Every request receives an `x-request-id` response header via `src/proxy.ts`.
- Use `x-request-id` when correlating API calls with worker/sync logs.

## Worker Modes

- In-process scheduler:
  - controlled by `SCHEDULER_TICK_MS`
  - disabled with `DISABLE_BACKGROUND_SCHEDULER=1`
- Dedicated worker process:
  - run with `npm run worker`
  - tick interval controlled by `WORKER_TICK_MS`

## Cron Trigger

- Call `POST /api/jobs/worker` with either:
  - admin session cookie, or
  - `x-cron-secret: <CRON_SECRET>` header (or `?token=<CRON_SECRET>` query).

## Storage Modes

- `DATABASE_URL` set to postgres URL:
  - app state stored in Prisma `AppState` row.
- otherwise:
  - app state stored at `data/gemindex-db.json`.
