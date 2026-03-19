import "dotenv/config";
import cron from "node-cron";
import { config, pollingCron, recapCron } from "./config.js";
import { fetchRecentConnections } from "./linkedin.js";
import { filterNewConnections, markAsSeen, getConnectionsSince } from "./store.js";
import { sendSlackMessage, sendSlackText, sendRecapMessage, type ConnectionWithDM } from "./slack.js";
import { generateOutreachDM } from "./outreach.js";
import { withRetry } from "./retry.js";
import { startInteractionServer } from "./interactions.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const liAt = process.env.LINKEDIN_LI_AT;
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!liAt) {
  console.error("Missing LINKEDIN_LI_AT environment variable");
  process.exit(1);
}
if (!webhookUrl) {
  console.error("Missing SLACK_WEBHOOK_URL environment variable");
  process.exit(1);
}

async function checkConnections(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Checking for new connections...`);

  let all;
  try {
    all = await withRetry(
      () => fetchRecentConnections(liAt!, config.max_connections_to_fetch),
      { label: "LinkedIn fetch" },
    );
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("rate limited")) {
      console.error("Rate limited, will retry next cycle:", msg);
      return;
    }
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("auth redirect") ||
      msg.includes("JSESSIONID")
    ) {
      console.error("LinkedIn auth failed:", msg);
      await sendSlackText(
        webhookUrl!,
        "\u26a0\ufe0f LinkedIn connection sync failed \u2014 your `li_at` cookie has likely expired. Grab a fresh one from your browser and update the `LINKEDIN_LI_AT` environment variable.",
      );
    } else {
      console.error("Poll failed:", msg);
    }
    return;
  }

  const newConnections = filterNewConnections(all);

  if (newConnections.length === 0) {
    console.log("No new connections");
    return;
  }

  console.log(`${newConnections.length} new connection(s) detected`);

  const connectionsWithDMs: ConnectionWithDM[] = await Promise.all(
    newConnections.map(async (c) => {
      let suggestedDM = "";
      try {
        suggestedDM = await generateOutreachDM(c);
        console.log(`Generated DM for ${c.firstName} ${c.lastName}`);
      } catch (err: any) {
        console.error(`Failed to generate DM for ${c.firstName} ${c.lastName}:`, err?.message);
      }
      return { ...c, suggestedDM };
    }),
  );

  await withRetry(() => sendSlackMessage(webhookUrl!, connectionsWithDMs), {
    label: "Slack send",
  });
  markAsSeen(newConnections);
}

async function weeklyRecap(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Sending weekly recap...`);

  const since = Date.now() - SEVEN_DAYS_MS;
  const connections = getConnectionsSince(since);

  console.log(`Recap: ${connections.length} connection(s) in the last 7 days`);
  await sendRecapMessage(webhookUrl!, connections);
  console.log("Recap sent to Slack");
}

// --- Scheduling ---

const pollExpr = pollingCron();
cron.schedule(pollExpr, () => {
  checkConnections().catch((err) =>
    console.error(`[${new Date().toISOString()}] Connection check error:`, err),
  );
});

if (config.weekly_recap_enabled) {
  const recapExpr = recapCron();
  cron.schedule(recapExpr, () => {
    weeklyRecap().catch((err) =>
      console.error(`[${new Date().toISOString()}] Weekly recap error:`, err),
    );
  });
}

// Startup
startInteractionServer(Number(process.env.PORT) || 3000);
console.log(`LinkedIn Connections notifier started for ${config.client_name}`);
console.log(`  - Connection check: every ${config.polling_interval_minutes} minutes`);
if (config.weekly_recap_enabled) {
  console.log(`  - Weekly recap: ${config.weekly_recap_day}s at ${config.weekly_recap_time_utc} UTC`);
} else {
  console.log("  - Weekly recap: disabled");
}

checkConnections().catch((err) =>
  console.error(`[${new Date().toISOString()}] Initial check error:`, err),
);
