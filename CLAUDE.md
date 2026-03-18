# LinkedIn Connections Notifier

Fetches new LinkedIn connections and sends a weekly Slack summary.

## Commands

- `npm start` — run the persistent scheduler (dev, uses tsx)
- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — type-check without emitting

## Architecture

- `config.json` — all client-specific settings (schedule, limits, client name). Only file that changes per client.
- `src/config.ts` — loads and validates config.json, exports typed config + cron expression builders
- `src/index.ts` — persistent entry point with node-cron scheduling driven by config.json
- `src/linkedin.ts` — LinkedIn Voyager API client (uses li_at cookie)
- `src/store.ts` — tracks seen connections in `data/seen-connections.json` (DATA_DIR configurable via env)
- `src/slack.ts` — sends formatted message via Slack Incoming Webhook

## Environment

- `LINKEDIN_LI_AT` and `SLACK_WEBHOOK_URL` required (see `.env.example`)
- Optional `DATA_DIR` for persistent storage path (defaults to `./data`)
- The `li_at` cookie expires periodically — refresh from browser when API calls fail

## Deployment (Railway)

- `Procfile` defines worker process: `worker: node dist/index.js`
- Set env vars in Railway dashboard (do not use `.env` in production)
- Attach a Railway Volume and set `DATA_DIR` to its mount path (e.g. `/data`) for persistent `seen-connections.json`
- Build: Railway runs `npm run build` automatically via the `build` script
