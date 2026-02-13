import "dotenv/config";
import { fetchRecentConnections } from "./linkedin.js";
import { filterNewConnections, markAsSeen } from "./store.js";
import { sendSlackMessage, sendSlackText } from "./slack.js";
import { withRetry } from "./retry.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function poll(liAt: string, webhookUrl: string): Promise<void> {
  let all;
  try {
    all = await withRetry(() => fetchRecentConnections(liAt), {
      label: "LinkedIn fetch",
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("JSESSIONID")
    ) {
      console.error("LinkedIn auth failed:", msg);
      await sendSlackText(
        webhookUrl,
        "⚠️ LinkedIn connection sync failed — your `li_at` cookie has likely expired. Grab a fresh one from your browser and update `.env`.",
      );
      // Stop polling — auth won't fix itself
      process.exit(1);
    }
    if (msg.includes("429")) {
      console.error("LinkedIn rate limited:", msg);
      await sendSlackText(
        webhookUrl,
        "⚠️ LinkedIn connection sync is being rate limited. Polling will continue but results may be delayed.",
      );
      return;
    }
    // Network errors etc. — log and try again next cycle
    console.error("Poll failed:", msg);
    return;
  }

  const newConnections = filterNewConnections(all);

  if (newConnections.length === 0) return;

  console.log(`${newConnections.length} new connection(s) detected`);
  await withRetry(() => sendSlackMessage(webhookUrl, newConnections), {
    label: "Slack send",
  });
  markAsSeen(newConnections);
}

async function main(): Promise<void> {
  const liAt = process.env.LINKEDIN_LI_AT;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!liAt) {
    console.error("Missing LINKEDIN_LI_AT in .env");
    process.exit(1);
  }
  if (!webhookUrl) {
    console.error("Missing SLACK_WEBHOOK_URL in .env");
    process.exit(1);
  }

  console.log(
    `Watching for new LinkedIn connections (polling every ${POLL_INTERVAL_MS / 60000} min)...`,
  );

  // Run immediately on start, then on interval
  await poll(liAt, webhookUrl);

  setInterval(() => {
    poll(liAt, webhookUrl).catch((err) => {
      console.error("Unhandled poll error:", err);
    });
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
