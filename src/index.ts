import "dotenv/config";
import cron from "node-cron";
import { config, pollingCron, recapCron } from "./config.js";
import { fetchRecentConnections } from "./linkedin.js";
import { filterNewConnections, markAsSeen, getConnectionsSince } from "./store.js";
import { sendSlackMessage, sendSlackText, sendRecapMessage, type ConnectionWithDM } from "./slack.js";
import { generateOutreachDM } from "./outreach.js";
import { withRetry } from "./retry.js";
import { startInteractionServer } from "./interactions.js";
import { isFlaggedInHiringChannel } from "./hiring-match.js";
import { getActiveClients, type Client } from "./db.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Legacy single-tenant env vars (still supported as fallback)
const legacyLiAt = process.env.LINKEDIN_LI_AT;
const legacyWebhookUrl = process.env.SLACK_WEBHOOK_URL;

async function checkConnectionsForClient(
  clientLabel: string,
  liAt: string,
  webhookUrl: string,
  clientId?: number,
): Promise<void> {
  console.log(`[${new Date().toISOString()}] [${clientLabel}] Checking for new connections...`);

  let all;
  try {
    all = await withRetry(
      () => fetchRecentConnections(liAt, config.max_connections_to_fetch),
      { label: `LinkedIn fetch (${clientLabel})` },
    );
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("rate limited")) {
      console.error(`[${clientLabel}] Rate limited, will retry next cycle:`, msg);
      return;
    }
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("auth redirect") ||
      msg.includes("JSESSIONID")
    ) {
      console.error(`[${clientLabel}] LinkedIn auth failed:`, msg);
      await sendSlackText(
        webhookUrl,
        `\u26a0\ufe0f LinkedIn connection sync failed for ${clientLabel} \u2014 the \`li_at\` cookie has likely expired. Grab a fresh one from your browser and update it.`,
      );
    } else {
      console.error(`[${clientLabel}] Poll failed:`, msg);
    }
    return;
  }

  const newConnections = filterNewConnections(all, clientId);

  if (newConnections.length === 0) {
    console.log(`[${clientLabel}] No new connections`);
    return;
  }

  console.log(`[${clientLabel}] ${newConnections.length} new connection(s) detected`);

  const connectionsWithDMs: ConnectionWithDM[] = await Promise.all(
    newConnections.map(async (c) => {
      let suggestedDM = "";
      const flagged = await isFlaggedInHiringChannel(c.firstName, c.lastName, c.profileUrl);
      if (flagged) {
        try {
          suggestedDM = await generateOutreachDM(c);
          console.log(`[${clientLabel}] Generated DM for ${c.firstName} ${c.lastName} (flagged in hiring channel)`);
        } catch (err: any) {
          console.error(`[${clientLabel}] Failed to generate DM for ${c.firstName} ${c.lastName}:`, err?.message);
        }
      } else {
        console.log(`[${clientLabel}] ${c.firstName} ${c.lastName} — not flagged, skipping DM`);
      }
      return { ...c, suggestedDM };
    }),
  );

  await withRetry(() => sendSlackMessage(webhookUrl, connectionsWithDMs), {
    label: `Slack send (${clientLabel})`,
  });
  markAsSeen(newConnections, clientId);
}

async function weeklyRecapForClient(
  clientLabel: string,
  webhookUrl: string,
  clientId?: number,
): Promise<void> {
  console.log(`[${new Date().toISOString()}] [${clientLabel}] Sending weekly recap...`);

  const since = Date.now() - SEVEN_DAYS_MS;
  const connections = getConnectionsSince(since, clientId);

  console.log(`[${clientLabel}] Recap: ${connections.length} connection(s) in the last 7 days`);
  await sendRecapMessage(webhookUrl, connections);
  console.log(`[${clientLabel}] Recap sent to Slack`);
}

async function checkAllClients(): Promise<void> {
  const clients = getActiveClients();

  if (clients.length > 0) {
    for (const client of clients) {
      try {
        await checkConnectionsForClient(client.name, client.li_cookie, client.slack_webhook, client.id);
      } catch (err: any) {
        console.error(`[${client.name}] Connection check error:`, err?.message);
      }
    }
  }

  // Legacy fallback: if env vars are set, run for them too
  if (legacyLiAt && legacyWebhookUrl) {
    try {
      await checkConnectionsForClient(config.client_name, legacyLiAt, legacyWebhookUrl);
    } catch (err: any) {
      console.error(`[${config.client_name}] Connection check error:`, err?.message);
    }
  }
}

async function recapAllClients(): Promise<void> {
  const clients = getActiveClients();

  if (clients.length > 0) {
    for (const client of clients) {
      try {
        await weeklyRecapForClient(client.name, client.slack_webhook, client.id);
      } catch (err: any) {
        console.error(`[${client.name}] Weekly recap error:`, err?.message);
      }
    }
  }

  // Legacy fallback
  if (legacyLiAt && legacyWebhookUrl) {
    try {
      await weeklyRecapForClient(config.client_name, legacyWebhookUrl);
    } catch (err: any) {
      console.error(`[${config.client_name}] Weekly recap error:`, err?.message);
    }
  }
}

// --- Scheduling ---

const pollExpr = pollingCron();
cron.schedule(pollExpr, () => {
  checkAllClients().catch((err) =>
    console.error(`[${new Date().toISOString()}] Connection check error:`, err),
  );
});

if (config.weekly_recap_enabled) {
  const recapExpr = recapCron();
  cron.schedule(recapExpr, () => {
    recapAllClients().catch((err) =>
      console.error(`[${new Date().toISOString()}] Weekly recap error:`, err),
    );
  });
}

// Startup
startInteractionServer(Number(process.env.PORT) || 3000);

const dbClients = getActiveClients();
console.log(`LinkedIn Connections notifier started`);
console.log(`  - ${dbClients.length} active client(s) in database`);
if (legacyLiAt && legacyWebhookUrl) {
  console.log(`  - Legacy env client: ${config.client_name}`);
}
console.log(`  - Connection check: every ${config.polling_interval_minutes} minutes`);
if (config.weekly_recap_enabled) {
  console.log(`  - Weekly recap: ${config.weekly_recap_day}s at ${config.weekly_recap_time_utc} UTC`);
} else {
  console.log("  - Weekly recap: disabled");
}

checkAllClients().catch((err) =>
  console.error(`[${new Date().toISOString()}] Initial check error:`, err),
);
