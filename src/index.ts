import "dotenv/config";
import { fetchRecentConnections } from "./linkedin.js";
import { filterNewConnections, markAsSeen } from "./store.js";
import { sendSlackMessage, sendSlackText } from "./slack.js";
import { withRetry } from "./retry.js";

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

  let all;
  try {
    all = await withRetry(() => fetchRecentConnections(liAt), {
      label: "LinkedIn fetch",
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes("rate limited")) {
      console.error("Rate limited, will retry next cycle:", msg);
      process.exit(0);
    }
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("auth redirect") ||
      msg.includes("JSESSIONID")
    ) {
      console.error("LinkedIn auth failed:", msg);
      await sendSlackText(
        webhookUrl,
        "⚠️ LinkedIn connection sync failed — your `li_at` cookie has likely expired. Grab a fresh one from your browser and update `.env`.",
      );
    } else {
      console.error("Poll failed:", msg);
    }
    process.exit(1);
  }

  const newConnections = filterNewConnections(all);

  if (newConnections.length === 0) {
    console.log("No new connections");
    return;
  }

  console.log(`${newConnections.length} new connection(s) detected`);
  await withRetry(() => sendSlackMessage(webhookUrl, newConnections), {
    label: "Slack send",
  });
  markAsSeen(newConnections);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
