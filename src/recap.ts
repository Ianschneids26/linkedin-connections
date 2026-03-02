import "dotenv/config";
import { getConnectionsSince } from "./store.js";
import { sendRecapMessage } from "./slack.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("Missing SLACK_WEBHOOK_URL in .env");
    process.exit(1);
  }

  const since = Date.now() - SEVEN_DAYS_MS;
  const connections = getConnectionsSince(since);

  console.log(`Recap: ${connections.length} connection(s) in the last 7 days`);
  await sendRecapMessage(webhookUrl, connections);
  console.log("Recap sent to Slack");
}

main().catch((err) => {
  console.error("Recap failed:", err);
  process.exit(1);
});
