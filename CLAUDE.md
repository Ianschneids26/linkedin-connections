# LinkedIn Connections Notifier

Fetches new LinkedIn connections and sends a weekly Slack summary.

## Commands

- `npm start` — run the script (fetches connections, notifies Slack)
- `npm run typecheck` — type-check without emitting

## Architecture

- `src/index.ts` — entry point, orchestrates the pipeline
- `src/linkedin.ts` — LinkedIn Voyager API client (uses li_at cookie)
- `src/store.ts` — tracks seen connections in `data/seen-connections.json`
- `src/slack.ts` — sends formatted message via Slack Incoming Webhook

## Environment

- `.env` with `LINKEDIN_LI_AT` and `SLACK_WEBHOOK_URL` (see `.env.example`)
- The `li_at` cookie expires periodically — refresh from browser when API calls fail

## Scheduling

- `com.linkedin-connections.daily.plist` — macOS launchd job, runs at 4 PM daily
- `com.linkedin-connections.daily-recap.plist` — macOS launchd job, sends weekly Slack recap every Monday at 6 AM
- Install: `cp com.linkedin-connections.daily.plist com.linkedin-connections.daily-recap.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.linkedin-connections.daily.plist ~/Library/LaunchAgents/com.linkedin-connections.daily-recap.plist`
