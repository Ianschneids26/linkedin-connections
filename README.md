# LinkedIn Connections Notifier

Monitors a LinkedIn account for new connections and sends real-time Slack notifications. Includes an optional weekly recap.

## What this app does

- Polls LinkedIn on a configurable interval (default: every 30 minutes) for newly accepted connections
- Sends a formatted Slack message for each batch of new connections, including name, headline, company, and profile link
- Optionally sends a weekly recap summarizing all connections from the past 7 days
- Tracks seen connections locally so duplicates are never reported

## Setup instructions for a new client

1. **Duplicate this repo** on GitHub (use "Use this template" or fork it)
2. Edit `config.json` with the client's settings:

   ```json
   {
     "client_name": "Acme Corp",
     "slack_channel": "#linkedin-daily-acceptances",
     "polling_interval_minutes": 30,
     "weekly_recap_enabled": true,
     "weekly_recap_day": "Monday",
     "weekly_recap_time_utc": "06:00",
     "max_connections_to_fetch": 40
   }
   ```

   | Field | Description |
   |---|---|
   | `client_name` | Label used in log output |
   | `slack_channel` | Reference only — the actual channel is determined by the Slack webhook |
   | `polling_interval_minutes` | How often to check for new connections |
   | `weekly_recap_enabled` | Set `false` to disable the weekly recap |
   | `weekly_recap_day` | Day of week for the recap (e.g. `"Monday"`) |
   | `weekly_recap_time_utc` | Time in UTC for the recap (e.g. `"06:00"`) |
   | `max_connections_to_fetch` | Number of recent connections to fetch per poll |

3. Set environment variables (see below)
4. Deploy to Railway

## How to get the li_at cookie

1. Log in to [linkedin.com](https://www.linkedin.com) in your browser
2. Open DevTools (`F12` or `Cmd+Option+I`)
3. Go to **Application** > **Cookies** > `https://www.linkedin.com`
4. Find the cookie named `li_at` and copy its value
5. Set it as the `LINKEDIN_LI_AT` environment variable

> The `li_at` cookie expires periodically. When it does, the app will send a Slack alert. Grab a fresh cookie and update the environment variable.

## How to deploy to Railway

1. Connect this repo to a new Railway project
2. In the Railway dashboard, add these environment variables:

   | Variable | Required | Description |
   |---|---|---|
   | `LINKEDIN_LI_AT` | Yes | LinkedIn session cookie |
   | `SLACK_WEBHOOK_URL` | Yes | Slack Incoming Webhook URL |
   | `DATA_DIR` | No | Path to persistent storage (default: `./data`) |

3. Create a **Railway Volume** and mount it (e.g. at `/data`), then set `DATA_DIR=/data` so that `seen-connections.json` survives redeploys
4. Railway auto-detects the `build` script and `Procfile` — no further config needed

## How to update config.json for a new client

Only `config.json` and environment variables need to change per client. No code files need editing.

1. Update `config.json` with the client's name, schedule preferences, and polling settings
2. Set `LINKEDIN_LI_AT` to the client's LinkedIn session cookie
3. Set `SLACK_WEBHOOK_URL` to the client's Slack workspace webhook
4. Commit, push, and Railway will redeploy automatically
