# LinkedIn Connections Notifier

Fetches new LinkedIn connections and sends a weekly Slack summary. Multi-tenant — supports multiple clients via a SQLite database.

## Commands

- `npm start` — run the persistent scheduler (dev, uses tsx)
- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — type-check without emitting

## Architecture

- `config.json` — shared settings (schedule, limits). Only file that changes per deployment.
- `src/config.ts` — loads and validates config.json, exports typed config + cron expression builders
- `src/db.ts` — SQLite database (better-sqlite3) with `clients` table for multi-tenant client management
- `src/admin.ts` — Express admin API (Basic auth) for CRUD on clients
- `src/index.ts` — persistent entry point with node-cron scheduling; loops through all active clients per cycle
- `src/linkedin.ts` — LinkedIn Voyager API client (uses li_at cookie, passed as parameter)
- `src/store.ts` — tracks seen connections per client in `data/seen-connections-{clientId}.json` (DATA_DIR configurable via env)
- `src/slack.ts` — sends formatted message via Slack Incoming Webhook (URL passed as parameter)

## Environment

- `ADMIN_PASSWORD` required for admin API endpoints
- `ANTHROPIC_API_KEY` required for AI-generated DM suggestions
- Optional `SLACK_BOT_TOKEN` for interactive Slack features (edit modal, hiring channel check)
- Optional `DATA_DIR` for persistent storage path (defaults to `./data`)
- Optional `LINKEDIN_LI_AT` + `SLACK_WEBHOOK_URL` for legacy single-tenant mode (runs alongside DB clients)

## Admin API

All endpoints require `Authorization: Basic base64(user:ADMIN_PASSWORD)` (username can be anything).

- `GET /admin/clients` — list all clients
- `POST /admin/clients` — add client (body: `{ name, email, li_cookie, slack_webhook }`)
- `PUT /admin/clients/:id` — update client fields (body: any subset of `{ name, email, li_cookie, slack_webhook, active }`)

## Deployment (Railway)

- `Procfile` defines worker process: `worker: node dist/index.js`
- Set env vars in Railway dashboard (do not use `.env` in production)
- Attach a Railway Volume and set `DATA_DIR` to its mount path (e.g. `/data`) for persistent DB + seen-connections files
- Build: Railway runs `npm run build` automatically via the `build` script
